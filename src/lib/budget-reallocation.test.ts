import { describe, expect, it } from "vitest";
import {
  MIN_TRANSFER_BRL,
  planReallocation,
  type ReallocationPlan,
} from "./budget-reallocation";
import type { ChannelBudgetState } from "./budget-guard";

function state(partial: Partial<ChannelBudgetState> & { channel: string }): ChannelBudgetState {
  const dailyLimit = partial.dailyLimit ?? 100;
  const spentToday = partial.spentToday ?? 0;
  return {
    channel: partial.channel,
    status: partial.status ?? "ok",
    spentToday,
    spentMonth: partial.spentMonth ?? spentToday,
    dailyLimit,
    monthlyLimit: partial.monthlyLimit ?? 0,
    remainingToday: dailyLimit > 0 ? Math.max(dailyLimit - spentToday, 0) : null,
    usageRate: partial.usageRate ?? (dailyLimit > 0 ? (spentToday / dailyLimit) * 100 : null),
    monthlyUsageRate: partial.monthlyUsageRate ?? null,
    blocked: partial.blocked ?? false,
    reason: partial.reason ?? null,
  };
}

function expectConserved(plan: ReallocationPlan) {
  expect(Math.abs(plan.totalAfter - plan.totalBefore)).toBeLessThanOrEqual(0.01);
}

describe("planReallocation", () => {
  it("não propõe nada quando todos os canais estão folgados", () => {
    const plan = planReallocation([
      state({ channel: "email", spentToday: 10 }),
      state({ channel: "sms", spentToday: 5 }),
    ]);
    expect(plan.transfers).toEqual([]);
    expect(plan.changes).toEqual([]);
    expectConserved(plan);
  });

  it("transfere saldo de canal ocioso para canal bloqueado", () => {
    const plan = planReallocation([
      state({ channel: "whatsapp", dailyLimit: 100, spentToday: 100, status: "exhausted", blocked: true }),
      state({ channel: "email", dailyLimit: 200, spentToday: 20 }),
    ]);
    expect(plan.transfers).toHaveLength(1);
    expect(plan.transfers[0].from).toBe("email");
    expect(plan.transfers[0].to).toBe("whatsapp");
    // alvo do receptor: 100 / 0.75 = 133.33 → precisa de 33.33
    expect(plan.transfers[0].amount).toBeCloseTo(33.33, 2);
    expectConserved(plan);
  });

  it("preserva margem de segurança do doador", () => {
    // doador gastou 40 de 100 (40%): piso = 40 / 0.7 = 57.14 → pode doar 42.86
    const plan = planReallocation([
      state({ channel: "sms", dailyLimit: 500, spentToday: 500, status: "exhausted" }),
      state({ channel: "email", dailyLimit: 100, spentToday: 40 }),
    ]);
    const donor = plan.changes.find((c) => c.channel === "email")!;
    expect(donor.proposedDailyLimit).toBeCloseTo(57.14, 1);
    expect(donor.proposedDailyLimit).toBeGreaterThan(40);
    expectConserved(plan);
  });

  it("ignora canais desativados como doadores e receptores", () => {
    const plan = planReallocation([
      state({ channel: "instagram", dailyLimit: 100, spentToday: 100, status: "disabled", blocked: true }),
      state({ channel: "email", dailyLimit: 300, spentToday: 0, status: "disabled" }),
    ]);
    expect(plan.transfers).toEqual([]);
    expect(plan.unmet).toEqual([]);
  });

  it("não tenta destravar bloqueio mensal com teto diário", () => {
    const plan = planReallocation([
      state({
        channel: "sms",
        dailyLimit: 100,
        spentToday: 100,
        spentMonth: 3000,
        monthlyLimit: 3000,
        status: "exhausted",
        blocked: true,
      }),
      state({ channel: "email", dailyLimit: 400, spentToday: 10 }),
    ]);
    expect(plan.transfers).toEqual([]);
    expect(plan.unmet[0]).toMatchObject({ channel: "sms" });
    expect(plan.unmet[0].reason).toContain("mensal");
  });

  it("reporta necessidade não atendida quando falta saldo ocioso", () => {
    const plan = planReallocation([
      state({ channel: "whatsapp", dailyLimit: 1000, spentToday: 1000, status: "exhausted" }),
      state({ channel: "email", dailyLimit: 20, spentToday: 0 }),
    ]);
    expect(plan.movedTotal).toBeCloseTo(20, 2);
    expect(plan.unmet[0].channel).toBe("whatsapp");
    expect(plan.unmet[0].missing).toBeGreaterThan(0);
    expectConserved(plan);
  });

  it("atende também canais em alerta (>=80%) e prioriza a maior necessidade", () => {
    const plan = planReallocation([
      state({ channel: "whatsapp", dailyLimit: 100, spentToday: 90, status: "warning" }),
      state({ channel: "sms", dailyLimit: 100, spentToday: 100, status: "exhausted" }),
      state({ channel: "email", dailyLimit: 500, spentToday: 0 }),
    ]);
    expect(plan.transfers[0].to).toBe("sms"); // necessidade 33.33 > 20
    expectConserved(plan);
  });

  it("descarta movimentos abaixo do mínimo relevante", () => {
    const plan = planReallocation([
      state({ channel: "sms", dailyLimit: 100, spentToday: 80, status: "warning" }),
      state({ channel: "email", dailyLimit: 100.5, spentToday: 100, status: "exhausted" }),
    ]);
    for (const t of plan.transfers) expect(t.amount).toBeGreaterThanOrEqual(MIN_TRANSFER_BRL);
  });

  it("ignora canais sem teto configurado", () => {
    const plan = planReallocation([
      state({ channel: "email", dailyLimit: 0, spentToday: 900, usageRate: null }),
      state({ channel: "sms", dailyLimit: 100, spentToday: 100, status: "exhausted" }),
    ]);
    expect(plan.transfers).toEqual([]);
    expect(plan.totalBefore).toBe(100);
  });

  it("é determinístico e tolera entrada inválida", () => {
    expect(planReallocation(undefined as never).transfers).toEqual([]);
    const input = [
      state({ channel: "sms", dailyLimit: 100, spentToday: 100, status: "exhausted" }),
      state({ channel: "email", dailyLimit: 200, spentToday: 10 }),
      state({ channel: "push", dailyLimit: 200, spentToday: 10 }),
    ];
    expect(planReallocation(input)).toEqual(planReallocation(input));
  });
});
