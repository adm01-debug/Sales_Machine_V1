import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRIGGER_CONFIG,
  decideEnrollment,
  matchesTrigger,
  parseTriggerConfig,
  type EnrollmentFacts,
} from "./journey-triggers";

const NOW = new Date("2026-07-26T12:00:00.000Z");

describe("parseTriggerConfig", () => {
  it("cai no padrão com JSON inválido", () => {
    expect(parseTriggerConfig(null)).toEqual(DEFAULT_TRIGGER_CONFIG);
    expect(parseTriggerConfig("texto")).toEqual(DEFAULT_TRIGGER_CONFIG);
    expect(parseTriggerConfig(42)).toEqual(DEFAULT_TRIGGER_CONFIG);
  });

  it("aceita lista, string única e CSV normalizando caixa", () => {
    expect(parseTriggerConfig({ event_types: ["Click", " reply "] }).eventTypes).toEqual([
      "click",
      "reply",
    ]);
    expect(parseTriggerConfig({ event_type: "OPEN" }).eventTypes).toEqual(["open"]);
    expect(parseTriggerConfig({ sources: "lux, FUXICO" }).sources).toEqual(["lux", "fuxico"]);
  });

  it("descarta cooldown inválido e audiência vazia", () => {
    const c = parseTriggerConfig({ cooldown_hours: "-5", audience_id: "   " });
    expect(c.cooldownHours).toBe(0);
    expect(c.audienceId).toBeNull();
    expect(parseTriggerConfig({ cooldown_hours: "24,5" }).cooldownHours).toBe(24.5);
  });

  it("normaliza condições e modo de combinação", () => {
    const c = parseTriggerConfig({
      match: "any",
      conditions: [{ field: "score", op: "gte", value: 10 }, { op: "eq" }, "lixo"],
    });
    expect(c.match).toBe("any");
    expect(c.conditions).toHaveLength(1);
  });
});

describe("matchesTrigger", () => {
  const event = {
    eventType: "reply",
    source: "singu",
    profile: { score: 40, stage: "lead" },
    audienceIds: ["aud-1"],
  };

  it("config vazia casa com qualquer evento", () => {
    expect(matchesTrigger(DEFAULT_TRIGGER_CONFIG, event)).toBe(true);
  });

  it("filtra por tipo e origem", () => {
    expect(matchesTrigger(parseTriggerConfig({ event_types: ["reply"] }), event)).toBe(true);
    expect(matchesTrigger(parseTriggerConfig({ event_types: ["click"] }), event)).toBe(false);
    expect(matchesTrigger(parseTriggerConfig({ sources: ["lux"] }), event)).toBe(false);
  });

  it("filtra por audiência de entrada", () => {
    expect(matchesTrigger(parseTriggerConfig({ audience_id: "aud-1" }), event)).toBe(true);
    expect(matchesTrigger(parseTriggerConfig({ audience_id: "aud-2" }), event)).toBe(false);
    expect(
      matchesTrigger(parseTriggerConfig({ audience_id: "aud-1" }), {
        ...event,
        audienceIds: undefined,
      }),
    ).toBe(false);
  });

  it("aplica condições sobre o perfil 360", () => {
    expect(
      matchesTrigger(
        parseTriggerConfig({ conditions: [{ field: "score", op: "gte", value: 30 }] }),
        event,
      ),
    ).toBe(true);
    expect(
      matchesTrigger(
        parseTriggerConfig({
          match: "all",
          conditions: [
            { field: "score", op: "gte", value: 30 },
            { field: "stage", op: "eq", value: "cliente" },
          ],
        }),
        event,
      ),
    ).toBe(false);
    expect(
      matchesTrigger(
        parseTriggerConfig({
          match: "any",
          conditions: [
            { field: "score", op: "gte", value: 30 },
            { field: "stage", op: "eq", value: "cliente" },
          ],
        }),
        event,
      ),
    ).toBe(true);
  });
});

describe("decideEnrollment", () => {
  const base: EnrollmentFacts = {
    journeyStatus: "active",
    allowReentry: false,
    hasActiveEnrollment: false,
    lastFinishedAt: null,
    entriesToday: 0,
    entryDailyCap: 100,
    consentAllowed: true,
    now: NOW,
  };

  it("permite a primeira entrada", () => {
    expect(decideEnrollment(base).shouldEnroll).toBe(true);
  });

  it("bloqueia jornada inativa", () => {
    expect(decideEnrollment({ ...base, journeyStatus: "draft" }).code).toBe("journey_inactive");
  });

  it("bloqueia sem consentimento antes de qualquer outra regra", () => {
    expect(decideEnrollment({ ...base, consentAllowed: false }).code).toBe("no_consent");
  });

  it("trata consentimento indeterminado como permitido", () => {
    expect(decideEnrollment({ ...base, consentAllowed: null }).shouldEnroll).toBe(true);
  });

  it("bloqueia contato já inscrito", () => {
    expect(decideEnrollment({ ...base, hasActiveEnrollment: true }).code).toBe("already_enrolled");
  });

  it("bloqueia reentrada quando a jornada não permite", () => {
    expect(
      decideEnrollment({ ...base, lastFinishedAt: "2026-07-01T00:00:00.000Z" }).code,
    ).toBe("reentry_blocked");
  });

  it("respeita o cooldown de reentrada", () => {
    const facts = {
      ...base,
      allowReentry: true,
      lastFinishedAt: "2026-07-26T06:00:00.000Z",
    };
    const cfg = parseTriggerConfig({ cooldown_hours: 24 });
    const blocked = decideEnrollment(facts, cfg);
    expect(blocked.code).toBe("cooldown");
    expect(blocked.reason).toContain("18h");
    expect(
      decideEnrollment({ ...facts, lastFinishedAt: "2026-07-24T06:00:00.000Z" }, cfg).shouldEnroll,
    ).toBe(true);
  });

  it("ignora data inválida no histórico em vez de travar para sempre", () => {
    expect(
      decideEnrollment(
        { ...base, allowReentry: true, lastFinishedAt: "não-é-data" },
        parseTriggerConfig({ cooldown_hours: 24 }),
      ).shouldEnroll,
    ).toBe(true);
  });

  it("respeita o teto diário de entradas", () => {
    expect(decideEnrollment({ ...base, entriesToday: 100 }).code).toBe("entry_cap");
    expect(
      decideEnrollment({ ...base, entriesToday: 100, entryDailyCap: 0 }).shouldEnroll,
    ).toBe(true);
  });
});