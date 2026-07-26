/**
 * Serialização CSV segura para exportações do painel operacional.
 *
 * Duas preocupações que um `join(",")` ingênuo não cobre:
 *
 * 1. **Escapes RFC 4180** — campos com vírgula, aspas ou quebra de linha
 *    precisam ser aspeados, com as aspas internas duplicadas.
 * 2. **CSV injection** — Excel/Sheets interpretam células iniciadas por
 *    `=`, `+`, `-`, `@`, TAB ou CR como fórmula. Como a trilha de auditoria
 *    inclui texto vindo de webhooks externos (`reason`, `last_error`), um
 *    valor como `=HYPERLINK(...)` viraria código executável na máquina do
 *    auditor. Prefixamos com apóstrofo, que o Excel trata como literal.
 */

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "string" ? value : String(value);

  if (FORMULA_PREFIXES.some((p) => text.startsWith(p))) text = `'${text}`;

  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export interface CsvColumn<T> {
  key: string;
  header: string;
  value: (row: T) => unknown;
}

/** Monta o CSV completo com CRLF (RFC 4180) — Excel no Windows depende disso. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCsvValue(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvValue(c.value(row))).join(","));
  }
  return lines.join("\r\n");
}

/** Nome de arquivo determinístico e ordenável: `prefixo-YYYY-MM-DDTHH-mm-ss.csv`. */
export function csvFilename(prefix: string, at: Date = new Date()): string {
  const stamp = at.toISOString().slice(0, 19).replace(/:/g, "-");
  return `${prefix}-${stamp}.csv`;
}

/**
 * Dispara o download no browser. Prefixa BOM UTF-8 para que o Excel reconheça
 * acentuação (o padrão dele ainda é a codificação local em muitos ambientes).
 */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}