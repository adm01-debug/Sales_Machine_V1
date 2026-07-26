/**
 * Modelo de custo por canal — lógica pura, testável sem banco.
 *
 * Objetivo: transformar contagem de touchpoints em impacto financeiro, para
 * que o operador enxergue no painel /ops não apenas "quantos falharam" mas
 * "quanto isso custou" e "quanto foi desperdiçado".
 *
 * Os valores são estimativas de referência em BRL por mensagem enviada.
 * Podem ser sobrescritos por `overrides` quando o contrato do provedor mudar.
 */

export type CostChannel =
  | "whatsapp"
  | "sms"
  | "mms"
  | "rcs"
  | "email"
  | "linkedin"
  | "instagram";

/** Custo unitário estimado (BRL) por mensagem efetivamente despachada. */
export const DEFAULT_UNIT_COST_BRL: Record<CostChannel, number> = {
  whatsapp: 0.3,
  sms: 0.12, // por segmento — ver `segments` em SpendRow
  mms: 0.45,
  rcs: 0.18,
  email: 0.0008,
  linkedin: 0.35,
  instagram: 0.2,
};

/**
 * Status em que a mensagem já saiu para o provedor — portanto é cobrada.
 * `failed` fica de fora: a falha ocorre antes do aceite do provedor.
 */
export const BILLABLE_STATUSES = new Set([
  "sent",
  "delivered",
  "read",
  "replied",
  "opted_out",
]);

/**
 * Status que representam dinheiro queimado: a mensagem foi paga mas o
 * resultado é negativo (descadastro) ou nulo (enterrada em dead-letter).
 */
export const WASTED_STATUSES = new Set(["opted_out", "dead_letter"]);

export interface SpendRow {
  channel: string;
  status: string;
  count: number;
  /** Segmentos SMS/RCS acumulados; default 1 por mensagem. */
  segments?: number;
}

export interface ChannelSpend {
  channel: string;
  billable: number;
  wasted: number;
  unitCost: number;
  cost: number;
  wastedCost: number;
  /** Participação do canal no custo total, em %. */
  share: number;
}

export interface SpendSummary {
  totalCost: number;
  wastedCost: number;
  wastedRate: number;
  billableMessages: number;
  byChannel: ChannelSpend[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function unitCostFor(
  channel: string,
  overrides?: Partial<Record<string, number>>,
): number {
  const override = overrides?.[channel];
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return override;
  }
  return DEFAULT_UNIT_COST_BRL[channel as CostChannel] ?? 0;
}

/**
 * Agrega linhas (canal × status × contagem) em custo por canal.
 * Linhas com contagem inválida/negativa são ignoradas — dados de agregação
 * vindos do banco nunca devem produzir custo negativo no painel.
 */
export function summarizeSpend(
  rows: SpendRow[],
  overrides?: Partial<Record<string, number>>,
): SpendSummary {
  const acc = new Map<string, { billable: number; wasted: number; units: number; wastedUnits: number }>();

  for (const row of rows) {
    const count = Number(row.count);
    if (!Number.isFinite(count) || count <= 0) continue;
    if (!BILLABLE_STATUSES.has(row.status)) continue;

    const channel = row.channel || "desconhecido";
    const segments = Number.isFinite(row.segments) && (row.segments as number) > 0
      ? (row.segments as number)
      : count;

    const entry = acc.get(channel) ?? { billable: 0, wasted: 0, units: 0, wastedUnits: 0 };
    entry.billable += count;
    entry.units += segments;
    if (WASTED_STATUSES.has(row.status)) {
      entry.wasted += count;
      entry.wastedUnits += segments;
    }
    acc.set(channel, entry);
  }

  const byChannel: ChannelSpend[] = [];
  let totalCost = 0;
  let wastedCost = 0;
  let billableMessages = 0;

  for (const [channel, entry] of acc) {
    const unitCost = unitCostFor(channel, overrides);
    const cost = entry.units * unitCost;
    const wasted = entry.wastedUnits * unitCost;
    totalCost += cost;
    wastedCost += wasted;
    billableMessages += entry.billable;
    byChannel.push({
      channel,
      billable: entry.billable,
      wasted: entry.wasted,
      unitCost,
      cost: round4(cost),
      wastedCost: round4(wasted),
      share: 0,
    });
  }

  for (const item of byChannel) {
    item.share = totalCost > 0 ? round2((item.cost / totalCost) * 100) : 0;
  }
  byChannel.sort((a, b) => b.cost - a.cost || a.channel.localeCompare(b.channel));

  return {
    totalCost: round2(totalCost),
    wastedCost: round2(wastedCost),
    wastedRate: totalCost > 0 ? round2((wastedCost / totalCost) * 100) : 0,
    billableMessages,
    byChannel,
  };
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}