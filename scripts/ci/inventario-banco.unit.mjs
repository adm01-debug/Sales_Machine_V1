// Contrato de scripts/inventario/gerar-banco.mjs: le a resposta do banco.sql (psql ou MCP),
// cruza com o uso no codigo e grava inventario/estado/banco.json com orfas e alertas
// calculados — nada escrito a mao. Aqui so as funcoes puras; o SQL e validado contra o
// banco real por quem roda o script (CI semanal ou agente com MCP).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extrairInventario, contarUsoNoCodigo, montarInventario, compararEdges, conferirOrigem, LIMIARES, PARECE_CREDENCIAL,
  rodaTodoDia, versoesDoRepo, tabelasDosTypes, edgesNoRepo,
} from '../inventario/gerar-banco.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const tabela = (nome, extra = {}) => ({
  nome, rls: true, rls_forcado: false, policies: 1, triggers: 0, linhas: 0, linhas_exatas: true, bytes: 8192, citada_no_banco: false, ...extra,
});
const job = (nome, extra = {}) => ({
  nome, agenda: '* * * * *', ativo: true, chama: [], execucoes_24h: 1440, falhas_24h: 0, execucoes_7d: 100, falhas_7d: 0,
  startup_timeout_7d: 0, taxa_falha_7d_pct: 0, ultima_falha: null, duracao_max_s_7d: 1, ...extra,
});
const base = () => ({
  format_version: 1,
  medido_em: '2026-11-02T00:00:00Z',
  resumo: { tabelas_public: 3 },
  tabelas: [tabela('orfa'), tabela('citada', { citada_no_banco: true }), tabela('com_linhas', { linhas: 5 }), tabela('usada_no_front')],
  cron: { config: {}, jobs: [job('ok')], horas_paradas_7d: [], historico: { linhas: 10, mais_de_7_dias: 0, mais_antigo: null, bytes: 1 } },
});

test('extrairInventario aceita a resposta crua do MCP, o objeto direto e a linha do psql', () => {
  const dado = base();
  assert.equal(extrairInventario({ rows: [{ inventario: dado }] }).medido_em, dado.medido_em);
  assert.equal(extrairInventario(JSON.stringify({ rows: [{ inventario: dado }] })).tabelas.length, 4);
  assert.equal(extrairInventario(JSON.stringify(dado) + '\n').tabelas.length, 4);
  assert.equal(extrairInventario({ rows: [{ inventario: JSON.stringify(dado) }] }).tabelas.length, 4);
  assert.equal(extrairInventario([{ inventario: dado }]).tabelas.length, 4, 'formato da Management API: array de linhas');
  const envelope = { jsonrpc: '2.0', result: { content: [{ type: 'text', text: JSON.stringify({ rows: [{ inventario: dado }] }) }] } };
  assert.equal(extrairInventario(JSON.stringify(envelope)).tabelas.length, 4, 'envelope cru de tools/call do MCP');
});

test('extrairInventario recusa entrada incompleta, vazia ou de outra versao', () => {
  assert.throws(() => extrairInventario({ rows: [{ inventario: { format_version: 1 } }] }), /sem as chaves/);
  assert.throws(() => extrairInventario({ ...base(), format_version: 2 }), /format_version 2/);
  assert.throws(() => extrairInventario({ ...base(), tabelas: [] }), /sem tabelas/);
  assert.throws(() => extrairInventario('nao e json'));
});

test('orfa = 0 linhas, nao citada no banco e sem .from() no codigo', () => {
  const uso = { usada_no_front: { src: 2, edges: 0 } };
  const inv = montarInventario(base(), uso);
  assert.deepEqual(inv.tabelas_orfas.lista, ['orfa']);
  assert.deepEqual(inv.tabelas.find((t) => t.nome === 'usada_no_front').uso_no_codigo, { src: 2, edges: 0 });
  assert.deepEqual(inv.tabelas.find((t) => t.nome === 'orfa').uso_no_codigo, { src: 0, edges: 0 });
});

test('sem problema nenhum, nenhum alerta', () => {
  assert.deepEqual(montarInventario(base(), {}).alertas, []);
});

test('alertas: sem RLS, cron falhando, cron parado, historico sem limpeza, WhatsApp desconectado', () => {
  const dado = base();
  dado.tabelas[2].rls = false;
  dado.cron.jobs.push(job('ruim', { taxa_falha_7d_pct: LIMIARES.taxaFalhaCronPct }));
  dado.cron.jobs.push(job('ruim-mas-inativo', { ativo: false, taxa_falha_7d_pct: 90 }));
  dado.cron.horas_paradas_7d = [{ hora: '2026-10-31T04:00Z', execucoes: 10, falhas: 9 }];
  dado.cron.historico.mais_de_7_dias = LIMIARES.historicoCronMaisDe7Dias + 1;
  const tipos = Object.fromEntries(montarInventario(dado, {}).alertas.map((a) => [a.tipo, a.detalhe]));
  assert.deepEqual(tipos.tabela_sem_rls, ['com_linhas']);
  assert.deepEqual(tipos.cron_falhando, [`ruim (${LIMIARES.taxaFalhaCronPct}% em 7d)`]);
  assert.deepEqual(tipos.cron_parado, ['2026-10-31T04:00Z']);
  assert.match(tipos.historico_cron_sem_limpeza[0], /linhas com mais de 7 dias/);
});

