import { describe, expect, it } from "vitest";
import { buildOpsAlerts, TRACKING_COVERAGE_FLOOR } from "./ops-alerts";

const health = (o: Partial<Parameters<typeof buildOpsAlerts>[0]["health"] & object> = {}) => ({
  dead_letter: 0,
  queued: 0,
  running: 0,
  sent_24h: 0,
  replies_24h: 0,
  opt_outs_7d: 0,
  ...o,
});
const ids = (a: ReturnType<typeof buildOpsAlerts>) => a.map((x) => x.id);

describe("buildOpsAlerts — silêncio quando está tudo bem", () => {
  it("sem dados não inventa alertas", () => {
    expect(buildOpsAlerts({})).toEqual([]);
    expect(buildOpsAlerts({ health: null, deliverability: null, tracking: null })).toEqual([]);
  });

  it("operação saudável não gera ruído", () => {
    expect(
      ids(
        buildOpsAlerts({
          health: health({ running: 5, sent_24h: 100, replies_24h: 8, opt_outs_7d: 1 }),
          deliverability: { opened: 60, clicked: 20, hard_bounce: 1, complaint: 0 },
          tracking: { sends: 100, coverageRate: 100, collisions: 0, redeliveries: 0 },
        }),
      ),
    ).toEqual([]);
  });
});

describe("alertas de pipeline", () => {
  it("dead-letter é sempre crítico", () => {
    const [a] = buildOpsAlerts({ health: health({ dead_letter: 3 }) });
    expect(a).toMatchObject({ id: "dead_letter", level: "critical" });
    expect(a.title).toContain("3");
  });

  it("fila parada sem envios indica cron caído", () => {
    expect(ids(buildOpsAlerts({ health: health({ queued: 40 }) }))).toContain("pipeline_stalled");
  });

  it("não acusa parada se há execução ou envios recentes", () => {
    expect(ids(buildOpsAlerts({ health: health({ queued: 40, running: 2 }) }))).not.toContain(
      "pipeline_stalled",
    );
    expect(ids(buildOpsAlerts({ health: health({ queued: 40, sent_24h: 5 }) }))).not.toContain(
      "pipeline_stalled",
    );
  });

  it("exige amostra mínima antes de reclamar de zero respostas", () => {
    expect(ids(buildOpsAlerts({ health: health({ sent_24h: 19 }) }))).not.toContain("no_replies");
    expect(ids(buildOpsAlerts({ health: health({ sent_24h: 20 }) }))).toContain("no_replies");
  });

  it("dispara opt-out acima de 5% e respeita o limite exato", () => {
    expect(
      ids(buildOpsAlerts({ health: health({ sent_24h: 100, replies_24h: 1, opt_outs_7d: 5 }) })),
    ).not.toContain("opt_out_rate");
    expect(
      ids(buildOpsAlerts({ health: health({ sent_24h: 100, replies_24h: 1, opt_outs_7d: 6 }) })),
    ).toContain("opt_out_rate");
  });
});

describe("alertas de entregabilidade", () => {
  it("ignora amostras pequenas para não gerar pânico", () => {
    expect(
      buildOpsAlerts({ deliverability: { opened: 1, clicked: 0, hard_bounce: 5, complaint: 3 } }),
    ).toEqual([]);
  });

  it("bounce acima de 5% e reclamação acima de 0,3% são críticos", () => {
    const a = buildOpsAlerts({
      deliverability: { opened: 80, clicked: 0, hard_bounce: 10, complaint: 10 },
    });
    expect(ids(a)).toEqual(["bounce_rate", "complaint_rate"]);
    expect(a.every((x) => x.level === "critical")).toBe(true);
  });

  it("não divide por zero quando não há eventos", () => {
    expect(
      buildOpsAlerts({ deliverability: { opened: 0, clicked: 0, hard_bounce: 0, complaint: 0 } }),
    ).toEqual([]);
  });
});

describe("alertas de rastreio", () => {
  it("dispara abaixo do piso de cobertura e silencia exatamente no piso", () => {
    const base = { sends: 100, collisions: 0, redeliveries: 0 };
    expect(
      ids(buildOpsAlerts({ tracking: { ...base, coverageRate: TRACKING_COVERAGE_FLOOR } })),
    ).not.toContain("tracking_coverage");
    const a = buildOpsAlerts({ tracking: { ...base, coverageRate: 82.5 } });
    expect(a[0]).toMatchObject({ id: "tracking_coverage", level: "warning" });
    expect(a[0].title).toContain("82.5%");
  });

  it("ignora rastreio quando não houve envios", () => {
    expect(
      buildOpsAlerts({ tracking: { sends: 0, coverageRate: 0, collisions: 0, redeliveries: 0 } }),
    ).toEqual([]);
  });

  it("colisões são críticas e reentregas são aviso", () => {
    const a = buildOpsAlerts({
      tracking: { sends: 10, coverageRate: 100, collisions: 2, redeliveries: 4 },
    });
    expect(a.map((x) => [x.id, x.level])).toEqual([
      ["tracking_collisions", "critical"],
      ["tracking_redeliveries", "warning"],
    ]);
  });
});

describe("ordenação", () => {
  it("coloca críticos antes dos avisos", () => {
    const a = buildOpsAlerts({
      health: health({ sent_24h: 50, dead_letter: 1 }),
      tracking: { sends: 50, coverageRate: 10, collisions: 0, redeliveries: 0 },
    });
    expect(a.map((x) => x.level)).toEqual(["critical", "warning", "warning"]);
  });
});
describe("regra de bloqueio por consentimento", () => {
  it("silencia quando não há bloqueios", () => {
    const alerts = buildOpsAlerts({ compliance: { blockedByConsent: 0, deliveryAttempts: 500 } });
    expect(alerts).toHaveLength(0);
  });

  it("silencia em amostra pequena mesmo com taxa alta", () => {
    const alerts = buildOpsAlerts({ compliance: { blockedByConsent: 3, deliveryAttempts: 2 } });
    expect(alerts).toHaveLength(0);
  });

  it("alerta como warning acima de 10%", () => {
    const alerts = buildOpsAlerts({ compliance: { blockedByConsent: 15, deliveryAttempts: 85 } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: "consent_block_rate", level: "warning" });
  });

  it("escala para crítico acima de 25%", () => {
    const alerts = buildOpsAlerts({ compliance: { blockedByConsent: 40, deliveryAttempts: 60 } });
    expect(alerts[0]).toMatchObject({ id: "consent_block_rate_critical", level: "critical" });
  });

  it("nunca emite as duas variantes ao mesmo tempo", () => {
    const alerts = buildOpsAlerts({ compliance: { blockedByConsent: 50, deliveryAttempts: 50 } });
    expect(alerts.filter((a) => a.id.startsWith("consent_block"))).toHaveLength(1);
  });
});
