import { describe, expect, it } from "vitest";
import {
  allocateRecipients,
  estimateCampaignCost,
  evaluateCostPreflight,
  type BudgetStateForPreflight,
} from "./campaign-cost";

const variant = (label: string, split: number, body = "Olá, tudo bem?") => ({
  label,
  body,
  split_percent: split,
});

describe("allocateRecipients", () => {
  it("fecha exatamente com o total mesmo com resto de divisão", () => {
    const a = allocateRecipients(100, [33, 33, 34]);
    expect(a.reduce((x, y) => x + y, 0)).toBe(100);
  });

  it("distribui igualmente quando todos os pesos são zero", () => {
    expect(allocateRecipients(10, [0, 0])).toEqual([5, 5]);
  });

  it("é determinístico entre execuções", () => {
    expect(allocateRecipients(7, [50, 50])).toEqual(allocateRecipients(7, [50, 50]));
  });

  it("trata audiência zero e pesos inválidos", () => {
    expect(allocateRecipients(0, [50, 50])).toEqual([0, 0]);
    expect(allocateRecipients(4, [Number.NaN, -3])).toEqual([2, 2]);
  });
});

describe("estimateCampaignCost", () => {
  it("estima e-mail com custo unitário baixo", () => {
    const e = estimateCampaignCost({
      channel: "email",
      audienceSize: 1000,
      variants: [variant("A", 100)],
    });
    expect(e.totalSegments).toBe(1000);
    expect(e.totalCost).toBe(0.8);
  });

  it("cobra SMS por segmento quando o texto é longo", () => {
    const longo = "a".repeat(200);
    const e = estimateCampaignCost({
      channel: "sms",
      audienceSize: 10,
      variants: [variant("A", 100, longo)],
    });
    expect(e.variants[0].segmentsPerMessage).toBe(2);
    expect(e.totalSegments).toBe(20);
    expect(e.totalCost).toBeCloseTo(2.4, 2);
  });

  it("emoji encarece o SMS via UCS-2", () => {
    const comEmoji = "🚀".repeat(50);
    const e = estimateCampaignCost({
      channel: "sms",
      audienceSize: 1,
      variants: [variant("A", 100, comEmoji)],
    });
    expect(e.variants[0].segmentsPerMessage).toBeGreaterThan(1);
  });

  it("não segmenta canais que não cobram por segmento", () => {
    const e = estimateCampaignCost({
      channel: "whatsapp",
      audienceSize: 5,
      variants: [variant("A", 100, "x".repeat(2000))],
    });
    expect(e.variants[0].segmentsPerMessage).toBe(1);
    expect(e.totalCost).toBeCloseTo(1.5, 2);
  });

  it("reparte a audiência entre variantes A/B", () => {
    const e = estimateCampaignCost({
      channel: "whatsapp",
      audienceSize: 100,
      variants: [variant("A", 70), variant("B", 30)],
    });
    expect(e.variants.map((v) => v.recipients)).toEqual([70, 30]);
  });

  it("audiência vazia gera custo zero sem quebrar", () => {
    const e = estimateCampaignCost({
      channel: "sms",
      audienceSize: 0,
      variants: [variant("A", 100)],
    });
    expect(e.totalCost).toBe(0);
    expect(e.costPerContact).toBe(0);
  });

  it("canal desconhecido custa zero em vez de NaN", () => {
    const e = estimateCampaignCost({
      channel: "pombo-correio",
      audienceSize: 10,
      variants: [variant("A", 100)],
    });
    expect(e.unitCost).toBe(0);
    expect(e.totalCost).toBe(0);
  });
});

describe("evaluateCostPreflight", () => {
  const budget = (over: Partial<BudgetStateForPreflight> = {}): BudgetStateForPreflight => ({
    channel: "sms",
    status: "ok",
    spentToday: 0,
    spentMonth: 0,
    dailyLimit: 100,
    monthlyLimit: 1000,
    ...over,
  });
  const est = (cost: number) =>
    estimateCampaignCost({
      channel: "sms",
      audienceSize: Math.round(cost / 0.12),
      variants: [variant("A", 100, "oi")],
    });

  it("aprova quando cabe folgadamente no saldo", () => {
    const r = evaluateCostPreflight(est(6), budget());
    expect(r.verdict).toBe("ok");
  });

  it("alerta quando consome ≥80% do saldo do dia", () => {
    const r = evaluateCostPreflight(est(90), budget());
    expect(r.verdict).toBe("warning");
    expect(r.reasons[0]).toContain("saldo diário");
  });

  it("bloqueia quando estoura o saldo diário", () => {
    const r = evaluateCostPreflight(est(120), budget());
    expect(r.verdict).toBe("blocked");
  });

  it("bloqueia quando estoura o saldo mensal", () => {
    const r = evaluateCostPreflight(
      est(90),
      budget({ dailyLimit: 0, monthlyLimit: 100, spentMonth: 50 }),
    );
    expect(r.verdict).toBe("blocked");
    expect(r.reasons.join()).toContain("mensal");
  });

  it("bloqueia canal desativado ou já esgotado", () => {
    expect(evaluateCostPreflight(est(1), budget({ status: "disabled" })).verdict).toBe("blocked");
    expect(evaluateCostPreflight(est(1), budget({ status: "exhausted" })).verdict).toBe("blocked");
  });

  it("bloqueia audiência vazia", () => {
    const vazio = estimateCampaignCost({
      channel: "sms",
      audienceSize: 0,
      variants: [variant("A", 100)],
    });
    expect(evaluateCostPreflight(vazio, budget()).verdict).toBe("blocked");
  });

  it("fail-open sem orçamento configurado", () => {
    const r = evaluateCostPreflight(est(9999), null);
    expect(r.verdict).toBe("ok");
    expect(r.remainingToday).toBeNull();
    expect(r.consumesDailyPct).toBeNull();
  });

  it("saldo diário zerado bloqueia qualquer lançamento", () => {
    const r = evaluateCostPreflight(est(1), budget({ spentToday: 100 }));
    expect(r.verdict).toBe("blocked");
  });
});
