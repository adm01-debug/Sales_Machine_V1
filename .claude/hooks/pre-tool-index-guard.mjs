#!/usr/bin/env node
/**
 * PreToolUse (Bash|Grep): quando a busca por texto procura um nome que o indice de contexto ja
 * conhece (tabela, coluna, enum, funcao SQL, rota, job de cron, integracao), devolve o que o indice
 * diz, para o agente consultar `.contexto-compartilhado/dump-arquitetura.json` em vez de varrer o
 * repo. Equivalente local do `graphify hook-guard search` do Zapp_Web_V2, que aqui nao existe.
 *
 * Nao bloqueia nada: nao emite `permissionDecision`, so `additionalContext`. Qualquer erro, termo
 * desconhecido ou comando que nao e busca => sai 0 sem saida (no-op).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DUMP = ".contexto-compartilhado/dump-arquitetura.json";
const MAX_ACHADOS = 6;
const STOPWORDS = new Set([
  "select",
  "from",
  "where",
  "const",
  "function",
  "import",
  "export",
  "await",
  "async",
  "return",
  "true",
  "false",
  "null",
  "null",
  "type",
  "interface",
  "string",
  "number",
  "boolean",
  "grep",
  "rg",
  "find",
  "cat",
  "head",
  "tail",
  "node",
  "bun",
  "bunx",
  "test",
  "tests",
  "src",
  "lib",
  "routes",
  "public",
  "hooks",
  "supabase",
  "migrations",
  "json",
  "name",
  "text",
  "uuid",
  "jsonb",
  "data",
  "error",
  "value",
  "index",
  "client",
  "server",
]);

function sair() {
  process.exit(0);
}

function lerStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const entrada = lerStdin();
if (!entrada) sair();

const tool = entrada.tool_name;
const input = entrada.tool_input ?? {};
let alvo = "";
if (tool === "Grep") {
  alvo = `${input.pattern ?? ""} ${input.glob ?? ""} ${input.path ?? ""}`;
} else if (tool === "Bash") {
  const cmd = String(input.command ?? "");
  if (!/\b(grep|rg|ag|ack|find)\b/.test(cmd)) sair();
  alvo = cmd;
} else {
  sair();
}
if (!alvo.trim()) sair();

// Aceita hifen no meio para casar nomes de job e de rota ("sm-tick-journeys", "singu-bounce"),
// e guarda tambem a variante com "_" porque o indice usa as duas grafias.
const brutos = alvo.toLowerCase().match(/[a-z_][a-z0-9_-]{3,}/g) ?? [];
const termos = [
  ...new Set(
    brutos
      .flatMap((t) => [t.replace(/-+$/, ""), t.replace(/-/g, "_")])
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t)),
  ),
].slice(0, 40);
if (termos.length === 0) sair();

let dump;
try {
  dump = JSON.parse(readFileSync(join(entrada.cwd || process.cwd(), DUMP), "utf8"));
} catch {
  sair();
}

const banco = dump.banco ?? {};
const tabelas = banco.tabelas ?? {};
const enums = banco.enums ?? {};
const funcoes = banco.functions ?? [];
const rotas = dump.api?.rotas ?? [];
const jobs = dump.jobs ?? [];
const integracoes = dump.integracoes ?? [];

// nome -> descricao do que o indice sabe
const indice = new Map();
const registra = (nome, texto) => {
  const k = String(nome).toLowerCase();
  if (k.length >= 4 && !indice.has(k)) indice.set(k, texto);
};

for (const [tabela, def] of Object.entries(tabelas)) {
  const cols = Object.keys(def?.colunas ?? {});
  registra(tabela, `tabela \`${tabela}\` (${cols.length} colunas): ${cols.slice(0, 12).join(", ")}`);
}
// Uma coluna com o mesmo nome aparece em varias tabelas (`locked_until`, `entity_id`): registrar
// so a primeira apontaria para a tabela errada, entao agrega todas.
const colunas = new Map();
for (const [tabela, def] of Object.entries(tabelas)) {
  for (const [col, tipo] of Object.entries(def?.colunas ?? {})) {
    if (!colunas.has(col)) colunas.set(col, { tipo, tabelas: [] });
    colunas.get(col).tabelas.push(tabela);
  }
}
for (const [col, { tipo, tabelas: donas }] of colunas) {
  const lista = donas.slice(0, 4).join(", ") + (donas.length > 4 ? `, +${donas.length - 4}` : "");
  registra(col, `coluna \`${col}\` (${tipo}) em: ${lista}`);
}
for (const [nome, valores] of Object.entries(enums)) {
  registra(nome, `enum \`${nome}\`: ${Array.isArray(valores) ? valores.join(" | ") : ""}`);
}
for (const assinatura of funcoes) {
  registra(String(assinatura).split("(")[0], `funcao SQL \`${assinatura}\``);
}
for (const rota of rotas) {
  const segmentos = String(rota.path ?? "").split("/").filter(Boolean);
  const ultimo = segmentos[segmentos.length - 1];
  if (ultimo) {
    registra(
      ultimo.replace(/\[|\]/g, ""),
      `rota ${(rota.metodos ?? []).join("/")} \`${rota.path}\` -> ${rota.handler}`,
    );
  }
}
for (const job of jobs) {
  const nome = String(job.nome ?? "");
  const texto = `job de cron \`${nome}\` (${job.schedule})`;
  // "sm-tick-journeys" vira tambem "sm_tick_journeys" e "tick_journeys": a busca costuma usar o
  // sufixo (o endpoint chama-se tick-journeys), e o tokenizador nao atravessa hifens.
  registra(nome, texto);
  registra(nome.replace(/-/g, "_"), texto);
  const sufixo = nome.replace(/^sm-/, "");
  registra(sufixo, texto);
  registra(sufixo.replace(/-/g, "_"), texto);
}
for (const i of integracoes) {
  registra(i.nome, `integracao \`${i.nome}\` -> ${i.client}`);
}

const achados = [];
for (const termo of termos) {
  const direto = indice.get(termo) ?? indice.get(termo.replace(/-/g, "_"));
  if (direto) achados.push(direto);
  if (achados.length >= MAX_ACHADOS) break;
}
if (achados.length === 0) sair();

const linhas = [...new Set(achados)].map((a) => `- ${a}`).join("\n");
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: `Indice de contexto (${DUMP}, gerado das migrations + src) ja descreve o que esta busca procura:\n${linhas}\nUse o indice antes de varrer o repo (AGENTS.md > Contexto gerado). Se precisar do codigo em si, va direto ao arquivo citado.`,
    },
  }),
);
sair();
