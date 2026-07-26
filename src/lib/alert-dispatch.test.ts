import { describe, it, expect } from "vitest";
import {
  planAlertDispatch,
  buildNotificationPayload,
  REMINDER_COOLDOWN_MS,
  type StoredAlert,
} from "./alert-dispatch";
import type { OpsAlert } from "./ops-alerts";

const alert = (id: string, level: OpsAlert["level"] = "critical"): OpsAlert => ({
  id,
  level,
  title: `titulo ${id}`,
  detail: `detalhe ${id}`,
});

const stored = (alert_id: string, minutesAgo: number, level = "critical"): StoredAlert => ({
  id: `row-${alert_id}`,
  alert_id,
  level,
  last_notified_at: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
  occurrences: 1,
});

const NOW = new Date("2026-07-26T12:00:00.000Z");

describe("planAlertDispatch", () => {
  it("notifica alertas inéditos", () => {
    const plan = planAlertDispatch([alert("dead_letter")], [], NOW);
    expect(plan.toNotify.map((a) => a.id)).toEqual(["dead_letter"]);
    expect(plan.toRemind).toHaveLength(0);
    expect(plan.toResolve).toHaveLength(0);
  });

  it("não repete notificação dentro do cooldown", () => {
    const plan = planAlertDispatch([alert("dead_letter")], [stored("dead_letter", 30)], NOW);
    expect(plan.toNotify).toHaveLength(0);
    expect(plan.toTouch.map((t) => t.alert.id)).toEqual(["dead_letter"]);
  });

  it("relembra alerta persistente após o cooldown", () => {
    const past = REMINDER_COOLDOWN_MS / 60_000 + 1;
    const plan = planAlertDispatch([alert("dead_letter")], [stored("dead_letter", past)], NOW);
    expect(plan.toRemind.map((t) => t.alert.id)).toEqual(["dead_letter"]);
    expect(plan.toTouch).toHaveLength(0);
  });

  it("reabre quando a severidade muda mesmo dentro do cooldown", () => {
    const plan = planAlertDispatch(
      [alert("bounce_rate", "critical")],
      [stored("bounce_rate", 5, "warning")],
      NOW,
    );
    expect(plan.toRemind.map((t) => t.alert.id)).toEqual(["bounce_rate"]);
  });

  it("resolve registros ativos que sumiram da varredura", () => {
    const plan = planAlertDispatch([], [stored("pipeline_stalled", 10)], NOW);
    expect(plan.toResolve.map((r) => r.alert_id)).toEqual(["pipeline_stalled"]);
  });

  it("deduplica linhas repetidas mantendo a mais recente", () => {
    const plan = planAlertDispatch(
      [alert("dead_letter")],
      [stored("dead_letter", 600), { ...stored("dead_letter", 5), id: "row-novo" }],
      NOW,
    );
    expect(plan.toTouch).toHaveLength(1);
    expect(plan.toTouch[0].stored.id).toBe("row-novo");
  });

  it("trata timestamp inválido como vencido", () => {
    const bad: StoredAlert = { ...stored("dead_letter", 1), last_notified_at: "nao-e-data" };
    const plan = planAlertDispatch([alert("dead_letter")], [bad], NOW);
    expect(plan.toRemind).toHaveLength(1);
  });

  it("lida com varredura totalmente vazia", () => {
    const plan = planAlertDispatch([], [], NOW);
    expect(plan).toEqual({ toNotify: [], toRemind: [], toTouch: [], toResolve: [] });
  });
});

describe("buildNotificationPayload", () => {
  it("retorna null quando nada mudou", () => {
    const plan = planAlertDispatch([alert("dead_letter")], [stored("dead_letter", 1)], NOW);
    expect(buildNotificationPayload(plan, NOW)).toBeNull();
  });

  it("agrupa abertos, relembrados e resolvidos", () => {
    const plan = planAlertDispatch(
      [alert("dead_letter"), alert("bounce_rate")],
      [stored("bounce_rate", 600), stored("no_replies", 5, "warning")],
      NOW,
    );
    const payload = buildNotificationPayload(plan, NOW);
    expect(payload).not.toBeNull();
    expect(payload!.event).toBe("ops.alerts");
    expect(payload!.opened.map((a) => a.id)).toEqual(["dead_letter"]);
    expect(payload!.reminded.map((a) => a.id)).toEqual(["bounce_rate"]);
    expect(payload!.resolved).toEqual(["no_replies"]);
    expect(payload!.generated_at).toBe(NOW.toISOString());
  });
});