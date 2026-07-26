import { describe, it, expect } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
import { buildSpendReport, clampDays, SPEND_MAX_ROWS } from "./ops-spend.server";

const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

function tp(id: string, channel: string, status: string, direction = "outbound", minutesAgo = 10) {
  return { id, channel, status, direction, created_at: iso(minutesAgo) };
}

describe("clampDays", () => {
  it("usa 30 dias por padrão e para entradas inválidas", () => {
    expect(clampDays(null)).toBe(30);
    expect(clampDays(0)).toBe(30);
    expect(clampDays(Number.NaN)).toBe(30);
  });
  it("limita a 365 dias", () => {
    expect(clampDays(9999)).toBe(365);
    expect(clampDays(7)).toBe(7);
  });
});

describe("buildSpendReport", () => {
  it("agrega custo apenas de outbound cobrável", async () => {
    const client = createFakeSupabase({
      tables: {
        contact_touchpoints: [
          tp("1", "whatsapp", "delivered"),
          tp("2", "whatsapp", "read"),
          tp("3", "whatsapp", "queued"), // não cobrável
          tp("4", "email", "sent", "inbound"), // inbound filtrado na query
        ],
      },
    });
    const report = await buildSpendReport(client as never, { days: 30 });
    expect(report.billableMessages).toBe(2);
    expect(report.totalCost).toBe(0.6);
    expect(report.days).toBe(30);
    expect(report.truncated).toBe(false);
  });

  it("destaca desperdício de opt-out", async () => {
    const client = createFakeSupabase({
      tables: {
        contact_touchpoints: [
          tp("1", "sms", "delivered"),
          tp("2", "sms", "opted_out"),
        ],
      },
    });
    const report = await buildSpendReport(client as never, {});
    expect(report.wastedCost).toBe(0.12);
    expect(report.wastedRate).toBe(50);
  });

  it("ignora touchpoints fora da janela", async () => {
    const client = createFakeSupabase({
      tables: {
        contact_touchpoints: [
          tp("1", "sms", "sent", "outbound", 60 * 24 * 40), // 40 dias atrás
          tp("2", "sms", "sent", "outbound", 5),
        ],
      },
    });
    const report = await buildSpendReport(client as never, { days: 30 });
    expect(report.billableMessages).toBe(1);
  });

  it("não entra em laço infinito com timestamps idênticos", async () => {
    const stamp = iso(5);
    const rows = Array.from({ length: 60 }, (_, i) => ({
      id: `t${i}`,
      channel: "email",
      status: "sent",
      direction: "outbound",
      created_at: stamp,
    }));
    const client = createFakeSupabase({ tables: { contact_touchpoints: rows } });
    const report = await buildSpendReport(client as never, { days: 7 });
    expect(report.scannedRows).toBe(60);
    expect(report.scannedRows).toBeLessThan(SPEND_MAX_ROWS);
  });

  it("devolve resumo vazio sem envios", async () => {
    const client = createFakeSupabase({ tables: { contact_touchpoints: [] } });
    const report = await buildSpendReport(client as never, {});
    expect(report.byChannel).toEqual([]);
    expect(report.totalCost).toBe(0);
  });
});