/**
 * Auditoria de integridade do rastreamento de e-mail — lógica pura,
 * compartilhada entre servidor e testes.
 */

export interface RawTouchpoint {
  id: string;
  fuxico_tracking_id: string | null;
  created_at: string;
}

export interface RawDeliveryEvent {
  touchpoint_id: string | null;
  event_type: string;
  external_id: string | null;
  created_at: string;
}

export interface IntegrityCheck {
  id: string;
  label: string;
  /** Quantidade de ocorrências problemáticas. */
  count: number;
  /** Denominador considerado (0 quando não se aplica). */
  total: number;
  severity: "ok" | "warning" | "error";
  hint: string;
}

export interface TrackingIntegrityReport {
  sends: number;
  events: number;
  trackedSends: number;
  coverageRate: number;
  checks: IntegrityCheck[];
  /** Amostra de reentregas: mesmo envio + mesmo tipo dentro da janela. */
  samples: Array<{ touchpointId: string; eventType: string; occurrences: number }>;
}

/** Janela em que dois eventos idênticos são tratados como reentrega do webhook. */
export const REDELIVERY_WINDOW_MS = 60_000;

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export function buildTrackingIntegrityReport(
  touchpoints: RawTouchpoint[],
  events: RawDeliveryEvent[],
): TrackingIntegrityReport {
  const sends = touchpoints.length;
  const trackedSends = touchpoints.filter((t) => !!t.fuxico_tracking_id).length;
  const untracked = sends - trackedSends;

  // Colisões: o mesmo tracking_id em envios diferentes (o índice único impede
  // novas ocorrências, mas dados legados podem existir).
  const byTracking = new Map<string, number>();
  for (const t of touchpoints) {
    if (!t.fuxico_tracking_id) continue;
    byTracking.set(t.fuxico_tracking_id, (byTracking.get(t.fuxico_tracking_id) ?? 0) + 1);
  }
  const collisions = [...byTracking.values()].filter((n) => n > 1).length;

  const knownTouchpoints = new Set(touchpoints.map((t) => t.id));
  const orphans = events.filter(
    (e) => !e.touchpoint_id || !knownTouchpoints.has(e.touchpoint_id),
  ).length;
  const nonIdempotent = events.filter((e) => !e.external_id).length;

  // Reentregas: eventos idênticos muito próximos no tempo.
  const grouped = new Map<string, number[]>();
  for (const e of events) {
    if (!e.touchpoint_id) continue;
    const key = `${e.touchpoint_id}::${e.event_type}`;
    const ts = Date.parse(e.created_at);
    if (Number.isNaN(ts)) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), ts]);
  }
  const samples: TrackingIntegrityReport["samples"] = [];
  let redeliveries = 0;
  for (const [key, stamps] of grouped) {
    stamps.sort((a, b) => a - b);
    let burst = 0;
    for (let i = 1; i < stamps.length; i++) {
      if (stamps[i] - stamps[i - 1] <= REDELIVERY_WINDOW_MS) burst += 1;
    }
    if (burst > 0) {
      redeliveries += burst;
      const [touchpointId, eventType] = key.split("::");
      samples.push({ touchpointId, eventType, occurrences: burst + 1 });
    }
  }
  samples.sort((a, b) => b.occurrences - a.occurrences);

  const checks: IntegrityCheck[] = [
    {
      id: "untracked",
      label: "Envios sem código de rastreio",
      count: untracked,
      total: sends,
      severity: untracked === 0 ? "ok" : untracked > sends * 0.1 ? "error" : "warning",
      hint: "Esses e-mails não geram abertura nem clique no relatório. Verifique a configuração do Fuxico.",
    },
    {
      id: "collisions",
      label: "Códigos de rastreio repetidos",
      count: collisions,
      total: trackedSends,
      severity: collisions === 0 ? "ok" : "error",
      hint: "Dois envios com o mesmo código embaralham as métricas. Regravar o envio resolve.",
    },
    {
      id: "orphans",
      label: "Eventos sem envio correspondente",
      count: orphans,
      total: events.length,
      severity: orphans === 0 ? "ok" : "warning",
      hint: "O rastreio chegou, mas o envio original não foi encontrado no período analisado.",
    },
    {
      id: "non_idempotent",
      label: "Eventos sem identificador do provedor",
      count: nonIdempotent,
      total: events.length,
      severity: nonIdempotent === 0 ? "ok" : "warning",
      hint: "Sem esse identificador não é possível descartar reenvios automaticamente.",
    },
    {
      id: "redeliveries",
      label: "Prováveis reentregas do webhook",
      count: redeliveries,
      total: events.length,
      severity: redeliveries === 0 ? "ok" : "warning",
      hint: "Eventos idênticos em menos de 1 minuto costumam ser reenvio do provedor.",
    },
  ];

  return {
    sends,
    events: events.length,
    trackedSends,
    coverageRate: pct(trackedSends, sends),
    checks,
    samples: samples.slice(0, 20),
  };
}
