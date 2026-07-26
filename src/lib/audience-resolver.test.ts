import { describe, expect, it } from "vitest";
import { parseRules } from "./audience-rules";
import { resolveAudience, type ResolvedContact } from "./audience-resolver.server";

type Filter = { op: string; args: unknown[] };

/**
 * Cliente Supabase falso: registra os filtros aplicados (para garantir que os
 * predicados vão para o banco, não para a memória) e devolve as linhas dadas.
 */
function fakeSupabase(rows: Partial<ResolvedContact>[]) {
  const filters: Filter[] = [];
  let limit = 0;
  const builder: Record<string, unknown> = {};
  const chain = (op: string) => (...args: unknown[]) => {
    filters.push({ op, args });
    return builder;
  };
  Object.assign(builder, {
    select: () => builder,
    limit: (n: number) => {
      limit = n;
      return builder;
    },
    in: chain("in"),
    ilike: chain("ilike"),
    gte: chain("gte"),
    gt: chain("gt"),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
  });
  const client = { from: () => builder } as never;
  return { client, filters, getLimit: () => limit };
}

const contact = (over: Partial<ResolvedContact>): ResolvedContact => ({
  entity_id: crypto.randomUUID(),
  display_name: "Contato",
  kind: "person",
  signal_score: 0,
  last_touch_at: null,
  touchpoint_count: 0,
  metadata: {},
  consent_by_channel: {},
  ...over,
});

describe("resolveAudience — filtros delegados ao banco", () => {
  it("não aplica filtros quando as regras são padrão", async () => {
    const { client, filters, getLimit } = fakeSupabase([]);
    await resolveAudience(client, parseRules({}));
    expect(filters).toEqual([]);
    expect(getLimit()).toBe(3000); // limit 1000 * 3, teto 5000
  });

  it("respeita o teto de 5000 linhas materializadas", async () => {
    const { client, getLimit } = fakeSupabase([]);
    await resolveAudience(client, parseRules({ limit: 5000 }));
    expect(getLimit()).toBe(5000);
  });

  it("traduz kinds, busca, score e engajamento em predicados SQL", async () => {
    const { client, filters } = fakeSupabase([]);
    await resolveAudience(
      client,
      parseRules({
        kinds: ["company"],
        search: "  acme  ",
        min_signal_score: 5,
        only_previously_contacted: true,
        engaged_within_days: 30,
      }),
    );
    const ops = filters.map((f) => f.op);
    expect(ops).toEqual(["in", "ilike", "gte", "gt", "gte"]);
    expect(filters[1].args[1]).toBe("%acme%"); // trim aplicado
  });

  it("propaga erro do banco como exceção legível", async () => {
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      select: () => builder,
      limit: () => builder,
      then: (r: (v: unknown) => unknown) => r({ data: null, error: { message: "boom" } }),
    });
    await expect(
      resolveAudience({ from: () => builder } as never, parseRules({})),
    ).rejects.toThrow("boom");
  });
});

describe("resolveAudience — refino em memória", () => {
  it("filtra por setor aceitando industry, setor ou ramo", async () => {
    const { client } = fakeSupabase([
      contact({ display_name: "A", metadata: { industry: "Varejo Alimentar" } }),
      contact({ display_name: "B", metadata: { setor: "varejo" } }),
      contact({ display_name: "C", metadata: { ramo: "Indústria" } }),
      contact({ display_name: "D", metadata: {} }),
    ]);
    const out = await resolveAudience(client, parseRules({ industries: ["VAREJO"] }));
    expect(out.map((c) => c.display_name)).toEqual(["A", "B"]);
  });

  it("trata ausência de consentimento como opt-in implícito e remove opt-out", async () => {
    const { client } = fakeSupabase([
      contact({ display_name: "sem registro" }),
      contact({ display_name: "optin", consent_by_channel: { whatsapp: "opt_in" } }),
      contact({ display_name: "optout", consent_by_channel: { whatsapp: "opted_out" } }),
      contact({ display_name: "outro canal", consent_by_channel: { sms: "opted_out" } }),
    ]);
    const out = await resolveAudience(
      client,
      parseRules({ require_consent_channel: "whatsapp" }),
    );
    expect(out.map((c) => c.display_name)).toEqual(["sem registro", "optin", "outro canal"]);
  });

  it("exclui quem foi contatado dentro da janela de cooldown", async () => {
    const recent = new Date(Date.now() - 3600_000).toISOString();
    const old = new Date(Date.now() - 72 * 3600_000).toISOString();
    const { client } = fakeSupabase([
      contact({ display_name: "recente", last_touch_at: recent }),
      contact({ display_name: "antigo", last_touch_at: old }),
      contact({ display_name: "nunca", last_touch_at: null }),
    ]);
    const out = await resolveAudience(client, parseRules({ exclude_contacted_hours: 24 }));
    expect(out.map((c) => c.display_name)).toEqual(["antigo", "nunca"]);
  });

  it("ordena por score decrescente e corta no limite", async () => {
    const { client } = fakeSupabase([
      contact({ display_name: "baixo", signal_score: 1 }),
      contact({ display_name: "alto", signal_score: 90 }),
      contact({ display_name: "medio", signal_score: 40 }),
    ]);
    const out = await resolveAudience(client, parseRules({ limit: 2 }));
    expect(out.map((c) => c.display_name)).toEqual(["alto", "medio"]);
  });

  it("tolera metadata nula sem lançar", async () => {
    const { client } = fakeSupabase([
      contact({ display_name: "X", metadata: null as never }),
    ]);
    await expect(
      resolveAudience(client, parseRules({ industries: ["varejo"] })),
    ).resolves.toEqual([]);
  });

  it("devolve lista vazia quando o banco não retorna linhas", async () => {
    const { client } = fakeSupabase([]);
    await expect(resolveAudience(client, parseRules({}))).resolves.toEqual([]);
  });
});