test('rls_sem_policy: RLS ligado sem nenhuma policy nega tudo e hoje nao avisava', () => {
  const dado = base();
  dado.tabelas.push(tabela('cofre_vazio', { policies: 0, linhas: 0 }), tabela('com_rls_e_policy'));
  const alerta = montarInventario(dado, {}).alertas.find((a) => a.tipo === 'rls_sem_policy');
  assert.deepEqual(alerta.detalhe, ['cofre_vazio'], 'so a tabela sem nenhuma policy entra, mesmo vazia');
  assert.equal(montarInventario(base(), {}).alertas.some((a) => a.tipo === 'rls_sem_policy'), false,
    'base() ja tem policies:1 em todas; sem tabela sem policy, sem alerta');
});

test('saida tem chaves ordenadas (diff estavel entre execucoes)', () => {
  const inv = montarInventario(base(), {});
  assert.deepEqual(Object.keys(inv), [...Object.keys(inv)].sort());
  assert.deepEqual(Object.keys(inv.tabelas[0]), [...Object.keys(inv.tabelas[0])].sort());
});

test('contarUsoNoCodigo conta .from() em src e edges e ignora testes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-banco-'));
  fs.mkdirSync(path.join(dir, 'src/hooks'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src/__tests__'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'supabase/functions/x'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/hooks/a.ts'), "supabase.from('contatos').select(); db.from(\"contatos\")\n.from(`outra`)");
  fs.writeFileSync(path.join(dir, 'src/__tests__/a.test.ts'), "supabase.from('contatos')");
  fs.writeFileSync(path.join(dir, 'src/hooks/b.test.tsx'), "supabase.from('contatos')");
  fs.writeFileSync(path.join(dir, 'supabase/functions/x/index.ts'),
    "admin.from( 'contatos' ); admin.storage.from('contatos').upload(); supabase.storage\n    .from('contatos').remove()\n"
    + "fetch(`${url}/rest/v1/so_rest?id=eq.1`); fetch(`${url}/rest/v1/rpc/so_rest`)");
  const uso = contarUsoNoCodigo(dir, ['contatos', 'nada', 'so_rest']);
  assert.deepEqual(uso, { contatos: { src: 2, edges: 1 }, nada: { src: 0, edges: 0 }, so_rest: { src: 0, edges: 1 } },
    'bucket (storage.from) nao conta; /rest/v1/<tabela> conta; /rest/v1/rpc nao');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('banco.sql so le: nenhum comando de escrita e nada de command/telefone/QR/token', () => {
  const sql = fs.readFileSync(path.join(raiz, 'scripts/inventario/banco.sql'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i);
  assert.doesNotMatch(sql, /'command'|phone_number|qr_code|instance_token/);
  assert.match(sql, /regexp_matches\(j\.command, '\(\(\?:public\|net\|cron\)\\\.\[a-z_0-9\]\+\)\\s\*\\\(/,
    'de cron.job sai so o nome das funcoes chamadas (nome seguido de parentese, nunca tabela)');
});

test('edges: publicadas x repo, e sem token fica explicito que nao foi consultado', () => {
  const api = [
    { slug: 'a', version: 3, status: 'ACTIVE', verify_jwt: false, updated_at: 1730000000000 },
    { slug: 'so-em-producao', version: 1, status: 'ACTIVE', verify_jwt: true, updated_at: 1730000000000 },
  ];
  const ed = compararEdges(api, ['a', 'sem-deploy']);
  assert.deepEqual(ed.publicadas_sem_codigo_no_repo, ['so-em-producao']);
  assert.deepEqual(ed.no_repo_sem_deploy, ['sem-deploy']);
  assert.equal(ed.publicadas[0].atualizada_em, '2024-10-27T03:33Z');
  const tipos = montarInventario(base(), {}, ed).alertas.map((a) => a.tipo);
  assert.deepEqual(tipos, ['edge_sem_deploy', 'edge_publicada_sem_codigo']);
  const semToken = compararEdges(null, ['a']);
  assert.equal(semToken.publicadas, null);
  assert.equal(semToken.no_repo, 1);
  assert.deepEqual(montarInventario(base(), {}, semToken).alertas, []);
});

test('trava de credencial reconhece Bearer, JWT e sb_secret_ e deixa texto normal passar', () => {
  assert.match('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123', PARECE_CREDENCIAL);
  assert.match('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.x', PARECE_CREDENCIAL);
  assert.match('sb_secret_abc', PARECE_CREDENCIAL);
  assert.doesNotMatch(JSON.stringify(montarInventario(base(), {})), PARECE_CREDENCIAL);
});

test('origem: resposta de outro banco (tabelas nao batem com os tipos gerados) e recusada', () => {
  const dado = base();
  const declaradas = dado.tabelas.map((t) => t.nome);
  assert.deepEqual(conferirOrigem(dado, declaradas), { tabelas_em_comum_com_types: 4, tabelas_nos_types: 4 });
  assert.throws(() => conferirOrigem(dado, ['x', 'y', 'z', 'orfa']), /nao parece ser do banco oficial/);
  assert.throws(() => conferirOrigem({ ...dado, tabelas: dado.tabelas.slice(0, 1) }, declaradas), /nao parece/);
  const real = tabelasDosTypes(raiz);
  assert.ok(real.length > 20, 'os tipos gerados trazem as tabelas de producao');
  assert.ok(real.includes('campaign_targets') && real.includes('consent_ledger'), 'tabelas centrais do produto');
});

test('origem: banco irmao com as mesmas tabelas mas ledger parado ou diferente e recusado', () => {
  const versoes = Array.from({ length: 100 }, (_, i) => String(20260101000000 + i * 100));
  const manifesto = base().tabelas.map((t) => t.nome);
  const comLedger = (max, registros) => ({ ...base(), resumo: { ledger_versao_max: max, ledger_registros: registros } });
  const ok = conferirOrigem(comLedger(versoes.at(-1), 100), manifesto, versoes);
  assert.equal(ok.migrations_no_repo, 100);
  assert.ok(conferirOrigem(comLedger(versoes.at(-20), 95), manifesto, versoes), 'migration mergeada ainda nao aplicada passa');
  assert.ok(conferirOrigem(comLedger('20991231000000', 101), manifesto, versoes), 'ledger a frente do repo passa');
  assert.throws(() => conferirOrigem(comLedger(versoes.at(-21), 100), manifesto, versoes), /maior versao/, 'ledger parado');
  assert.throws(() => conferirOrigem(comLedger(versoes.at(-1), 60), manifesto, versoes), /nao parece/, 'contagem muito diferente');
  assert.throws(() => conferirOrigem(base(), manifesto, versoes), /ledger_versao_max/, 'sem resumo do ledger');
  const reais = versoesDoRepo(raiz);
  assert.ok(reais.length > 40 && reais.every((v) => /^\d{14}$/.test(v)), 'versoes reais saem so dos .sql do topo');
  const atual = { ledger_versao_max: [...reais].sort().at(-1), ledger_registros: reais.length };
  assert.ok(conferirOrigem({ ...base(), resumo: atual }, manifesto, reais), 'ledger em dia com o repo real passa');
});

test('cron_sem_execucao: job ativo diario sem nenhuma execucao em 24 h (cron 100% parado) alerta', () => {
  assert.equal(rodaTodoDia('* * * * *'), true);
  assert.equal(rodaTodoDia('17 3 * * *'), true);
  assert.equal(rodaTodoDia('30 seconds'), true);
  assert.equal(rodaTodoDia('0 4 * * 1'), false, 'semanal pode passar 24 h sem rodar');
  assert.equal(rodaTodoDia('0 0 1 * *'), false, 'mensal');
  assert.equal(rodaTodoDia('0 0 * * 0-6'), true, 'faixa inteira da semana');
  assert.equal(rodaTodoDia('0 0 */1 1-12 *'), true);
  assert.equal(rodaTodoDia('0 0 * * 1-5'), false, 'dias uteis pulam o fim de semana');
  assert.equal(rodaTodoDia('0 0 */2 * *'), false, 'dia sim, dia nao');
  const dado = base();
  dado.cron.jobs = [job('parado', { execucoes_24h: 0, execucoes_7d: 0 }), job('semanal', { agenda: '0 4 * * 1', execucoes_24h: 0 }),
    job('desligado', { ativo: false, execucoes_24h: 0 }), job('ok')];
  const alerta = montarInventario(dado, {}).alertas.find((a) => a.tipo === 'cron_sem_execucao');
  assert.deepEqual(alerta, { tipo: 'cron_sem_execucao', detalhe: ['parado'] });
  assert.equal(montarInventario(base(), {}).alertas.some((a) => a.tipo === 'cron_sem_execucao'), false);
});

test('banco saudavel nao gera alerta nenhum', () => {
  assert.deepEqual(montarInventario(base(), {}).alertas, []);
});

test('sem supabase/functions/ (repo sem edge functions) edgesNoRepo retorna [] sem lancar ENOENT', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-banco-edges-'));
  assert.deepEqual(edgesNoRepo(dir), [], 'pasta ausente nao deve lancar excecao');
  fs.rmdirSync(dir);
});
