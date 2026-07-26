import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE_POLICY,
  decideScheduledReallocation,
  policyFromEnv,
} from "./budget-reallocation-schedule";

const NOW = new Date("2026-07-15T12:00:00.000Z");

const base = {
  movedTotal: 50,
  totalBefore: 1000,
  channelsChanged: 2,
  lastAppliedAt: null as string | null,
  now: NOW,
};

describe("decideScheduledReallocation", () => {
  it("aplica quando o plano é relevante e não há histórico", () => {
    const d = decideScheduledReallocation(base);
    expect(d.shouldApply).toBe(true);
    expect(d.code).toBe("apply");
  });

  it("recusa plano vazio", () => {
    expect(
      decideScheduledReallocation({ ...base, channelsChanged: 0, movedTotal: 0 }).code,
    ).toBe("no_plan");
    expect(decideScheduledReallocation({ ...base, movedTotal: 0 }).code).toBe("no_plan");
  });

  it("respeita o cooldown entre execuções", () => {
    const d = decideScheduledReallocation({
      ...base,
      lastAppliedAt: "2026-07-15T11:30:00.000Z",
    });
    expect(d.shouldApply).toBe(false);
    expect(d.code).toBe("cooldown");
    expect(d.cooldownRemainingMinutes).toBe(30);
  });

  it("libera após o cooldown", () => {
    const d = decideScheduledReallocation({
      ...base,
      lastAppliedAt: "2026-07-15T10:30:00.000Z",
    });
    expect(d.shouldApply).toBe(true);
  });

  it("ignora data inválida no histórico em vez de travar para sempre", () => {
    const d = decideScheduledReallocation({ ...base, lastAppliedAt: "não-é-data" });
    expect(d.shouldApply).toBe(true);
  });

  it("descarta movimentos irrelevantes", () => {
    const d = decideScheduledReallocation({ ...base, movedTotal: 2 });
    expect(d.code).toBe("below_min_moved");
  });

  it("exige aprovação manual em remanejamentos grandes demais", () => {
    const d = decideScheduledReallocation({ ...base, movedTotal: 800 });
    expect(d.code).toBe("exceeds_max_share");
    expect(d.reason).toContain("aprovação manual");
  });

  it("não divide por zero quando o total autorizado é zero", () => {
    const d = decideScheduledReallocation({ ...base, totalBefore: 0 });
    expect(d.shouldApply).toBe(true);
  });

  it("aceita política customizada", () => {
    const d = decideScheduledReallocation(
      { ...base, movedTotal: 2 },
      { minMovedBrl: 1 },
    );
    expect(d.shouldApply).toBe(true);
  });
});

describe("policyFromEnv", () => {
  it("cai no padrão sem variáveis", () => {
    expect(policyFromEnv({})).toEqual(DEFAULT_SCHEDULE_POLICY);
  });

  it("lê e sanitiza valores do ambiente", () => {
    const p = policyFromEnv({
      BUDGET_REALLOC_MIN_INTERVAL_MIN: "15",
      BUDGET_REALLOC_MIN_MOVED_BRL: "-3",
      BUDGET_REALLOC_MAX_SHARE: "2",
    });
    expect(p.minIntervalMinutes).toBe(15);
    expect(p.minMovedBrl).toBe(0);
    expect(p.maxMovedShare).toBe(1);
  });

  it("ignora valores não numéricos", () => {
    expect(policyFromEnv({ BUDGET_REALLOC_MAX_SHARE: "abc" }).maxMovedShare).toBe(
      DEFAULT_SCHEDULE_POLICY.maxMovedShare,
    );
  });
});
