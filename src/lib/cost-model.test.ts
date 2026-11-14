import { describe, it, expect } from "vitest";
import { summarizeSpend, unitCostFor, formatBRL, DEFAULT_UNIT_COST_BRL } from "./cost-model";

describe("unitCostFor", () => {
  it("usa a tabela padrão por canal", () => {
    expect(unitCostFor("whatsapp")).toBe(DEFAULT_UNIT_COST_BRL.whatsapp);
  });
  it("aceita override válido", () => {
    expect(unitCostFor("sms", { sms: 0.5 })).toBe(0.5);
  });
  it("ignora override inválido (negativo/NaN)", () => {
    expect(unitCostFor("sms", { sms: -1 })).toBe(DEFAULT_UNIT_COST_BRL.sms);
    expect(unitCostFor("sms", { sms: Number.NaN })).toBe(DEFAULT_UNIT_COST_BRL.sms);
  });
  it("canal desconhecido custa zero", () => {
    expect(unitCostFor("pombo-correio")).toBe(0);
  });
});

describe("summarizeSpend", () => {
  it("ignora status não cobráveis", () => {
    const s = summarizeSpend([
      { channel: "sms", status: "queued", count: 100 },
      { channel: "sms", status: "failed", count: 50 },
    ]);
    expect(s.totalCost).toBe(0);
    expect(s.byChannel).toHaveLength(0);
  });

  it("soma custo por canal e calcula participação", () => {
    const s = summarizeSpend([
      { channel: "whatsapp", status: "delivered", count: 100 }, // 30,00
      { channel: "email", status: "sent", count: 1000 }, // 0,80
    ]);
    expect(s.totalCost).toBe(30.8);
    expect(s.byChannel[0].channel).toBe("whatsapp");
    expect(s.byChannel[0].share).toBeGreaterThan(90);
    expect(s.billableMessages).toBe(1100);
  });

  it("contabiliza desperdício de opt-out e dead-letter", () => {
    const s = summarizeSpend([
      { channel: "sms", status: "delivered", count: 90 },
      { channel: "sms", status: "opted_out", count: 10 },
    ]);
    expect(s.totalCost).toBe(12);
    expect(s.wastedCost).toBe(1.2);
    expect(s.wastedRate).toBe(10);
  });

  it("usa segmentos quando informados (SMS multipart)", () => {
    const s = summarizeSpend([{ channel: "sms", status: "sent", count: 10, segments: 30 }]);
    expect(s.totalCost).toBe(3.6);
  });

  it("descarta contagens inválidas em vez de gerar custo negativo", () => {
    const s = summarizeSpend([
      { channel: "sms", status: "sent", count: -5 },
      { channel: "sms", status: "sent", count: Number.NaN },
    ]);
    expect(s.totalCost).toBe(0);
  });

  it("agrupa canal vazio como desconhecido sem quebrar", () => {
    const s = summarizeSpend([{ channel: "", status: "sent", count: 5 }]);
    expect(s.byChannel[0].channel).toBe("desconhecido");
    expect(s.byChannel[0].cost).toBe(0);
  });

  it("entrada vazia devolve resumo zerado", () => {
    const s = summarizeSpend([]);
    expect(s).toMatchObject({ totalCost: 0, wastedCost: 0, wastedRate: 0, billableMessages: 0 });
  });
});

describe("formatBRL", () => {
  it("formata em real brasileiro", () => {
    expect(formatBRL(1234.5).replace(/\u00a0/g, " ")).toBe("R$ 1.234,50");
  });
});
