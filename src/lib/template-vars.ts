/**
 * Motor de variáveis de template — módulo puro, compartilhado entre a
 * Biblioteca, o editor de campanhas e os workers de disparo.
 *
 * Sintaxe suportada: `{{variavel}}` ou `{{variavel|texto padrão}}`.
 * O fallback após `|` é usado quando o contato não possui o dado.
 */

export interface TemplateVarDef {
  /** Chave usada dentro de {{ }}. */
  key: string;
  /** Rótulo humano exibido na UI. */
  label: string;
  /** Exemplo usado no preview quando não há contato selecionado. */
  sample: string;
  /** Aliases aceitos (ex.: `name` para `nome`). */
  aliases?: string[];
}

export const TEMPLATE_VARS: TemplateVarDef[] = [
  { key: "nome", label: "Nome do contato", sample: "Ana Souza", aliases: ["name"] },
  { key: "primeiro_nome", label: "Primeiro nome", sample: "Ana", aliases: ["first_name"] },
  { key: "empresa", label: "Empresa", sample: "Acme Ltda", aliases: ["company"] },
  { key: "cargo", label: "Cargo", sample: "Diretora de Marketing", aliases: ["title", "role"] },
  { key: "cidade", label: "Cidade", sample: "São Paulo", aliases: ["city"] },
  { key: "site", label: "Site", sample: "acme.com.br", aliases: ["website"] },
  { key: "email", label: "E-mail", sample: "ana@acme.com.br" },
];

/** Mapa de alias → chave canônica. */
const ALIAS_MAP: Record<string, string> = TEMPLATE_VARS.reduce<Record<string, string>>(
  (acc, def) => {
    acc[def.key] = def.key;
    for (const alias of def.aliases ?? []) acc[alias] = def.key;
    return acc;
  },
  {},
);

export function canonicalVar(raw: string): string | null {
  return ALIAS_MAP[raw.trim().toLowerCase()] ?? null;
}

export interface ParsedVar {
  /** Texto exatamente como escrito pelo autor. */
  raw: string;
  /** Chave canônica quando reconhecida, senão null. */
  key: string | null;
  /** Texto de fallback declarado após `|`, se houver. */
  fallback: string | null;
}

const VAR_RE = /\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g;

/** Lista todas as ocorrências de variáveis (com duplicatas removidas por raw+fallback). */
export function parseVariables(text: string): ParsedVar[] {
  const seen = new Set<string>();
  const out: ParsedVar[] = [];
  for (const match of text.matchAll(VAR_RE)) {
    const raw = match[1];
    const fallback = match[2] === undefined ? null : match[2].trim();
    const dedupeKey = `${raw}::${fallback ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({ raw, key: canonicalVar(raw), fallback });
  }
  return out;
}

/** Chaves canônicas usadas — alimenta a coluna `variables` dos templates. */
export function extractVariables(text: string): string[] {
  const set = new Set<string>();
  for (const v of parseVariables(text)) set.add(v.key ?? v.raw);
  return [...set];
}

/** Variáveis escritas que não pertencem ao catálogo. */
export function unknownVariables(text: string): string[] {
  return [...new Set(parseVariables(text).filter((v) => !v.key).map((v) => v.raw))];
}

/** Dados mínimos de um contato necessários para renderizar. */
export interface ContactVarSource {
  display_name?: string | null;
  metadata?: Record<string, unknown> | null;
}

function pickString(meta: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Extrai o valor de cada variável canônica a partir do contato. */
export function buildVarValues(contact: ContactVarSource): Record<string, string | null> {
  const meta = (contact.metadata ?? {}) as Record<string, unknown>;
  const displayName = (contact.display_name ?? "").trim() || null;
  return {
    nome: displayName,
    primeiro_nome: displayName ? displayName.split(/\s+/)[0] : null,
    empresa: pickString(meta, ["company_name", "company", "empresa", "lux_company_name"]),
    cargo: pickString(meta, ["title", "job_title", "role", "cargo"]),
    cidade: pickString(meta, ["city", "cidade", "location"]),
    site: pickString(meta, ["website", "site", "domain"]),
    email: pickString(meta, ["email", "primary_email"]),
  };
}

/** Valores de exemplo para o preview sem contato real. */
export function sampleVarValues(): Record<string, string | null> {
  return TEMPLATE_VARS.reduce<Record<string, string | null>>((acc, def) => {
    acc[def.key] = def.sample;
    return acc;
  }, {});
}

export interface RenderResult {
  text: string;
  /** Variáveis que ficaram sem valor e sem fallback. */
  missing: string[];
}

/**
 * Substitui as variáveis pelo valor do contato, caindo no fallback declarado.
 * Variáveis desconhecidas são mantidas literais para não mascarar erro de autoria.
 */
export function renderTemplate(
  text: string,
  values: Record<string, string | null | undefined>,
): RenderResult {
  const missing: string[] = [];
  const rendered = text.replace(VAR_RE, (whole, rawName: string, rawFallback?: string) => {
    const key = canonicalVar(rawName);
    if (!key) return whole;
    const value = values[key];
    if (value != null && String(value).trim()) return String(value).trim();
    const fallback = rawFallback?.trim();
    if (fallback) return fallback;
    missing.push(key);
    return "";
  });
  return { text: rendered.replace(/[ \t]{2,}/g, " ").trim(), missing: [...new Set(missing)] };
}

/** Atalho usado nos workers: renderiza direto a partir do contato. */
export function renderForContact(text: string, contact: ContactVarSource): string {
  return renderTemplate(text, buildVarValues(contact)).text;
}