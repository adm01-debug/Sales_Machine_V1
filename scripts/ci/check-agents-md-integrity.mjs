#!/usr/bin/env node
/**
 * Garante que as instrucoes para agentes nao foram apagadas ou esvaziadas por outra sessao.
 * Alvo: AGENTS.md (regras) + docs/agentes/*.md (referencia por tema) + 00-governanca/*.md (leis,
 * definition of done, matriz de autonomia). CLAUDE.md e so `@AGENTS.md` por design e fica fora da
 * checagem por arquivo.
 *
 * Verifica:
 *  1. AGENTS.md existe e tem todas as secoes obrigatorias;
 *  2. o conjunto vigiado nao encolheu mais de 30% em bytes vs a base;
 *  3. cada arquivo que existia na base continua existindo com >= 50% do tamanho de la
 *     (o limiar do conjunto sozinho nao pega o esvaziamento de um arquivo so).
 *
 * Base: variavel AGENTS_MD_BASE (ex.: `AGENTS_MD_BASE=origin/main`). Sem ela compara com HEAD, o
 * que pega apenas wipe nao-commitado no working tree.
 *
 * Uso:  node scripts/ci/check-agents-md-integrity.mjs
 *       AGENTS_MD_BASE=origin/main node scripts/ci/check-agents-md-integrity.mjs
 *
 * No CI roda em `.github/workflows/agents-md-guard.yml` (PR e push na main, AGENTS_MD_BASE=FETCH_HEAD).
 * Rode a mao tambem, antes de fechar qualquer tarefa que toque AGENTS.md, docs/agentes/ ou
 * 00-governanca/, para nao descobrir o problema depois do push.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const AGENTS = "AGENTS.md";
const CONJUNTO_RAIZ = ["AGENTS.md", "CLAUDE.md"];
const DIRS_VIGIADOS = ["docs/agentes", "00-governanca"];
const REQUIRED_SECTIONS = [
  "## Postura",
  "## Bugs e funcionalidades",
  "## Comunicação",
  "## Fluxo Git",
  "## Banco",
  "## Serviços",
  "## Stack e comandos",
  "## Contexto gerado",
];
const SHRINK_THRESHOLD = 0.3;
const FILE_SHRINK_THRESHOLD = 0.5;

let content;
try {
  content = readFileSync(AGENTS, "utf8");
} catch {
  console.error(`::error::${AGENTS} nao encontrado. Outra sessao pode ter apagado o arquivo.`);
  process.exit(1);
}

const missing = REQUIRED_SECTIONS.filter((s) => !content.includes(s));
if (missing.length > 0) {
  for (const s of missing) {
    console.error(`::error::${AGENTS}: secao obrigatoria ausente: ${s}`);
  }
  process.exit(1);
}

function bytesAtuais() {
  let total = 0;
  for (const f of CONJUNTO_RAIZ) {
    if (existsSync(f)) total += Buffer.byteLength(readFileSync(f, "utf8"));
  }
  for (const dir of DIRS_VIGIADOS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".md")) total += Buffer.byteLength(readFileSync(join(dir, f), "utf8"));
    }
  }
  return total;
}

function git(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

// Tamanho na base de cada arquivo vigiado: { total, porArquivo } ou null quando a base nao tem
// nenhum deles (ref inexistente, clone raso sem a main).
function bytesNaBase(base) {
  const porArquivo = new Map();
  const tamanho = (path) => {
    try {
      porArquivo.set(path, Number.parseInt(git(`git cat-file -s ${base}:${path}`).trim(), 10) || 0);
    } catch {
      /* nao existe na base */
    }
  };
  for (const f of CONJUNTO_RAIZ) tamanho(f);
  for (const dir of DIRS_VIGIADOS) {
    let lista = "";
    try {
      lista = git(`git ls-tree -r --name-only ${base} -- ${dir}`);
    } catch {
      lista = "";
    }
    const arquivos = lista
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith(".md"));
    for (const path of arquivos) tamanho(path);
  }
  if (porArquivo.size === 0) return null;
  let total = 0;
  for (const n of porArquivo.values()) total += n;
  return { total, porArquivo };
}

const BASE = process.env.AGENTS_MD_BASE || "HEAD";
const atual = bytesAtuais();
const base = bytesNaBase(BASE);

if (base) {
  const ratio = atual / base.total;
  if (ratio < 1 - SHRINK_THRESHOLD) {
    const encolheu = Math.round((1 - ratio) * 100);
    console.error(
      `::error::Instrucoes para agentes encolheram ${encolheu}% vs ${BASE} (atual: ${atual} bytes, base: ${base.total} bytes). Possivel wipe por sessao paralela.`,
    );
    process.exit(1);
  }
  let falhas = 0;
  for (const [path, naBase] of base.porArquivo) {
    if (path === "CLAUDE.md" || naBase === 0) continue;
    if (!existsSync(path)) {
      console.error(
        `::error::${path} existia em ${BASE} (${naBase} bytes) e sumiu. Possivel wipe por sessao paralela.`,
      );
      falhas += 1;
      continue;
    }
    const agora = Buffer.byteLength(readFileSync(path, "utf8"));
    if (agora < naBase * FILE_SHRINK_THRESHOLD) {
      const encolheu = Math.round((1 - agora / naBase) * 100);
      console.error(
        `::error::${path} encolheu ${encolheu}% vs ${BASE} (atual: ${agora} bytes, base: ${naBase} bytes); limite por arquivo e ${Math.round(FILE_SHRINK_THRESHOLD * 100)}%.`,
      );
      falhas += 1;
    }
  }
  if (falhas > 0) process.exit(1);
}

const detalhe = base
  ? ` (base ${BASE}: ${base.total} bytes em ${base.porArquivo.size} arquivos, cada um >= ${Math.round(
      FILE_SHRINK_THRESHOLD * 100,
    )}% do tamanho na base)`
  : "";
console.log(
  `${AGENTS} OK: ${REQUIRED_SECTIONS.length} secoes presentes; conjunto vigiado: ${atual} bytes${detalhe}.`,
);
