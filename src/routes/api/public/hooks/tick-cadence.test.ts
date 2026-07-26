import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, resetFakeIds, type Row, type Tables } from "@/test/fake-supabase";

/**
 * Teste de integração do worker de cadência: exercita o handler HTTP real
 * contra um banco em memória e clientes externos falsos, validando o contrato
 * ponta a ponta (auth, lock, consentimento, despacho, retry, avanço de passo).
 */

const sent: Array<{ kind: string; message: string }> = [];
const singuClient = {
  sendWhatsapp: vi.fn(async (i: { message: string }) => sent.push({ kind: "whatsapp", message: i.message })),
  sendSms: vi.fn(async (i: { message: string }) => sent.push({ kind: "sms", message: i.message })),
  sendMms: vi.fn(async (i: { message: string }) => sent.push({ kind: "mms", message: i.message })),
  sendRcs: vi.fn(async (i: { message: string }) => sent.push({ kind: "rcs", message: i.message })),
  sendEmail: vi.fn(async (i: { body: string }) => sent.push({ kind: "email", message: i.body })),
};
const runAgent = vi.fn(async () => ({ message: "Olá {{display_name}}, podemos conversar?" }));
const socialSend = vi.fn(async () => ({ status: "sent" as const, provider: "stub", error: null }));

let fake: ReturnType<typeof createFakeSupabase>;

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return fake;
  },
}));
vi.mock("@/integrations/external/singu.server", () => ({ singuClient }));
vi.mock("@/integrations/external/fatorx.server", () => ({ fatorxClient: { runAgent } }));
vi.mock("@/integrations/social/types", () => ({ getSocialSender: () => ({ send: socialSend }) }));
vi.mock("@/lib/email-tracking.server", () => ({
  withFuxicoTracking: async (i: { body: string }) => ({ body: i.body, trackingId: "trk-1" }),
}));

const APIKEY = "test-anon-key";

function baseTables(over: { steps?: unknown; campaign?: Row; target?: Row } = {}): Tables {
  return {
    campaign_targets: [
      {
        id: "t1",
        entity_id: "e1",
        campaign_id: "c1",
        current_step: 0,
        attempts: 0,
        max_attempts: 3,
        locked_until: null,
        state: "queued",
        next_run_at: "2000-01-01T00:00:00.000Z",
        ...over.target,
      },
    ],
    campaigns_orchestration: [
      {
        id: "c1",
        name: "Prospecção Q3",
        channels: ["whatsapp"],
        fatorx_agent_id: null,
        cadence_rule_id: "r1",
        requires_human_approval: false,
        account_cooldown_hours: 48,
        ...over.campaign,
      },
    ],
    cadence_rules: [
      {
        id: "r1",
        steps: over.steps ?? [
          { channel: "whatsapp", delay_days: 0 },
          { channel: "email", delay_days: 2 },
        ],
      },
    ],
    entity_map: [
      { id: "e1", display_name: "Ana", fatorx_thread_id: null, singu_id: "sg1", metadata: { email: "ana@x.com" } },
    ],
    contact_touchpoints: [],
    sender_health: [],
  };
}

async function tick(): Promise<Row> {
  const mod = await import("./tick-cadence");
  const handler = (
    mod.Route as unknown as {
      options: { server: { handlers: { POST: (c: { request: Request }) => Promise<Response> } } };
    }
  ).options.server.handlers.POST;
  const res = await handler({
    request: new Request("http://x/api/public/hooks/tick-cadence", {
      method: "POST",
      headers: { apikey: APIKEY },
    }),
  });
  return (await res.json()) as Row;
}

beforeEach(() => {
  process.env.SUPABASE_PUBLISHABLE_KEY = APIKEY;
  sent.length = 0;
  resetFakeIds();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetModules();
});

