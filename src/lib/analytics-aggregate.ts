/**
 * Agregações puras usadas pelos gráficos do painel.
 * Mantidas fora do módulo de server functions para não quebrar o code-splitting.
 */

export interface TouchpointRow {
  channel: string;
  direction: string;
  status: string;
  created_at: string;
}

export interface DailyPoint {
  date: string;
  label: string;
  sent: number;
  replies: number;
  failed: number;
}

export interface ChannelPoint {
  channel: string;
  sent: number;
  replies: number;
  failed: number;
  reply_rate: number;
}

/** Série diária dos últimos `days` dias, sempre com todos os dias preenchidos. */
export function buildDailySeries(rows: TouchpointRow[], days: number): DailyPoint[] {
  const buckets = new Map<string, DailyPoint>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, {
      date: key,
      label: `${key.slice(8, 10)}/${key.slice(5, 7)}`,
      sent: 0,
      replies: 0,
      failed: 0,
    });
  }

  for (const row of rows) {
    const key = (row.created_at ?? "").slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (row.direction === "inbound") bucket.replies += 1;
    else if (row.status === "failed" || row.status === "dead_letter") bucket.failed += 1;
    else bucket.sent += 1;
  }

  return [...buckets.values()];
}

/** Volume e taxa de resposta por canal, ordenado por volume. */
export function buildChannelBreakdown(rows: TouchpointRow[]): ChannelPoint[] {
  const map = new Map<string, ChannelPoint>();
  for (const row of rows) {
    const bucket = map.get(row.channel) ?? {
      channel: row.channel,
      sent: 0,
      replies: 0,
      failed: 0,
      reply_rate: 0,
    };
    if (row.direction === "inbound") bucket.replies += 1;
    else if (row.status === "failed" || row.status === "dead_letter") bucket.failed += 1;
    else bucket.sent += 1;
    map.set(row.channel, bucket);
  }
  return [...map.values()]
    .map((c) => ({ ...c, reply_rate: c.sent > 0 ? (c.replies / c.sent) * 100 : 0 }))
    .sort((a, b) => b.sent - a.sent);
}

/** Funil de entrega a partir dos estados dos envios materializados. */
export interface PeriodTotals {
  sent: number;
  replies: number;
  failed: number;
  reply_rate: number;
}

/** Totais agregados de um conjunto de touchpoints. */
export function buildTotals(rows: TouchpointRow[]): PeriodTotals {
  let sent = 0;
  let replies = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.direction === "inbound") replies += 1;
    else if (row.status === "failed" || row.status === "dead_letter") failed += 1;
    else sent += 1;
  }
  return { sent, replies, failed, reply_rate: sent > 0 ? (replies / sent) * 100 : 0 };
}

/**
 * Variação percentual entre dois valores.
 * Retorna null quando não há base de comparação (período anterior zerado).
 */
export function pctDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function buildFunnel(states: Record<string, number>) {
  const get = (...keys: string[]) => keys.reduce((acc, k) => acc + (states[k] ?? 0), 0);
  const queued = get("queued", "pending", "pending_approval");
  const sent = get("sent", "delivered", "read", "replied");
  const delivered = get("delivered", "read", "replied");
  const replied = get("replied");
  const total = queued + sent + get("failed", "dead_letter");
  return [
    { stage: "Fila", value: total },
    { stage: "Enviadas", value: sent },
    { stage: "Entregues", value: delivered },
    { stage: "Respondidas", value: replied },
  ];
}

/** Métricas por canal de uma campanha específica (drill-down). */
export interface CampaignChannelPoint {
  channel: string;
  sent: number;
  delivered: number;
  replied: number;
  failed: number;
  reply_rate: number;
}

export function buildCampaignChannelBreakdown(
  rows: { channel: string; status: string; direction: string }[],
): CampaignChannelPoint[] {
  const map = new Map<string, CampaignChannelPoint>();
  for (const row of rows) {
    const bucket =
      map.get(row.channel) ??
      ({
        channel: row.channel,
        sent: 0,
        delivered: 0,
        replied: 0,
        failed: 0,
        reply_rate: 0,
      } satisfies CampaignChannelPoint);

    if (row.direction === "inbound" || row.status === "replied") bucket.replied += 1;
    else if (row.status === "failed" || row.status === "dead_letter") bucket.failed += 1;
    else bucket.sent += 1;

    if (row.status === "delivered" || row.status === "read" || row.status === "replied") {
      bucket.delivered += 1;
    }
    map.set(row.channel, bucket);
  }
  return [...map.values()]
    .map((c) => ({ ...c, reply_rate: c.sent > 0 ? (c.replied / c.sent) * 100 : 0 }))
    .sort((a, b) => b.sent - a.sent);
}

/** Etapas do envio de uma campanha, derivadas dos estados de campaign_sends. */
export function buildCampaignStages(states: Record<string, number>) {
  const get = (...keys: string[]) => keys.reduce((acc, k) => acc + (states[k] ?? 0), 0);
  return [
    { stage: "Materializados", value: Object.values(states).reduce((a, b) => a + b, 0) },
    { stage: "Na fila", value: get("queued", "pending", "pending_approval", "scheduled") },
    { stage: "Enviados", value: get("sent", "delivered", "read", "replied", "done") },
    { stage: "Entregues", value: get("delivered", "read", "replied") },
    { stage: "Respondidos", value: get("replied") },
    { stage: "Falhas", value: get("failed", "dead_letter", "error") },
  ];
}