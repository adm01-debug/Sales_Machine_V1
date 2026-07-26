import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
import {
  applyReallocation,
  listReallocationHistory,
  previewReallocation,
} from "./budget-reallocation.server";

const NOW = new Date("2026-07-15T12:00:00.000Z");

function tp(id: string, channel: string) {
  return {
    id,
    channel,
    status: "delivered",
    direction: "outbound",
    created_at: "2026-07-15T09:00:00.000Z",
  };
}

/** whatsapp estourado (teto baixo + envios) e sms ocioso com teto folgado. */
function scenario() {
  return createFakeSupabase({
    tables: {
      channel_budgets: [
        { channel: "whatsapp", daily_limit_brl: 1, monthly_limit_brl: 1000, enabled: true, note: null },
        { channel: "sms", daily_limit_brl: 100, monthly_limit_brl: 1000, enabled: true, note: null },
      ],
      contact_touchpoints: Array.from({ length: 6 }, (_, i) => tp(`w${i}`, "whatsapp")),
      budget_reallocations: [],
    },
  });
}

describe("applyReallocation — trilha de auditoria", () => {
  it("grava um registro com o plano efetivamente aplicado", async () => {
    const client = scenario();
    const plan = await previewReallocation(client as never, NOW);
    expect(plan.changes.length).toBeGreaterThan(0);

    const result = await applyReallocation(client as never, NOW, "user-1");
    const rows = client.tables.budget_reallocations;
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_user_id).toBe("user-1");
    expect(rows[0].channels_changed).toBe(result.applied);
    expect(Number(rows[0].moved_total_brl)).toBeCloseTo(result.plan.movedTotal, 2);
    expect(Number(rows[0].total_before_brl)).toBeCloseTo(Number(rows[0].total_after_brl), 2);
  });

  it("não grava histórico quando não há nada a realocar", async () => {
    const client = createFakeSupabase({
      tables: {
        channel_budgets: [
          { channel: "sms", daily_limit_brl: 100, monthly_limit_brl: 1000, enabled: true, note: null },
        ],
        contact_touchpoints: [],
        budget_reallocations: [],
      },
    });
    const result = await applyReallocation(client as never, NOW, "user-1");
    expect(result.applied).toBe(0);
    expect(client.tables.budget_reallocations).toHaveLength(0);
  });

  it("aceita ator nulo (execução automatizada)", async () => {
    const client = scenario();
    await applyReallocation(client as never, NOW);
    expect(client.tables.budget_reallocations[0].actor_user_id).toBeNull();
  });
});

describe("listReallocationHistory", () => {
  it("ordena do mais recente para o mais antigo e normaliza números", async () => {
    const client = createFakeSupabase({
      tables: {
        budget_reallocations: [
          {
            id: "a",
            applied_at: "2026-07-10T00:00:00.000Z",
            actor_user_id: null,
            moved_total_brl: "10.00",
            total_before_brl: "200.00",
            total_after_brl: "200.00",
            channels_changed: 2,
            transfers: [],
            changes: [],
            unmet: [],
          },
          {
            id: "b",
            applied_at: "2026-07-14T00:00:00.000Z",
            actor_user_id: "u2",
            moved_total_brl: "5.00",
            total_before_brl: "200.00",
            total_after_brl: "200.00",
            channels_changed: 1,
            transfers: [],
            changes: [],
            unmet: [],
          },
        ],
      },
    });
    const history = await listReallocationHistory(client as never);
    expect(history.map((h) => h.id)).toEqual(["b", "a"]);
    expect(history[0].movedTotal).toBe(5);
    expect(history[1].actorUserId).toBeNull();
  });

  it("limita o intervalo do parâmetro limit", async () => {
    const client = createFakeSupabase({ tables: { budget_reallocations: [] } });
    await expect(listReallocationHistory(client as never, 0)).resolves.toEqual([]);
    await expect(listReallocationHistory(client as never, 9999)).resolves.toEqual([]);
  });
});
