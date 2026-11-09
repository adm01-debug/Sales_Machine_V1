// Contrato de scripts/inventario/mudou-conteudo.mjs: o workflow semanal so abre PR quando o
// inventario mudou alem das datas — inclusive no edges.json, que e gravado numa linha so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mudou, semCarimbos } from '../inventario/mudou-conteudo.mjs';

const ler = (mapa) => (f) => (f in mapa ? mapa[f] : null);

test('so a data mudou (edges.json numa linha so): nao abre PR', () => {
  const antes = { 'e.json': JSON.stringify({ gerado_em: '2026-11-01T00:00:00Z', total: 85, sem_chamador_no_repo: ['a'] }) + '\n' };
  const depois = { 'e.json': JSON.stringify({ gerado_em: '2026-11-08T00:00:00Z', total: 85, sem_chamador_no_repo: ['a'] }) + '\n' };
  assert.equal(mudou(['e.json'], ler(antes), ler(depois)), false);
});

test('mudanca real no edges.json, na mesma linha da data: abre PR', () => {
  const antes = { 'e.json': JSON.stringify({ gerado_em: '2026-11-01T00:00:00Z', total: 85 }) };
  const depois = { 'e.json': JSON.stringify({ gerado_em: '2026-11-08T00:00:00Z', total: 86 }) };
  assert.equal(mudou(['e.json'], ler(antes), ler(depois)), true);
});

test('medido_em aninhado e ordem de chaves nao contam; valor aninhado conta', () => {
  const a = JSON.stringify({ x: { medido_em: '1', n: 1 }, y: 2 }, null, 2);
  const b = JSON.stringify({ y: 2, x: { n: 1, medido_em: '2' } });
  assert.equal(semCarimbos(a), semCarimbos(b));
  assert.equal(mudou(['f'], ler({ f: a }), ler({ f: JSON.stringify({ x: { n: 2 }, y: 2 }) })), true);
});

test('arquivo novo ou apagado conta como mudanca', () => {
  assert.equal(mudou(['f'], ler({}), ler({ f: '{}' })), true);
  assert.equal(mudou(['f'], ler({ f: '{}' }), ler({})), true);
  assert.equal(mudou(['f'], ler({}), ler({})), false);
});

test('telemetria viva do cron/WhatsApp mudando sozinha nao abre PR (achado da revisao de hoje)', () => {
  const base = (taxa, execucoes24h) => JSON.stringify({
    cron: {
      jobs: [{ nome: 'x', agenda: '* * * * *', taxa_falha_7d_pct: taxa, execucoes_24h: execucoes24h, ultima_falha: '2026-11-01T00:00Z' }],
      horas_paradas_7d: [{ hora: '2026-10-31T04:00Z', execucoes: 1, falhas: 1 }],
      historico: { linhas: 100, bytes: 1, mais_antigo: '2026-10-01T00:00Z', mais_de_7_dias: 0 },
    },
    whatsapp: { mensagens_7d: 4, conexoes: [{ instance_id: 'P', ultimo_health_check: '2026-11-01T00:00Z', atualizada_em: '2026-11-01T00:00Z' }] },
  });
  const antes = { 'b.json': base(9.0, 1413) };
  const depois = { 'b.json': base(9.3, 1500) };
  assert.equal(mudou(['b.json'], ler(antes), ler(depois)), false, 'so taxa_falha_7d_pct/execucoes_24h mudaram');

  const outraHora = base(9.0, 1413).replace('2026-10-31T04:00Z', '2026-11-02T05:00Z');
  assert.equal(mudou(['b.json'], ler({ 'b.json': base(9.0, 1413) }), ler({ 'b.json': outraHora })), false,
    'horas_paradas_7d rolando com a janela de 7 dias nao conta');

  const outroHistorico = JSON.parse(base(9.0, 1413));
  outroHistorico.cron.historico.linhas = 50000;
  outroHistorico.cron.historico.bytes = 999;
  assert.equal(mudou(['b.json'], ler({ 'b.json': base(9.0, 1413) }), ler({ 'b.json': JSON.stringify(outroHistorico) })), false,
    'historico.linhas/bytes do cron rolando com a retencao diaria nao conta');
});

test('mas uma tabela mudar de linhas conta (nao e telemetria do cron)', () => {
  const dado = (linhas) => JSON.stringify({ tabelas: [{ nome: 'contacts', linhas, bytes: 1 }] });
  assert.equal(mudou(['t.json'], ler({ 't.json': dado(100) }), ler({ 't.json': dado(200) })), true);
});

test('mas um alerta novo ou tabela orfa nova conta (mudanca estrutural de verdade)', () => {
  const dado = (alertas) => JSON.stringify({
    cron: { jobs: [{ nome: 'x', taxa_falha_7d_pct: 9.0 }] },
    alertas,
  });
  assert.equal(mudou(['a.json'], ler({ 'a.json': dado([]) }), ler({ 'a.json': dado([{ tipo: 'rls_sem_policy', detalhe: ['x'] }]) })), true);
});

test('telemetria tambem some do TEXTO dos alertas cron_falhando/cron_parado (achado do Codex)', () => {
  const dado = (pct, horas) => JSON.stringify({
    alertas: [
      { tipo: 'cron_falhando', detalhe: [`job-x (${pct}% em 7d)`, 'job-y (20% em 7d)'] },
      { tipo: 'cron_parado', detalhe: horas },
      { tipo: 'whatsapp_desconectado', detalhe: ['PRINCIPAL: disconnected'] },
    ],
  });
  assert.equal(
    mudou(['a.json'], ler({ 'a.json': dado(9.0, ['2026-10-31T04:00Z']) }), ler({ 'a.json': dado(9.3, ['2026-11-01T05:00Z']) })),
    false, 'so a porcentagem e as horas (janela rolante) mudaram',
  );
  const semJobX = JSON.parse(dado(9.0, []));
  semJobX.alertas[0].detalhe = ['job-y (20% em 7d)'];
  assert.equal(
    mudou(['a.json'], ler({ 'a.json': dado(9.0, []) }), ler({ 'a.json': JSON.stringify(semJobX) })),
    true, 'job saindo da lista de cron_falhando e mudanca real',
  );
  const semAlertaParado = JSON.parse(dado(9.0, ['2026-10-31T04:00Z']));
  semAlertaParado.alertas = semAlertaParado.alertas.filter((a) => a.tipo !== 'cron_parado');
  assert.equal(
    mudou(['a.json'], ler({ 'a.json': dado(9.0, ['2026-10-31T04:00Z']) }), ler({ 'a.json': JSON.stringify(semAlertaParado) })),
    true, 'cron_parado deixar de existir e mudanca real',
  );
});

test('historico_cron_sem_limpeza: o contador rolando sozinho nao abre PR, mas o alerta surgir/sumir sim (achado da revisao de hoje)', () => {
  const dado = (n) => JSON.stringify({
    alertas: n === null ? [] : [{ tipo: 'historico_cron_sem_limpeza', detalhe: [`${n} linhas com mais de 7 dias`] }],
  });
  assert.equal(mudou(['h.json'], ler({ 'h.json': dado(50001) }), ler({ 'h.json': dado(62000) })), false,
    'so o contador mudou, alerta ja existia nos dois');
  assert.equal(mudou(['h.json'], ler({ 'h.json': dado(null) }), ler({ 'h.json': dado(50001) })), true,
    'alerta passar a existir (cruzou o limiar) e mudanca real');
  assert.equal(mudou(['h.json'], ler({ 'h.json': dado(62000) }), ler({ 'h.json': dado(null) })), true,
    'alerta deixar de existir e mudanca real');
});
