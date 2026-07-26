import { describe, it, expect } from "vitest";
import { createFakeSupabase, type Row } from "@/test/fake-supabase";
import {
  listManualInterventions,
  normalizeTargetFilter,
  clampLimit,
  AUDIT_DEFAULT_LIMIT,
  AUDIT_MAX_LIMIT,
  collectManualInterventions,
  AUDIT_EXPORT_PAGE_SIZE,
  AUDIT_EXPORT_MAX_ROWS,
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
describe("collectManualInterventions (exportação paginada)", () => {
  /** Cria N eventos com timestamps decrescentes distintos. */
  function manyEvents(n: number, base = now): Row[] {
    return Array.from({ length: n }, (_, i) =>
      event(`e-${i}`, { created_at: new Date(base - i * 1000).toISOString() }),
    );
  }

  it("devolve conjunto vazio quando não há intervenções", async () => {
    const db = createFakeSupabase({ campaign_target_events: [] });
    const res = await collectManualInterventions(db as never);
    expect(res.rows).toEqual([]);
    expect(res.truncated).toBe(false);
  });

  it("atravessa múltiplas páginas sem duplicar linhas", async () => {
    const total = AUDIT_EXPORT_PAGE_SIZE * 2 + 17;
    const db = createFakeSupabase({ campaign_target_events: manyEvents(total) });
    const res = await collectManualInterventions(db as never);
    expect(res.rows).toHaveLength(total);
    expect(new Set(res.rows.map((r) => r.id)).size).toBe(total);
    expect(res.truncated).toBe(false);
  });

  it("não entra em laço infinito com timestamps idênticos", async () => {
    const stamp = new Date(now).toISOString();
    const rows = Array.from({ length: AUDIT_EXPORT_PAGE_SIZE + 5 }, (_, i) =>
      event(`dup-${i}`, { created_at: stamp }),
    );
    const db = createFakeSupabase({ campaign_target_events: rows });
    const res = await collectManualInterventions(db as never);
    // A página se repete integralmente; encerramos sem progresso, sem travar.
    expect(res.rows.length).toBeGreaterThan(0);
    expect(new Set(res.rows.map((r) => r.id)).size).toBe(res.rows.length);
  });

  it("marca truncated ao bater o teto de linhas", async () => {
    const db = createFakeSupabase({
      campaign_target_events: manyEvents(AUDIT_EXPORT_MAX_ROWS + AUDIT_EXPORT_PAGE_SIZE),
    });
    const res = await collectManualInterventions(db as never);
    expect(res.rows).toHaveLength(AUDIT_EXPORT_MAX_ROWS);
    expect(res.truncated).toBe(true);
  });

  it("ignora eventos automáticos do worker", async () => {
    const db = createFakeSupabase({
      campaign_target_events: [
        event("a"),
        event("b", { actor: "system" }),
      ],
    });
    const res = await collectManualInterventions(db as never);
    expect(res.rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("aplica o recorte temporal", async () => {
    const db = createFakeSupabase({
      campaign_target_events: [event("recente"), event("antigo", { created_at: daysAgo(40) })],
    });
    const res = await collectManualInterventions(db as never, { days: 7 });
    expect(res.rows.map((r) => r.id)).toEqual(["recente"]);
  });

  it("aplica o filtro por prefixo de alvo e ignora curingas", async () => {
    const db = createFakeSupabase({
      campaign_target_events: [
        event("x"),
        event("y", { target_id: "bbbbbbbb-1111-2222-3333-444444444444" }),
      ],
    });
    const filtered = await collectManualInterventions(db as never, { targetId: "aaaaaaaa" });
    expect(filtered.rows.map((r) => r.id)).toEqual(["x"]);

    const wildcard = await collectManualInterventions(db as never, { targetId: "%" });
    expect(wildcard.rows).toHaveLength(2);
  });
});