describe("tick-cadence (integração)", () => {
  it("rejeita chamadas sem a apikey correta", async () => {
    fake = createFakeSupabase({ tables: baseTables() });
    const mod = await import("./tick-cadence");
    const handler = (
      mod.Route as unknown as {
        options: { server: { handlers: { POST: (c: { request: Request }) => Promise<Response> } } };
      }
    ).options.server.handlers.POST;
    const res = await handler({ request: new Request("http://x", { method: "POST" }) });
    expect(res.status).toBe(401);
  });

  it("despacha WhatsApp, renderiza variáveis e avança para o próximo passo", async () => {
    fake = createFakeSupabase({
      tables: baseTables(),
      rpc: { check_consent: () => true, has_recent_account_touchpoint: () => false },
    });
    const out = await tick();
    expect(out).toMatchObject({ ok: true, processed: 1, blocked_consent: 0 });
    expect(sent).toEqual([{ kind: "whatsapp", message: "Olá Ana, podemos conversar?" }]);
    const target = fake.tables.campaign_targets[0];
    expect(target).toMatchObject({ current_step: 1, state: "queued", attempts: 0 });
    expect(fake.tables.contact_touchpoints[0]).toMatchObject({ status: "sent", channel: "whatsapp" });
  });

  it("NÃO envia quando check_consent retorna false e para o target (LGPD)", async () => {
    fake = createFakeSupabase({
      tables: baseTables(),
      rpc: { check_consent: () => false, has_recent_account_touchpoint: () => false },
    });
    const out = await tick();
    expect(out).toMatchObject({ processed: 0, blocked_consent: 1 });
    expect(sent).toHaveLength(0);
    expect(singuClient.sendWhatsapp).not.toHaveBeenCalled();
    expect(fake.tables.campaign_targets[0]).toMatchObject({ state: "stopped" });
    expect(fake.tables.contact_touchpoints).toHaveLength(0);
  });

  it("adia sem enviar quando check_consent é consultado antes do cooldown", async () => {
    fake = createFakeSupabase({
      tables: baseTables(),
      rpc: { check_consent: () => true, has_recent_account_touchpoint: () => true },
    });
    const out = await tick();
    expect(out).toMatchObject({ skipped_cooldown: 1, processed: 0 });
    expect(sent).toHaveLength(0);
    expect(fake.tables.campaign_targets[0]).toMatchObject({ state: "queued" });
    const consentCall = fake.calls.findIndex((c) => c.op === "rpc:check_consent");
    const cooldownCall = fake.calls.findIndex((c) => c.op === "rpc:has_recent_account_touchpoint");
    expect(consentCall).toBeGreaterThanOrEqual(0);
    expect(consentCall).toBeLessThan(cooldownCall);
  });

  it("cria touchpoint pending_approval sem despachar quando há gate humano", async () => {
    fake = createFakeSupabase({
      tables: baseTables({ campaign: { requires_human_approval: true } }),
      rpc: { check_consent: () => true, has_recent_account_touchpoint: () => false },
    });
    const out = await tick();
    expect(out).toMatchObject({ queued_approval: 1 });
    expect(sent).toHaveLength(0);
    expect(fake.tables.contact_touchpoints[0]).toMatchObject({ status: "pending_approval" });
  });

  it("aplica retry com backoff quando o SINGU falha", async () => {
    singuClient.sendWhatsapp.mockRejectedValueOnce(new Error("SINGU 500"));
    fake = createFakeSupabase({
      tables: baseTables(),
      rpc: { check_consent: () => true, has_recent_account_touchpoint: () => false },
    });
    const out = await tick();
    expect(out).toMatchObject({ processed: 0, dead_lettered: 0 });
    const target = fake.tables.campaign_targets[0];
    expect(target).toMatchObject({ state: "queued", attempts: 1, current_step: 0 });
    expect(Date.parse(target.next_run_at as string)).toBeGreaterThan(Date.now());
    expect(fake.tables.contact_touchpoints[0]).toMatchObject({ status: "failed" });
  });

  it("manda para dead_letter ao esgotar max_attempts", async () => {
    singuClient.sendWhatsapp.mockRejectedValueOnce(new Error("SINGU 500"));
    fake = createFakeSupabase({
      tables: baseTables({ target: { attempts: 2, max_attempts: 3 } }),
      rpc: { check_consent: () => true, has_recent_account_touchpoint: () => false },
    });
    const out = await tick();
    expect(out).toMatchObject({ dead_lettered: 1 });
    expect(fake.tables.campaign_targets[0]).toMatchObject({ state: "dead_letter", attempts: 3 });
  });

  it("respeita o cap diário de e-mail sem consumir o passo", async () => {
    const tables = baseTables({ steps: [{ channel: "email", delay_days: 0 }] });
    tables.sender_health = [{ sender_id: "default", day: new Date().toISOString().slice(0, 10), sent: 50 }];
    fake = createFakeSupabase({
      tables,
      rpc: { check_consent: () => true, has_recent_account_touchpoint: () => false, compute_daily_cap: () => 50 },
    });
    const out = await tick();
    expect(sent).toHaveLength(0);
    expect(out).toMatchObject({ processed: 0 });
    expect(fake.tables.campaign_targets[0]).toMatchObject({ current_step: 0, state: "queued" });
  });

  it("envia e-mail rastreado e incrementa sender_health quando há folga", async () => {
    fake = createFakeSupabase({
      tables: baseTables({ steps: [{ channel: "email", delay_days: 0 }] }),
      rpc: { check_consent: () => true, has_recent_account_touchpoint: () => false, compute_daily_cap: () => 50 },
    });
    const out = await tick();
    expect(out).toMatchObject({ processed: 1 });
    expect(sent[0].kind).toBe("email");
    expect(fake.tables.sender_health[0]).toMatchObject({ sender_id: "default", sent: 1 });
    expect(fake.tables.contact_touchpoints[0]).toMatchObject({ fuxico_tracking_id: "trk-1" });
  });

  it("para o target em hard bounce de e-mail", async () => {
    const tables = baseTables({ steps: [{ channel: "email", delay_days: 0 }] });
    tables.entity_map[0].metadata = { email: "ana@x.com", hard_bounce: true };
    fake = createFakeSupabase({
      tables,
      rpc: { check_consent: () => true, has_recent_account_touchpoint: () => false, compute_daily_cap: () => 50 },
    });
    await tick();
    expect(sent).toHaveLength(0);
    expect(fake.tables.campaign_targets[0]).toMatchObject({ state: "stopped" });
  });

  it("usa adapter social em canais LinkedIn/Instagram e conclui a cadência", async () => {
    fake = createFakeSupabase({
      tables: baseTables({ steps: [{ channel: "linkedin", delay_days: 0 }] }),
      rpc: { check_consent: () => true, has_recent_account_touchpoint: () => false },
    });
    const out = await tick();
    expect(out).toMatchObject({ processed: 1 });
    expect(socialSend).toHaveBeenCalledTimes(1);
    expect(singuClient.sendWhatsapp).not.toHaveBeenCalled();
    expect(fake.tables.campaign_targets[0]).toMatchObject({ state: "completed" });
  });

  it("não processa duas vezes quando outro tick já detém o lock", async () => {
    fake = createFakeSupabase({
      tables: baseTables(),
      rpc: { check_consent: () => true, has_recent_account_touchpoint: () => false },
      onUpdate: (table, patch) => (table === "campaign_targets" && patch.locked_until ? false : undefined),
    });
    const out = await tick();
    expect(out).toMatchObject({ processed: 0 });
    expect(sent).toHaveLength(0);
  });

  it("degrada RCS para SMS quando o provedor não suporta o canal", async () => {
    singuClient.sendRcs.mockRejectedValueOnce(new Error("channel not_supported"));
    fake = createFakeSupabase({
      tables: baseTables({ steps: [{ channel: "rcs", delay_days: 0 }] }),
      rpc: { check_consent: () => true, has_recent_account_touchpoint: () => false },
    });
    const out = await tick();
    expect(out).toMatchObject({ processed: 1 });
    expect(sent.map((s) => s.kind)).toEqual(["sms"]);
  });
});