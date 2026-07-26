import { describe, it, expect } from "vitest";
import { createFakeSupabase, type Row } from "@/test/fake-supabase";
import {
  listManualInterventions,
  normalizeTargetFilter,
  clampLimit,
  AUDIT_DEFAULT_LIMIT,
  AUDIT_MAX_LIMIT,
} from "./ops-audit.server";

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 24 * 3600_000).toISOString();

function event(id: string, extra: Row = {}): Row {
  return {
    id,
    target_id: "aaaaaaaa-1111-2222-3333-444444444444",
    from_state: "dead_letter",
    to_state: "queued",
    reason: "manual_requeue",
    actor: "operator:u-1",
    created_at: daysAgo(1),
    ...extra,
  };
}

describe("normalizeTargetFilter", () => {
  it("ignora entradas vazias", () => {
    expect(normalizeTargetFilter("")).toBeNull();
    expect(normalizeTargetFilter("   ")).toBeNull();
    expect(normalizeTargetFilter(null)).toBeNull();
  });

  it("rejeita curingas e caracteres fora do alfabeto UUID", () => {
    expect(normalizeTargetFilter("%")).toBeNull();
    expect(normalizeTargetFilter("a_b")).toBeNull();
    expect(normalizeTargetFilter("drop table")).toBeNull();
  });

  it("normaliza prefixo válido para minúsculas", () => {
    expect(normalizeTargetFilter(" AAAA1111 ")).toBe("aaaa1111");
  });
});

describe("clampLimit", () => {
  it("usa o padrão para valores inválidos", () => {
    expect(clampLimit(undefined)).toBe(AUDIT_DEFAULT_LIMIT);
    expect(clampLimit(0)).toBe(AUDIT_DEFAULT_LIMIT);
    expect(clampLimit(-5)).toBe(AUDIT_DEFAULT_LIMIT);
  });
  it("limita o teto para proteger o painel", () => {
    expect(clampLimit(10_000)).toBe(AUDIT_MAX_LIMIT);
  });
});

describe("listManualInterventions", () => {
  it("retorna apenas eventos de operador", async () => {
    const db = createFakeSupabase({
      tables: {
        campaign_target_events: [
          event("e1"),
          event("e2", { actor: "system" }),
        ],
      },
    });
    const rows = await listManualInterventions(db);
    expect(rows.map((r) => r.id)).toEqual(["e1"]);
  });

  it("recorta pelo período informado", async () => {
    const db = createFakeSupabase({
      tables: {
        campaign_target_events: [
          event("recente", { created_at: daysAgo(2) }),
          event("antigo", { created_at: daysAgo(45) }),
        ],
      },
    });
    expect((await listManualInterventions(db, { days: 7 })).map((r) => r.id)).toEqual(["recente"]);
    expect((await listManualInterventions(db, { days: 90 })).map((r) => r.id).sort()).toEqual([
      "antigo",
      "recente",
    ]);
  });

  it("filtra por prefixo do alvo", async () => {
    const db = createFakeSupabase({
      tables: {
        campaign_target_events: [
          event("a", { target_id: "aaaaaaaa-1111-2222-3333-444444444444" }),
          event("b", { target_id: "bbbbbbbb-1111-2222-3333-444444444444" }),
        ],
      },
    });
    expect((await listManualInterventions(db, { targetId: "aaaa" })).map((r) => r.id)).toEqual(["a"]);
  });

  it("ordena do mais recente para o mais antigo e respeita o limite", async () => {
    const db = createFakeSupabase({
      tables: {
        campaign_target_events: [
          event("velho", { created_at: daysAgo(5) }),
          event("novo", { created_at: daysAgo(1) }),
          event("medio", { created_at: daysAgo(3) }),
        ],
      },
    });
    const rows = await listManualInterventions(db, { limit: 2 });
    expect(rows.map((r) => r.id)).toEqual(["novo", "medio"]);
  });

  it("propaga erro de leitura", async () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "like", "gte", "ilike", "order", "limit"]) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve);
    await expect(listManualInterventions({ from: () => chain } as never)).rejects.toThrow("boom");
  });
});