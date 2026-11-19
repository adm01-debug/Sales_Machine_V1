#!/usr/bin/env node
/**
 * O inventario mudou de verdade? Compara cada arquivo de inventario/estado/ com a versao do
 * HEAD depois de tirar so os carimbos de data (`medido_em`, `gerado_em`, em qualquer nivel).
 * Imprime `true` ou `false` (usado pelo inventario-estado-semanal.yml para decidir se abre PR).
 *
 * Uso: node scripts/inventario/mudou-conteudo.mjs [arquivo...]   (padrao: banco, rotas e edges)
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const PADRAO = ['inventario/estado/banco.json', 'inventario/estado/rotas.json', 'inventario/estado/edges.json'];
const CARIMBOS = new Set(['medido_em', 'gerado_em']);
// Telemetria viva do cron/WhatsApp: muda quase toda semana so pela janela rolante de 7 dias, sem
// mudanca estrutural nenhuma (achado da revisao de 2026-11-02 em scripts/inventario/gerar-banco.mjs:
// mudar so `taxa_falha_7d_pct` de 9 para 9.3 ja fazia `mudou()` dar `true`). Fora desses nomes, nada
// muda: a lista de alertas, tabelas_orfas e o resto de `banco.json`/`rotas.json` continuam
// comparados normalmente.
const TELEMETRIA = new Set([
  'execucoes_24h', 'falhas_24h', 'execucoes_7d', 'falhas_7d', 'taxa_falha_7d_pct',
  'startup_timeout_7d', 'ultima_falha', 'duracao_max_s_7d', 'horas_paradas_7d',
  'mais_antigo', 'mais_de_7_dias', 'mensagens_7d', 'ultimo_health_check', 'atualizada_em',
]);
const IGNORADOS = new Set([...CARIMBOS, ...TELEMETRIA]);
// `historico.linhas`/`historico.bytes` tambem rolam todo dia com a retencao de 7 dias
// (20261102022200_cron_historico_retencao_7d), mas o nome `linhas`/`bytes` e compartilhado com
// cada tabela em `tabelas[]`, onde a contagem real importa. So ignora dentro de `cron.historico`.
function limparHistoricoCron(historico) {
  if (!historico || typeof historico !== 'object') return historico;
  const { linhas, bytes, ...resto } = historico;
  return resto;
}

// Achado da revisao (Codex, 2026-11-02): a telemetria tambem vaza pro TEXTO de alertas[].detalhe,
// que a lista IGNORADOS (por nome de campo) nao alcanca. `cron_falhando` grava
// "nome (9.0% em 7d)" — a porcentagem rola toda semana mesmo sem o job sair da lista; `cron_parado`
// grava a lista de horas de `horas_paradas_7d`, que ja ignoramos na raiz pelo mesmo motivo (janela
// rolante de 7 dias). So normaliza o TEXTO; se um job entra ou sai da lista (`cron_falhando`) ou o
// alerta `cron_parado` aparece/desaparece, a mudanca de verdade continua sendo pega.
const PORCENTAGEM_7D = /\s*\([\d.]+%\s*em\s*7d\)\s*$/;
function normalizarAlerta(a) {
  if (!a || typeof a !== 'object' || !('tipo' in a) || !Array.isArray(a.detalhe)) return a;
  if (a.tipo === 'cron_falhando') {
    return { ...a, detalhe: a.detalhe.map((d) => (typeof d === 'string' ? d.replace(PORCENTAGEM_7D, '') : d)) };
  }
  // Mesmo bug do cron_parado: `mais_de_7_dias` rola todo dia com a retencao diaria
  // (20261102022200_cron_historico_retencao_7d) e vai virar ruido assim que cruzar o limiar.
  if (a.tipo === 'cron_parado' || a.tipo === 'historico_cron_sem_limpeza') return { ...a, detalhe: [] };
  return a;
}

/** JSON canonico sem os carimbos de data e sem a telemetria viva. Texto que nao e JSON volta como esta. */
export function semCarimbos(texto) {
  if (texto === null) return null;
  let dado;
  try { dado = JSON.parse(texto); } catch { return texto; }
  const limpar = (v, chave) => {
    if (Array.isArray(v)) return v.map((x) => limpar(chave === 'alertas' ? normalizarAlerta(x) : x));
    if (v && typeof v === 'object') {
      const base = chave === 'historico' ? limparHistoricoCron(v) : v;
      return Object.fromEntries(
        Object.keys(base).filter((k) => !IGNORADOS.has(k)).sort().map((k) => [k, limpar(base[k], k)]),
      );
    }
    return v;
  };
  return JSON.stringify(limpar(dado));
}

/** true se algum arquivo mudou alem dos carimbos (arquivo novo ou apagado conta). */
export function mudou(arquivos, lerAntes, lerDepois) {
  return arquivos.some((f) => semCarimbos(lerAntes(f)) !== semCarimbos(lerDepois(f)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arquivos = process.argv.length > 2 ? process.argv.slice(2) : PADRAO;
  const lerAntes = (f) => {
    try { return execFileSync('git', ['show', `HEAD:${f}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
  };
  const lerDepois = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
  console.log(String(mudou(arquivos, lerAntes, lerDepois)));
}
