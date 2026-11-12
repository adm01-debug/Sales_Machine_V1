import { describe, expect, it } from "vitest";
import {
  buildTrackingIntegrityReport,
  REDELIVERY_WINDOW_MS,
  type RawDeliveryEvent,
  type RawTouchpoint,
} from "./tracking-integrity";

const t0 = Date.parse("2026-07-20T12:00:00.000Z");
const at = (ms: number) => new Date(t0 + ms).toISOString();

const tp = (id: string, tracking: string | null): RawTouchpoint => ({
  id,
  fuxico_tracking_id: tracking,
  created_at: at(0),
});

const ev = (
  touchpoint_id: string | null,
  event_type: string,
  offsetMs: number,
  external_id: string | null = `ext-${touchpoint_id}-${offsetMs}`,
): RawDeliveryEvent => ({ touchpoint_id, event_type, external_id, created_at: at(offsetMs) });

const check = (r: ReturnType<typeof buildTrackingIntegrityReport>, id: string) =>
  r.checks.find((c) => c.id === id)!;

describe("buildTrackingIntegrityReport — estado saudável", () => {
  it("sem dados devolve zeros e nenhum alerta", () => {
    const r = buildTrackingIntegrityReport([], []);
    expect(r).toMatchObject({ sends: 0, events: 0, trackedSends: 0, coverageRate: 0 });
    expect(r.checks.every((c) => c.severity === "ok")).toBe(true);
    expect(r.samples).toEqual([]);
  });

  it("cobertura total não gera alertas", () => {
    const r = buildTrackingIntegrityReport(
      [tp("a", "trk-a"), tp("b", "trk-b")],
      [ev("a", "opened", 0), ev("b", "clicked", 0)],
    );
    expect(r.coverageRate).toBe(100);
    expect(r.checks.every((c) => c.severity === "ok")).toBe(true);
  });
});

describe("cobertura de rastreio", () => {
  it("avisa quando a lacuna é pequena e falha quando passa de 10%", () => {
    const nine = [...Array(9)].map((_, i) => tp(`ok${i}`, `t${i}`));
    expect(
      check(buildTrackingIntegrityReport([...nine, tp("x", null)], []), "untracked"),
    ).toMatchObject({ count: 1, severity: "warning" });

    const r = buildTrackingIntegrityReport([tp("a", "t"), tp("b", null)], []);
    expect(check(r, "untracked").severity).toBe("error");
    expect(r.coverageRate).toBe(50);
  });
});

describe("colisões de código de rastreio", () => {
  it("marca como erro dois envios com o mesmo código", () => {
    const r = buildTrackingIntegrityReport([tp("a", "dup"), tp("b", "dup"), tp("c", "ok")], []);
    expect(check(r, "collisions")).toMatchObject({ count: 1, severity: "error" });
  });

  it("não confunde vários envios sem código com colisão", () => {
    const r = buildTrackingIntegrityReport([tp("a", null), tp("b", null)], []);
    expect(check(r, "collisions").count).toBe(0);
  });
});

describe("eventos órfãos e idempotência", () => {
  it("conta eventos sem touchpoint ou apontando para envio desconhecido", () => {
    const r = buildTrackingIntegrityReport(
      [tp("a", "t")],
      [ev("a", "opened", 0), ev(null, "opened", 1), ev("zzz", "clicked", 2)],
    );
    expect(check(r, "orphans")).toMatchObject({ count: 2, severity: "warning" });
  });

  it("conta eventos sem identificador do provedor", () => {
    const r = buildTrackingIntegrityReport([tp("a", "t")], [ev("a", "opened", 0, null)]);
    expect(check(r, "non_idempotent")).toMatchObject({ count: 1, severity: "warning" });
  });
});

describe("reentregas do webhook", () => {
  it("detecta eventos idênticos dentro da janela", () => {
    const r = buildTrackingIntegrityReport(
      [tp("a", "t")],
      [ev("a", "opened", 0), ev("a", "opened", 5_000), ev("a", "opened", 9_000)],
    );
    expect(check(r, "redeliveries").count).toBe(2);
    expect(r.samples[0]).toEqual({ touchpointId: "a", eventType: "opened", occurrences: 3 });
  });

  it("não acusa aberturas legítimas separadas no tempo", () => {
    const r = buildTrackingIntegrityReport(
      [tp("a", "t")],
      [ev("a", "opened", 0), ev("a", "opened", REDELIVERY_WINDOW_MS + 1)],
    );
    expect(check(r, "redeliveries").count).toBe(0);
    expect(r.samples).toEqual([]);
  });

  it("não mistura tipos de evento diferentes", () => {
    const r = buildTrackingIntegrityReport(
      [tp("a", "t")],
      [ev("a", "opened", 0), ev("a", "clicked", 100)],
    );
    expect(check(r, "redeliveries").count).toBe(0);
  });

  it("ordena a amostra pelas maiores rajadas e limita a 20 linhas", () => {
    const events: RawDeliveryEvent[] = [];
    for (let i = 0; i < 25; i++) {
      events.push(ev(`tp${i}`, "opened", 0), ev(`tp${i}`, "opened", 1_000));
    }
    events.push(ev("tp0", "opened", 2_000));
    const r = buildTrackingIntegrityReport(
      [...Array(25)].map((_, i) => tp(`tp${i}`, `t${i}`)),
      events,
    );
    expect(r.samples).toHaveLength(20);
    expect(r.samples[0].touchpointId).toBe("tp0");
  });

  it("ignora datas inválidas sem quebrar", () => {
    const r = buildTrackingIntegrityReport(
      [tp("a", "t")],
      [{ touchpoint_id: "a", event_type: "opened", external_id: "x", created_at: "não-é-data" }],
    );
    expect(check(r, "redeliveries").count).toBe(0);
  });
});
