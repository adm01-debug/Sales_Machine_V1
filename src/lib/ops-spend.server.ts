/**
 * Agregação de custo por canal a partir de `contact_touchpoints`.
 *
 * Isolado do wrapper `createServerFn` (o split de server functions remove
 * helpers irmãos em runtime) e testável contra o client fake.
 *
 * Estratégia: paginação keyset em `created_at` desc, agregando em memória
 * apenas `channel` + `status` (duas colunas curtas). Evitamos ~35 queries
 * `head: true` (canal × status) e evitamos OFFSET.
 */

import { summarizeSpend, type SpendRow, type SpendSummary } from "./cost-model";
import type { TableClient } from "./table-client";

export const SPEND_PAGE_SIZE = 1_000;
/** Teto de linhas varridas: protege memória/tempo do worker. */
export const SPEND_MAX_ROWS = 50_000;
export const SPEND_DEFAULT_DAYS = 30;

export type SpendClient = TableClient;

interface TouchpointRow {
  id: string;
  channel: string;
  status: string;
  created_at: string;
}

export interface SpendReport extends SpendSummary {
  days: number;
  scannedRows: number;
  /** `true` quando o teto de varredura foi atingido — números são piso, não total. */
  truncated: boolean;
}

export function clampDays(days: number | null | undefined): number {
  if (!Number.isFinite(days) || !days || days < 1) return SPEND_DEFAULT_DAYS;
  return Math.min(Math.floor(days as number), 365);
}

export async function buildSpendReport(
  client: SpendClient,
  options: { days?: number | null } = {},
): Promise<SpendReport> {
  const days = clampDays(options.days);
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();

  const seen = new Set<string>();
  const buckets = new Map<string, SpendRow>();
  let cursor: string | null = null;
  let scannedRows = 0;
  let truncated = false;

  for (;;) {
    let q = client
      .from("contact_touchpoints")
      .select("id, channel, status, created_at")
      .eq("direction", "outbound")
      .gte("created_at", since);

    // `lte` + dedupe por id: touchpoints gravados em lote compartilham o mesmo
    // timestamp; `lt` puro perderia linhas ou giraria em falso.
    if (cursor) q = q.lte("created_at", cursor);

    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(SPEND_PAGE_SIZE);
    if (error) throw new Error(error.message);

    const page = (data ?? []) as TouchpointRow[];
    if (page.length === 0) break;

    let added = 0;
    for (const row of page) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      added++;
      scannedRows++;
      const key = `${row.channel}::${row.status}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.count += 1;
      else buckets.set(key, { channel: row.channel, status: row.status, count: 1 });
      if (scannedRows >= SPEND_MAX_ROWS) {
        truncated = true;
        break;
      }
    }

    if (truncated) break;
    if (added === 0 || page.length < SPEND_PAGE_SIZE) break;
    cursor = page[page.length - 1].created_at;
  }

  return {
    ...summarizeSpend([...buckets.values()]),
    days,
    scannedRows,
    truncated,
  };
}
