/**
 * Fake in-memory do client Supabase (subset PostgREST) para testes de
 * integração dos workers. Suporta apenas o encadeamento realmente usado pelos
 * ticks: select/in/lte/or/eq/order/limit/maybeSingle/single,
 * insert/update/upsert e rpc.
 *
 * `.or(...)` é tratado como pass-through: os cenários de lock/concorrência são
 * exercitados explicitamente pelos hooks `onUpdate`.
 */

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

export interface FakeSupabaseOptions {
  tables: Tables;
  rpc?: Record<string, (args: Row) => unknown>;
  /** Permite simular corrida de lock retornando `false` para abortar o update. */
  onUpdate?: (table: string, patch: Row, matched: Row[]) => boolean | void;
}

interface Filter {
  kind: "eq" | "in" | "lte" | "gte" | "is" | "ilike";
  column: string;
  value: unknown;
}

/** Converte um padrão PostgREST (`%texto%`) em RegExp case-insensitive. */
function likeToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.column];
    if (f.kind === "eq") return v === f.value;
    if (f.kind === "in") return (f.value as unknown[]).includes(v);
    if (f.kind === "gte") return v != null && String(v) >= String(f.value);
    if (f.kind === "is") return f.value === null ? v === null || v === undefined : v === f.value;
    if (f.kind === "ilike") return v != null && likeToRegex(String(f.value)).test(String(v));
    return v != null && String(v) <= String(f.value);
  });
}

let idSeq = 0;
export function resetFakeIds(): void {
  idSeq = 0;
}

export function createFakeSupabase(options: FakeSupabaseOptions) {
  const tables = options.tables;
  const calls: Array<{ op: string; table: string; payload?: Row }> = [];

  function builder(table: string) {
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "update" | "upsert" = "select";
    let payload: Row = {};
    let limit: number | null = null;
    let inserted: Row | null = null;
    let countMode = false;

    const run = (): { data: unknown; error: null; count?: number } => {
      const rows = (tables[table] ??= []);
      if (mode === "insert" || mode === "upsert") {
        return { data: inserted ? [inserted] : [], error: null };
      }
      if (mode === "update") {
        const matched = rows.filter((r) => matches(r, filters));
        const allowed = options.onUpdate?.(table, payload, matched);
        if (allowed === false) return { data: [], error: null };
        for (const r of matched) Object.assign(r, payload);
        calls.push({ op: "update", table, payload: { ...payload } });
        return { data: matched, error: null };
      }
      let out = rows.filter((r) => matches(r, filters));
      if (countMode) return { data: null, error: null, count: out.length };
      if (limit != null) out = out.slice(0, limit);
      return { data: out, error: null };
    };

    const api = {
      select(_columns?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.head || opts?.count) countMode = true;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push({ kind: "eq", column, value });
        return api;
      },
      in(column: string, value: unknown[]) {
        filters.push({ kind: "in", column, value });
        return api;
      },
      lte(column: string, value: unknown) {
        filters.push({ kind: "lte", column, value });
        return api;
      },
      gte(column: string, value: unknown) {
        filters.push({ kind: "gte", column, value });
        return api;
      },
      is(column: string, value: unknown) {
        filters.push({ kind: "is", column, value });
        return api;
      },
      ilike(column: string, value: unknown) {
        filters.push({ kind: "ilike", column, value });
        return api;
      },
      or() {
        return api;
      },
      order() {
        return api;
      },
      limit(n: number) {
        limit = n;
        return api;
      },
      insert(values: Row | Row[]) {
        mode = "insert";
        // PostgREST aceita linha única ou lote; o fake precisa dos dois para
        // que inserções em lote não virem uma linha com índices numéricos.
        const list = Array.isArray(values) ? values : [values];
        const rows = (tables[table] ??= []);
        for (const v of list) {
          const row = { id: `fake-${++idSeq}`, ...v };
          rows.push(row);
          inserted = row;
          calls.push({ op: "insert", table, payload: { ...v } });
        }
        payload = list[0] ?? {};
        return api;
      },
      update(values: Row) {
        mode = "update";
        payload = values;
        return api;
      },
      upsert(values: Row) {
        mode = "upsert";
        payload = values;
        const rows = (tables[table] ??= []);
        const key = Object.keys(values).filter((k) => k !== "sent");
        const existing = rows.find((r) => key.every((k) => r[k] === values[k]));
        if (existing) Object.assign(existing, values);
        else rows.push({ ...values });
        inserted = existing ?? values;
        calls.push({ op: "upsert", table, payload: { ...values } });
        return api;
      },
      maybeSingle() {
        const { data } = run();
        const arr = data as Row[];
        return Promise.resolve({ data: arr[0] ?? null, error: null });
      },
      single() {
        const { data } = run();
        const arr = data as Row[];
        return Promise.resolve({ data: arr[0] ?? null, error: null });
      },
      then(resolve: (v: { data: unknown; error: null }) => unknown) {
        return Promise.resolve(run()).then(resolve);
      },
    };
    return api;
  }

  return {
    calls,
    tables,
    from: (table: string) => builder(table),
    rpc: async (name: string, args: Row) => {
      calls.push({ op: `rpc:${name}`, table: name, payload: args });
      const fn = options.rpc?.[name];
      return { data: fn ? fn(args) : null, error: null };
    },
  };
}