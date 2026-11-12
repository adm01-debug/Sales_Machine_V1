/**
 * Apuração de gasto corrente (dia e mês) por canal + snapshot de orçamento.
 *
 * Isolado do wrapper `createServerFn` porque o split de server functions
 * remove helpers irmãos em runtime, e para ser testável contra o client fake.
 *
 * Estratégia: uma única varredura keyset sobre `contact_touchpoints` desde o
 * início do mês corrente (UTC), classificando cada linha em dois baldes
 * (mês e, quando aplicável, dia). Reaproveita `summarizeSpend` para converter
 * contagens em BRL, garantindo que painel e guardrail usem exatamente o mesmo
 * modelo de custo.
 */

import { summarizeSpend, type SpendRow } from "./cost-model";
import { buildBudgetSnapshot, type BudgetSnapshot, type ChannelBudget } from "./budget-guard";
import type { TableClient } from "./table-client";

export const BUDGET_PAGE_SIZE = 1_000;
export const BUDGET_MAX_ROWS = 100_000;

export type BudgetClient = TableClient;

interface BudgetRow {
  channel: string;
  daily_limit_brl: number | string | null;
  monthly_limit_brl: number | string | null;
  enabled: boolean | null;
  note: string | null;
}

interface TouchpointRow {
  id: string;
  channel: string;
  status: string;
  created_at: string;
}

export interface BudgetReport extends BudgetSnapshot {
  scannedRows: number;
  /** `true` quando o teto de varredura foi atingido — gasto é piso, não total. */
  truncated: boolean;
  monthStart: string;
  dayStart: string;
}

/** Início do dia e do mês em UTC — mesma referência usada pelos crons. */
export function periodBounds(now: Date = new Date()): { dayStart: string; monthStart: string } {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { dayStart: dayStart.toISOString(), monthStart: monthStart.toISOString() };
}

function costByChannel(rows: SpendRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of summarizeSpend(rows).byChannel) out[item.channel] = item.cost;
  return out;
}

export async function buildBudgetReport(
  client: BudgetClient,
  now: Date = new Date(),
): Promise<BudgetReport> {
  const { dayStart, monthStart } = periodBounds(now);

  const { data: budgetRows, error: budgetErr } = await client
    .from("channel_budgets")
    .select("channel, daily_limit_brl, monthly_limit_brl, enabled, note");
  if (budgetErr) throw new Error(budgetErr.message);

  const budgets: ChannelBudget[] = (budgetRows ?? []).map((b: BudgetRow) => ({
    channel: String(b.channel),
    daily_limit_brl: Number(b.daily_limit_brl) || 0,
    monthly_limit_brl: Number(b.monthly_limit_brl) || 0,
    enabled: b.enabled !== false,
    note: b.note ?? null,
  }));

  const seen = new Set<string>();
  const monthBuckets = new Map<string, SpendRow>();
  const dayBuckets = new Map<string, SpendRow>();
  let cursor: string | null = null;
  let scannedRows = 0;
  let truncated = false;

  for (;;) {
    let q = client
      .from("contact_touchpoints")
      .select("id, channel, status, created_at")
      .eq("direction", "outbound")
      .gte("created_at", monthStart);
    if (cursor) q = q.lte("created_at", cursor);

    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(BUDGET_PAGE_SIZE);
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
      const monthBucket = monthBuckets.get(key);
      if (monthBucket) monthBucket.count += 1;
      else monthBuckets.set(key, { channel: row.channel, status: row.status, count: 1 });

      if (row.created_at >= dayStart) {
        const dayBucket = dayBuckets.get(key);
        if (dayBucket) dayBucket.count += 1;
        else dayBuckets.set(key, { channel: row.channel, status: row.status, count: 1 });
      }

      if (scannedRows >= BUDGET_MAX_ROWS) {
        truncated = true;
        break;
      }
    }

    if (truncated) break;
    if (added === 0 || page.length < BUDGET_PAGE_SIZE) break;
    cursor = page[page.length - 1].created_at;
  }

  const monthCost = costByChannel([...monthBuckets.values()]);
  const dayCost = costByChannel([...dayBuckets.values()]);

  const spendByChannel: Record<string, { spentToday: number; spentMonth: number }> = {};
  for (const channel of new Set([...Object.keys(monthCost), ...Object.keys(dayCost)])) {
    spendByChannel[channel] = {
      spentToday: dayCost[channel] ?? 0,
      spentMonth: monthCost[channel] ?? 0,
    };
  }

  return {
    ...buildBudgetSnapshot(budgets, spendByChannel),
    scannedRows,
    truncated,
    monthStart,
    dayStart,
  };
}

/**
 * Atalho para o worker: apenas o conjunto de canais bloqueados.
 * Em caso de erro devolvemos conjunto vazio — um guardrail de custo nunca deve
 * derrubar o pipeline inteiro por indisponibilidade de leitura.
 */
export async function loadBlockedChannels(client: BudgetClient): Promise<Set<string>> {
  try {
    const report = await buildBudgetReport(client);
    return report.blockedChannels;
  } catch (err) {
    console.error("[budget] falha ao apurar orçamento — guardrail em fail-open", err);
    return new Set<string>();
  }
}
