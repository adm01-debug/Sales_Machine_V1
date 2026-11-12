import { describe, expect, it } from "vitest";
import { buildBudgetSnapshot, evaluateChannelBudget, type ChannelBudget } from "./budget-guard";

const budget = (over: Partial<ChannelBudget> = {}): ChannelBudget => ({
  channel: "sms",
  daily_limit_brl: 100,
  monthly_limit_brl: 1000,
  enabled: true,
  ...over,
});

describe("evaluateChannelBudget", () => {
  it("libera quando o gasto está abaixo do teto", () => {
    const s = evaluateChannelBudget(budget(), { spentToday: 10, spentMonth: 100 });
    expect(s.status).toBe("ok");
    expect(s.blocked).toBe(false);
    expect(s.usageRate).toBe(10);
    expect(s.remainingToday).toBe(90);
  });

  it("alerta a partir de 80% do teto diário", () => {
    const s = evaluateChannelBudget(budget(), { spentToday: 80 });
    expect(s.status).toBe("warning");
    expect(s.blocked).toBe(false);
  });

  it("alerta a partir de 80% do teto mensal mesmo com dia tranquilo", () => {
    const s = evaluateChannelBudget(budget(), { spentToday: 5, spentMonth: 900 });
    expect(s.status).toBe("warning");
    expect(s.monthlyUsageRate).toBe(90);
  });

  it("bloqueia ao atingir exatamente o teto diário", () => {
    const s = evaluateChannelBudget(budget(), { spentToday: 100 });
    expect(s.status).toBe("exhausted");
    expect(s.blocked).toBe(true);
    expect(s.remainingToday).toBe(0);
  });

  it("teto mensal tem precedência sobre o diário", () => {
    const s = evaluateChannelBudget(budget(), { spentToday: 1, spentMonth: 1000 });
    expect(s.reason).toContain("mensal");
  });

  it("canal desativado bloqueia mesmo sem gasto", () => {
    const s = evaluateChannelBudget(budget({ enabled: false }), {});
    expect(s.status).toBe("disabled");
    expect(s.blocked).toBe(true);
  });

  it("fail-open: sem linha de orçamento não bloqueia", () => {
    const s = evaluateChannelBudget(null, { spentToday: 9999 }, "whatsapp");
    expect(s.channel).toBe("whatsapp");
    expect(s.blocked).toBe(false);
    expect(s.usageRate).toBeNull();
  });

  it("limite zero é tratado como ausência de teto", () => {
    const s = evaluateChannelBudget(budget({ daily_limit_brl: 0, monthly_limit_brl: 0 }), {
      spentToday: 500,
    });
    expect(s.blocked).toBe(false);
    expect(s.remainingToday).toBeNull();
  });

  it("normaliza valores inválidos ou negativos para zero", () => {
    const s = evaluateChannelBudget(budget(), { spentToday: Number.NaN, spentMonth: -50 });
    expect(s.spentToday).toBe(0);
    expect(s.spentMonth).toBe(0);
  });

  it("gasto mensal nunca fica abaixo do gasto do dia", () => {
    const s = evaluateChannelBudget(budget(), { spentToday: 40, spentMonth: 10 });
    expect(s.spentMonth).toBe(40);
  });
});

describe("buildBudgetSnapshot", () => {
  it("cruza tetos com gastos e lista canais bloqueados", () => {
    const snap = buildBudgetSnapshot(
      [budget({ channel: "sms" }), budget({ channel: "email", daily_limit_brl: 10 })],
      { sms: { spentToday: 5 }, email: { spentToday: 10 } },
    );
    expect(snap.blockedChannels.has("email")).toBe(true);
    expect(snap.blockedChannels.has("sms")).toBe(false);
    expect(snap.totalSpentToday).toBe(15);
    expect(snap.totalDailyLimit).toBe(110);
  });

  it("inclui canais com gasto mas sem teto configurado", () => {
    const snap = buildBudgetSnapshot([], { linkedin: { spentToday: 33 } });
    expect(snap.states).toHaveLength(1);
    expect(snap.states[0].channel).toBe("linkedin");
    expect(snap.blockedChannels.size).toBe(0);
  });

  it("ordena do maior consumo relativo para o menor", () => {
    const snap = buildBudgetSnapshot(
      [
        budget({ channel: "a", daily_limit_brl: 100 }),
        budget({ channel: "b", daily_limit_brl: 100 }),
      ],
      { a: { spentToday: 10 }, b: { spentToday: 90 } },
    );
    expect(snap.states[0].channel).toBe("b");
  });

  it("tolera mapa de gastos vazio", () => {
    const snap = buildBudgetSnapshot([budget()], {});
    expect(snap.states[0].spentToday).toBe(0);
    expect(snap.totalSpentToday).toBe(0);
  });
});
