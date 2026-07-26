import { describe, expect, it } from "vitest";
import {
  BACKOFF_MINUTES,
  COOLDOWN_DEFER_MS,
  EMAIL_CAP_DEFER_MS,
  advancePlan,
  decideCadenceAction,
  decideFailureOutcome,
  isRcsFallbackError,
  isSocialChannel,
  nextRetryAt,
  resolveSteps,
  type CadenceFacts,
  type CadenceStep,
} from "./cadence-engine";

const NOW = Date.parse("2026-07-26T12:00:00.000Z");

const steps: CadenceStep[] = [
  { channel: "whatsapp", delay_days: 0 },
  { channel: "email", delay_days: 2 },
  { channel: "linkedin", delay_days: 4 },
];

function facts(over: Partial<CadenceFacts> = {}): CadenceFacts {
  return {
    currentStep: 0,
    steps,
    consentAllowed: true,
    hasRecentAccountTouchpoint: false,
    accountCooldownHours: 48,
    emailHardBounce: false,
    emailSentToday: 0,
    emailDailyCap: 50,
    requiresHumanApproval: false,
    ...over,
  };
}

describe("resolveSteps", () => {
  it("usa cadência padrão quando o JSON não é lista", () => {
    expect(resolveSteps(null).map((s) => s.channel)).toEqual(["whatsapp", "email"]);
    expect(resolveSteps({ channel: "sms" }).map((s) => s.channel)).toEqual(["whatsapp", "email"]);
  });

  it("descarta passos malformados sem derrubar o tick", () => {
    const out = resolveSteps([{ channel: "SMS ", delay_days: "3" }, { delay_days: 1 }, null, "x"]);
    expect(out).toEqual([{ channel: "sms", delay_days: 3 }]);
  });

  it("normaliza delay negativo/NaN para zero e preserva mídia", () => {
    const out = resolveSteps([
      { channel: "mms", delay_days: -5, media_url: "https://x/y.png" },
      { channel: "rcs", delay_days: "abc", rcs_payload: { cards: [] } },
    ]);
    expect(out[0]).toEqual({ channel: "mms", delay_days: 0, media_url: "https://x/y.png" });
    expect(out[1]).toEqual({ channel: "rcs", delay_days: 0, rcs_payload: { cards: [] } });
  });

  it("cai para o padrão quando todos os passos são inválidos", () => {
    expect(resolveSteps([{}, null]).map((s) => s.channel)).toEqual(["whatsapp", "email"]);
  });
});

describe("decideCadenceAction", () => {
  it("conclui quando o índice ultrapassa a cadência", () => {
    expect(decideCadenceAction(facts({ currentStep: 3 })).action).toBe("complete");
  });

  it("bloqueia definitivamente sem consentimento (LGPD)", () => {
    const d = decideCadenceAction(facts({ consentAllowed: false }));
    expect(d.action).toBe("stop");
    expect(d).toMatchObject({ reason: expect.stringContaining("whatsapp") });
  });

  it("opt-out tem precedência sobre cooldown e gate humano", () => {
    const d = decideCadenceAction(
      facts({ consentAllowed: false, hasRecentAccountTouchpoint: true, requiresHumanApproval: true }),
    );
    expect(d.action).toBe("stop");
  });

  it("trata consentimento indeterminado como opt-in implícito", () => {
    expect(decideCadenceAction(facts({ consentAllowed: null })).action).toBe("send");
  });

  it("adia 24h no cooldown de conta", () => {
    const d = decideCadenceAction(facts({ hasRecentAccountTouchpoint: true }));
    expect(d).toEqual({ action: "defer", reason: "account cooldown 48h", delayMs: COOLDOWN_DEFER_MS });
  });

  it("para o target em hard bounce de e-mail", () => {
    const d = decideCadenceAction(facts({ currentStep: 1, emailHardBounce: true }));
    expect(d.action).toBe("stop");
  });

  it("ignora hard bounce quando o passo não é e-mail", () => {
    expect(decideCadenceAction(facts({ emailHardBounce: true })).action).toBe("send");
  });

  it("adia 1h ao atingir o cap diário de e-mail", () => {
    const d = decideCadenceAction(facts({ currentStep: 1, emailSentToday: 50, emailDailyCap: 50 }));
    expect(d).toEqual({ action: "defer", reason: "email cap 50 atingido", delayMs: EMAIL_CAP_DEFER_MS });
  });

  it("envia quando ainda há folga no cap", () => {
    expect(decideCadenceAction(facts({ currentStep: 1, emailSentToday: 49, emailDailyCap: 50 })).action).toBe("send");
  });

  it("cap tem precedência sobre gate humano", () => {
    const d = decideCadenceAction(
      facts({ currentStep: 1, emailSentToday: 99, emailDailyCap: 50, requiresHumanApproval: true }),
    );
    expect(d.action).toBe("defer");
  });

  it("roteia para aprovação humana quando exigido", () => {
    const d = decideCadenceAction(facts({ requiresHumanApproval: true }));
    expect(d).toMatchObject({ action: "approval_gate", step: steps[0] });
  });
});

describe("decideFailureOutcome", () => {
  it("aplica backoff crescente até o teto", () => {
    const seq = [0, 1, 2, 3, 4, 9].map((a) => decideFailureOutcome(a, 99, "boom", NOW));
    const minutes = seq.map((o) =>
      o.action === "retry" ? (Date.parse(o.nextRunAt) - NOW) / 60_000 : -1,
    );
    // attempts é incrementado antes do backoff: 0 falhas prévias → 1ª espera de 5min.
    expect(minutes).toEqual([5, 30, 120, 480, 480, 480]);
  });

  it("manda para dead_letter ao atingir max_attempts", () => {
    expect(decideFailureOutcome(4, 5, "boom", NOW)).toEqual({
      action: "dead_letter",
      attempts: 5,
      error: "boom",
    });
  });

  it("normaliza attempts/maxAttempts inválidos", () => {
    expect(decideFailureOutcome(Number.NaN, 0, "e", NOW)).toMatchObject({ action: "retry", attempts: 1 });
    expect(decideFailureOutcome(-3, 5, "e", NOW)).toMatchObject({ attempts: 1 });
  });

  it("nextRetryAt satura no último degrau do backoff", () => {
    expect(nextRetryAt(100, NOW)).toBe(new Date(NOW + BACKOFF_MINUTES.at(-1)! * 60_000).toISOString());
    expect(nextRetryAt(0, NOW)).toBe(new Date(NOW + 60_000).toISOString());
  });
});

describe("advancePlan", () => {
  it("agenda o próximo passo respeitando delay_days", () => {
    expect(advancePlan(0, steps, NOW)).toEqual({
      done: false,
      nextStep: 1,
      nextRunAt: new Date(NOW + 2 * 86_400_000).toISOString(),
    });
  });

  it("finaliza no último passo", () => {
    expect(advancePlan(2, steps, NOW)).toEqual({ done: true });
  });
});

describe("helpers de canal", () => {
  it("reconhece canais sociais", () => {
    expect(isSocialChannel("linkedin")).toBe(true);
    expect(isSocialChannel("instagram")).toBe(true);
    expect(isSocialChannel("whatsapp")).toBe(false);
  });

  it("detecta erros de RCS elegíveis a fallback SMS", () => {
    expect(isRcsFallbackError("channel not_supported")).toBe(true);
    expect(isRcsFallbackError("HTTP 404 Not Found")).toBe(true);
    expect(isRcsFallbackError("carrier unavailable")).toBe(true);
    expect(isRcsFallbackError("invalid credentials")).toBe(false);
  });
});