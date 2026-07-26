import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
import { buildBudgetReport, loadBlockedChannels, periodBounds } from "./budget.server";

const NOW = new Date("2026-07-15T12:00:00.000Z");

function tp(id: string, channel: string, createdAt: string, status = "delivered") {
  return { id, channel, status, direction: "outbound", created_at: createdAt };
}

const budgets = [
  { channel: "whatsapp", daily_limit_brl: 1, monthly_limit_brl: 100, enabled: true, note: null },
  { channel: "sms", daily_limit_brl: 100, monthly_limit_brl: 1000, enabled: true, note: null },
];

describe("periodBounds", () => {
  it("ancora dia e mês em UTC", () => {
    const { dayStart, monthStart } = periodBounds(NOW);
    expect(dayStart).toBe("2026-07-15T00:00:00.000Z");
    expect(monthStart).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("buildBudgetReport", () => {
  it("separa gasto do dia do gasto do mês", async () => {
    const client = createFakeSupabase({
      tables: {
        channel_budgets: budgets,
        contact_touchpoints: [
          tp("1", "whatsapp", "2026-07-15T09:00:00.000Z"), // hoje
          tp("2", "whatsapp", "2026-07-10T09:00:00.000Z"), // mês
          tp("3", "sms", "2026-07-15T10:00:00.000Z"),
        ],
      },
    });
    const report = await buildBudgetReport(client as never, NOW);
    const wa = report.states.find((s) => s.channel === "whatsapp")!;
    expect(wa.spentToday).toBe(0.3);
    expect(wa.spentMonth).toBe(0.6);
    expect(report.scannedRows).toBe(3);
  });

  it("ignora touchpoints não cobráveis", async () => {
    const client = createFakeSupabase({
      tables: {
        channel_budgets: budgets,
        contact_touchpoints: [
          tp("1", "sms", "2026-07-15T09:00:00.000Z", "queued"),
          tp("2", "sms", "2026-07-15T09:05:00.000Z", "failed"),
        ],
      },
    });
    const report = await buildBudgetReport(client as never, NOW);
    expect(report.totalSpentToday).toBe(0);
  });

  it("bloqueia canal cujo teto diário foi atingido", async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      tp(`w${i}`, "whatsapp", "2026-07-15T08:00:00.000Z"),
    );
    const client = createFakeSupabase({
      tables: { channel_budgets: budgets, contact_touchpoints: rows },
    });
    const report = await buildBudgetReport(client as never, NOW);
    expect([...report.blockedChannels]).toEqual(["whatsapp"]);
  });

  it("canal desativado entra bloqueado mesmo sem gasto", async () => {
    const client = createFakeSupabase({
      tables: {
        channel_budgets: [{ ...budgets[1], enabled: false }],
        contact_touchpoints: [],
      },
    });
    const report = await buildBudgetReport(client as never, NOW);
    expect(report.blockedChannels.has("sms")).toBe(true);
  });

  it("sem orçamentos cadastrados não bloqueia nada", async () => {
    const client = createFakeSupabase({
      tables: {
        channel_budgets: [],
        contact_touchpoints: [tp("1", "email", "2026-07-15T09:00:00.000Z")],
      },
    });
    const report = await buildBudgetReport(client as never, NOW);
    expect(report.blockedChannels.size).toBe(0);
    expect(report.states.map((s) => s.channel)).toEqual(["email"]);
  });
});

describe("loadBlockedChannels", () => {
  it("é fail-open quando a leitura falha", async () => {
    const broken = {
      from: () => {
        throw new Error("indisponível");
      },
    };
    await expect(loadBlockedChannels(broken as never)).resolves.toEqual(new Set());
  });
});
