import { describe, it, expect, beforeEach } from "vitest";
import { createFakeSupabase, resetFakeIds, type Row } from "@/test/fake-supabase";
import { requeueDeadLetter, DEAD_LETTER_REQUEUE_LIMIT } from "./ops-recovery.server";

function target(id: string, state: string, transitionAt: string, extra: Row = {}): Row {
  return {
    id,
    state,
    last_transition_at: transitionAt,
    attempts: 5,
    locked_until: "2026-01-01T00:00:00.000Z",
    last_error: "channel timeout",
    next_run_at: null,
    ...extra,
  };
}

describe("requeueDeadLetter", () => {
  beforeEach(() => resetFakeIds());

  it("retorna 0 e não escreve quando não há dead-letter", async () => {
    const db = createFakeSupabase({
      tables: { campaign_targets: [target("a", "queued", "2026-01-01T00:00:00.000Z")] },
    });
    expect(await requeueDeadLetter(db)).toEqual({ requeued: 0 });
    expect(db.calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("reenfileira apenas alvos em dead_letter, zerando backoff e lock", async () => {
    const rows = [
      target("dead", "dead_letter", "2026-01-01T00:00:00.000Z"),
      target("ok", "queued", "2026-01-01T00:00:00.000Z"),
    ];
    const db = createFakeSupabase({ tables: { campaign_targets: rows } });

    expect(await requeueDeadLetter(db)).toEqual({ requeued: 1 });

    const dead = rows.find((r) => r.id === "dead")!;
    expect(dead.state).toBe("queued");
    expect(dead.attempts).toBe(0);
    expect(dead.locked_until).toBeNull();
    expect(dead.last_error).toBeNull();
    expect(typeof dead.next_run_at).toBe("string");

    const untouched = rows.find((r) => r.id === "ok")!;
    expect(untouched.attempts).toBe(5);
  });

  it("processa os mais antigos primeiro e respeita o limite do lote", async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      target(`t${i}`, "dead_letter", `2026-01-0${5 - i}T00:00:00.000Z`),
    );
    const db = createFakeSupabase({ tables: { campaign_targets: rows } });

    expect(await requeueDeadLetter(db, 2)).toEqual({ requeued: 2 });

    // t4 (01-01) e t3 (01-02) são os mais antigos.
    expect(
      rows
        .filter((r) => r.state === "queued")
        .map((r) => r.id)
        .sort(),
    ).toEqual(["t3", "t4"]);
  });

  it("usa lote de 100 por padrão", async () => {
    const rows = Array.from({ length: 150 }, (_, i) =>
      target(`t${i}`, "dead_letter", `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`),
    );
    const db = createFakeSupabase({ tables: { campaign_targets: rows } });

    expect(await requeueDeadLetter(db)).toEqual({ requeued: DEAD_LETTER_REQUEUE_LIMIT });
    expect(rows.filter((r) => r.state === "dead_letter")).toHaveLength(50);
  });

  it("é idempotente: a segunda chamada não encontra mais nada", async () => {
    const rows = [target("dead", "dead_letter", "2026-01-01T00:00:00.000Z")];
    const db = createFakeSupabase({ tables: { campaign_targets: rows } });

    await requeueDeadLetter(db);
    expect(await requeueDeadLetter(db)).toEqual({ requeued: 0 });
  });

  it("registra a intervenção humana em campaign_target_events", async () => {
    const rows = [
      target("d1", "dead_letter", "2026-01-01T00:00:00.000Z"),
      target("d2", "dead_letter", "2026-01-02T00:00:00.000Z"),
    ];
    const db = createFakeSupabase({
      tables: { campaign_targets: rows, campaign_target_events: [] },
    });

    await requeueDeadLetter(db, 10, "operator:u-1");

    const events = db.tables.campaign_target_events;
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      target_id: "d1",
      from_state: "dead_letter",
      to_state: "queued",
      reason: "manual_requeue",
      actor: "operator:u-1",
      payload: { batch_size: 2 },
    });
  });

  it("não grava auditoria quando nada foi reenfileirado", async () => {
    const db = createFakeSupabase({
      tables: {
        campaign_targets: [target("a", "queued", "2026-01-01T00:00:00.000Z")],
        campaign_target_events: [],
      },
    });
    await requeueDeadLetter(db);
    expect(db.tables.campaign_target_events).toHaveLength(0);
  });

  it("propaga erro de leitura sem tentar escrever", async () => {
    const failing = {
      from: () => ({
        select: () => failingChain,
      }),
    };
    const failingChain: Record<string, unknown> = {};
    for (const m of ["eq", "order", "limit"]) {
      failingChain[m] = () => failingChain;
    }
    failingChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve);

    await expect(requeueDeadLetter(failing as never)).rejects.toThrow("boom");
  });
});
