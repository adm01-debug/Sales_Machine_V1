import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, resetFakeIds, type Row, type Tables } from "@/test/fake-supabase";

/**
 * Teste de integração da varredura de alertas operacionais: exercita o handler
 * HTTP real contra banco em memória, cobrindo abertura, lembrete (cooldown),
 * resolução automática e notificação assinada ao webhook externo.
 */

let fake: ReturnType<typeof createFakeSupabase>;

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return fake;
  },
}));

const APIKEY = "test-anon-key";

/** Cenário saudável por padrão: nenhuma regra de alerta deve disparar. */
function baseTables(over: { health?: Row | null; notifications?: Row[] } = {}): Tables {
  return {
    v_pipeline_health: over.health === null ? [] : [
      {
        dead_letter: 0,
        queued: 0,
        running: 2,
        sent_24h: 5,
        replies_24h: 1,
        opt_outs_7d: 0,
        ...over.health,
      },
    ],
    email_deliverability_events: [],
    contact_touchpoints: [],
    campaign_targets: [],
    campaign_sends: [],
    ops_alert_notifications: over.notifications ?? [],
  };
}

async function sweep(): Promise<Row> {
  const mod = await import("./alert-sweep");
  const handler = (
    mod.Route as unknown as {
      options: { server: { handlers: { POST: (c: { request: Request }) => Promise<Response> } } };
    }
  ).options.server.handlers.POST;
  const res = await handler({
    request: new Request("http://x/api/public/hooks/alert-sweep", {
      method: "POST",
      headers: { apikey: APIKEY },
    }),
  });
  return (await res.json()) as Row;
}

beforeEach(() => {
  process.env.SUPABASE_PUBLISHABLE_KEY = APIKEY;
  delete process.env.OPS_ALERT_WEBHOOK_URL;
  delete process.env.OPS_ALERT_WEBHOOK_SECRET;
  resetFakeIds();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("alert-sweep (integração)", () => {
  it("rejeita chamadas sem a apikey correta", async () => {
    fake = createFakeSupabase({ tables: baseTables() });
    const mod = await import("./alert-sweep");
    const handler = (
      mod.Route as unknown as {
        options: { server: { handlers: { POST: (c: { request: Request }) => Promise<Response> } } };
      }
    ).options.server.handlers.POST;
    const res = await handler({ request: new Request("http://x", { method: "POST" }) });
    expect(res.status).toBe(401);
  });

  it("atualiza a materialized view antes de avaliar as regras", async () => {
    fake = createFakeSupabase({ tables: baseTables() });
    await sweep();
    expect(fake.calls.some((c) => c.op === "rpc:refresh_pipeline_health")).toBe(true);
  });

  it("não abre nada quando o pipeline está saudável", async () => {
    fake = createFakeSupabase({ tables: baseTables() });
    const out = await sweep();
    expect(out).toMatchObject({ ok: true, active: 0, opened: 0, reminded: 0, resolved: 0 });
    expect(fake.tables.ops_alert_notifications).toHaveLength(0);
  });

  it("abre e persiste um alerta crítico de dead-letter", async () => {
    fake = createFakeSupabase({ tables: baseTables({ health: { dead_letter: 3 } }) });
    const out = await sweep();
    expect(out).toMatchObject({ active: 1, opened: 1 });
    expect(fake.tables.ops_alert_notifications[0]).toMatchObject({
      alert_id: "dead_letter",
      level: "critical",
      occurrences: 1,
      resolved_at: undefined,
    });
  });

  it("não reabre um alerta já notificado dentro do cooldown", async () => {
    const recent = new Date().toISOString();
    fake = createFakeSupabase({
      tables: baseTables({
        health: { dead_letter: 3 },
        notifications: [
          {
            id: "n1",
            alert_id: "dead_letter",
            level: "critical",
            last_notified_at: recent,
            occurrences: 1,
            resolved_at: null,
          },
        ],
      }),
    });
    const out = await sweep();
    expect(out).toMatchObject({ active: 1, opened: 0, reminded: 0 });
    expect(fake.tables.ops_alert_notifications).toHaveLength(1);
    expect(fake.tables.ops_alert_notifications[0].occurrences).toBe(2);
  });

  it("relembra o alerta quando o cooldown já expirou", async () => {
    const old = new Date(Date.now() - 6 * 3600_000).toISOString();
    fake = createFakeSupabase({
      tables: baseTables({
        health: { dead_letter: 3 },
        notifications: [
          {
            id: "n1",
            alert_id: "dead_letter",
            level: "critical",
            last_notified_at: old,
            occurrences: 4,
            resolved_at: null,
          },
        ],
      }),
    });
    const out = await sweep();
    expect(out).toMatchObject({ reminded: 1, opened: 0 });
    expect(fake.tables.ops_alert_notifications[0]).toMatchObject({ occurrences: 5 });
    expect(fake.tables.ops_alert_notifications[0].last_notified_at).not.toBe(old);
  });

  it("resolve automaticamente alertas que saíram do estado ativo", async () => {
    fake = createFakeSupabase({
      tables: baseTables({
        notifications: [
          {
            id: "n1",
            alert_id: "dead_letter",
            level: "critical",
            last_notified_at: new Date(Date.now() - 3600_000).toISOString(),
            occurrences: 2,
            resolved_at: null,
          },
        ],
      }),
    });
    const out = await sweep();
    expect(out).toMatchObject({ active: 0, resolved: 1 });
    expect(fake.tables.ops_alert_notifications[0].resolved_at).toBeTruthy();
  });

  it("conta bloqueios de consentimento das duas tabelas do funil", async () => {
    const tables = baseTables();
    tables.campaign_targets = Array.from({ length: 8 }, (_, i) => ({
      id: `t${i}`,
      state: "stopped",
      last_error: "bloqueado por falta de consentimento",
    }));
    tables.campaign_sends = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      state: "skipped",
      last_error: "contato com opt-out ativo",
    }));
    // 30 disparos rastreados no período → taxa de bloqueio 16/30 = 53% (crítico).
    tables.contact_touchpoints = Array.from({ length: 30 }, (_, i) => ({
      id: `tp${i}`,
      channel: "email",
      direction: "outbound",
      fuxico_tracking_id: `trk-${i}`,
      created_at: new Date().toISOString(),
    }));
    fake = createFakeSupabase({ tables });
    const out = await sweep();
    const ids = fake.tables.ops_alert_notifications.map((r) => r.alert_id);
    expect(ids).toContain("consent_block_rate");
    expect(out.active as number).toBeGreaterThan(0);
  });

  it("assina o payload e notifica o webhook externo quando configurado", async () => {
    process.env.OPS_ALERT_WEBHOOK_URL = "https://hooks.example/ops";
    process.env.OPS_ALERT_WEBHOOK_SECRET = "s3cr3t";
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response("ok", { status: 200 });
      }),
    );
    fake = createFakeSupabase({ tables: baseTables({ health: { dead_letter: 1 } }) });
    const out = await sweep();
    expect(out).toMatchObject({ notified: true, notify_error: null });
    expect(calls).toHaveLength(1);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it("persiste o estado mesmo quando o webhook falha", async () => {
    process.env.OPS_ALERT_WEBHOOK_URL = "https://hooks.example/ops";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    fake = createFakeSupabase({ tables: baseTables({ health: { dead_letter: 1 } }) });
    const out = await sweep();
    expect(out).toMatchObject({ notified: false });
    expect(out.notify_error).toContain("500");
    expect(fake.tables.ops_alert_notifications).toHaveLength(1);
  });

  it("não quebra quando a view de saúde ainda não tem linhas", async () => {
    fake = createFakeSupabase({ tables: baseTables({ health: null }) });
    const out = await sweep();
    expect(out).toMatchObject({ ok: true, active: 0 });
  });
});
