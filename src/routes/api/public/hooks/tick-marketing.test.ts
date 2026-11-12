import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, resetFakeIds, type Row, type Tables } from "@/test/fake-supabase";

/**
 * Teste de integração do worker de marketing (1:N): exercita o handler HTTP
 * real contra banco em memória, cobrindo cap diário, consentimento, variantes
 * A/B, gate humano, retry/backoff e encerramento automático da campanha.
 */

const sent: Array<{ kind: string; message: string }> = [];
const singuClient = {
  sendWhatsapp: vi.fn(async (i: { message: string }) =>
    sent.push({ kind: "whatsapp", message: i.message }),
  ),
  sendSms: vi.fn(async (i: { message: string }) => sent.push({ kind: "sms", message: i.message })),
  sendMms: vi.fn(async (i: { message: string }) => sent.push({ kind: "mms", message: i.message })),
  sendRcs: vi.fn(async (i: { message: string }) => sent.push({ kind: "rcs", message: i.message })),
  sendEmail: vi.fn(async (i: { body: string }) => sent.push({ kind: "email", message: i.body })),
};
const socialSend = vi.fn(async () => ({ status: "sent" as const, provider: "stub", error: null }));

let fake: ReturnType<typeof createFakeSupabase>;

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return fake;
  },
}));
vi.mock("@/integrations/external/singu.server", () => ({ singuClient }));
vi.mock("@/integrations/social/types", () => ({ getSocialSender: () => ({ send: socialSend }) }));
vi.mock("@/lib/email-tracking.server", () => ({
  withFuxicoTracking: async (i: { body: string }) => ({ body: i.body, trackingId: "trk-1" }),
}));

const APIKEY = "test-anon-key";

function baseTables(
  over: { campaign?: Row; send?: Row; variant?: Row; entity?: Row } = {},
): Tables {
  return {
    marketing_campaigns: [
      {
        id: "mc1",
        name: "Lançamento",
        channel: "whatsapp",
        status: "running",
        daily_cap: 500,
        requires_human_approval: false,
        scheduled_at: null,
        ...over.campaign,
      },
    ],
    campaign_sends: [
      {
        id: "s1",
        campaign_id: "mc1",
        entity_id: "e1",
        variant_id: "v1",
        attempts: 0,
        state: "queued",
        next_run_at: "2000-01-01T00:00:00.000Z",
        sent_at: null,
        ...over.send,
      },
    ],
    campaign_variants: [
      {
        id: "v1",
        label: "A",
        subject: "Oferta para {{nome}}",
        body: "Olá {{nome}}, temos novidades.",
        media_url: null,
        rcs_payload: null,
        ...over.variant,
      },
    ],
    entity_map: [
      {
        id: "e1",
        display_name: "Ana",
        singu_id: "sg1",
        metadata: { email: "ana@x.com" },
        ...over.entity,
      },
    ],
    contact_touchpoints: [],
  };
}

async function tick(): Promise<Row> {
  const mod = await import("./tick-marketing");
  const handler = (
    mod.Route as unknown as {
      options: { server: { handlers: { POST: (c: { request: Request }) => Promise<Response> } } };
    }
  ).options.server.handlers.POST;
  const res = await handler({
    request: new Request("http://x/api/public/hooks/tick-marketing", {
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

const allow = { rpc: { check_consent: () => true } };

describe("tick-marketing (integração)", () => {
  it("rejeita chamadas sem a apikey correta", async () => {
    fake = createFakeSupabase({ tables: baseTables() });
    const mod = await import("./tick-marketing");
    const handler = (
      mod.Route as unknown as {
        options: { server: { handlers: { POST: (c: { request: Request }) => Promise<Response> } } };
      }
    ).options.server.handlers.POST;
    const res = await handler({ request: new Request("http://x", { method: "POST" }) });
    expect(res.status).toBe(401);
  });

  it("despacha a variante renderizada e marca o envio como enviado", async () => {
    fake = createFakeSupabase({ tables: baseTables(), ...allow });
    const out = await tick();
    expect(out).toMatchObject({ ok: true, processed: 1, failed: 0, skipped_consent: 0 });
    expect(sent).toEqual([{ kind: "whatsapp", message: "Olá Ana, temos novidades." }]);
    expect(fake.tables.campaign_sends[0]).toMatchObject({ state: "sent", last_error: null });
    expect(fake.tables.contact_touchpoints[0]).toMatchObject({
      status: "sent",
      channel: "whatsapp",
    });
  });

  it("bloqueia o envio quando há opt-out registrado (LGPD)", async () => {
    fake = createFakeSupabase({ tables: baseTables(), rpc: { check_consent: () => false } });
    const out = await tick();
    expect(out).toMatchObject({ processed: 0, skipped_consent: 1 });
    expect(sent).toHaveLength(0);
    expect(fake.tables.campaign_sends[0]).toMatchObject({ state: "skipped" });
  });

  it("respeita o cap diário da campanha sem consumir a fila", async () => {
    const tables = baseTables({ campaign: { daily_cap: 1 } });
    tables.campaign_sends.push({
      id: "s0",
      campaign_id: "mc1",
      entity_id: "e1",
      variant_id: "v1",
      attempts: 0,
      state: "sent",
      next_run_at: null,
      sent_at: new Date().toISOString(),
    });
    fake = createFakeSupabase({ tables, ...allow });
    const out = await tick();
    expect(out).toMatchObject({ processed: 0, capped: 1 });
    expect(sent).toHaveLength(0);
    expect(fake.tables.campaign_sends.find((s) => s.id === "s1")).toMatchObject({
      state: "queued",
    });
  });

  it("ativa campanhas agendadas cuja janela já abriu", async () => {
    fake = createFakeSupabase({
      tables: baseTables({
        campaign: { status: "scheduled", scheduled_at: "2000-01-01T00:00:00.000Z" },
      }),
      ...allow,
    });
    const out = await tick();
    expect(out).toMatchObject({ processed: 1 });
    expect(fake.tables.marketing_campaigns[0]).toMatchObject({ status: "running" });
  });

  it("ignora campanhas agendadas para o futuro", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    fake = createFakeSupabase({
      tables: baseTables({ campaign: { status: "scheduled", scheduled_at: future } }),
      ...allow,
    });
    const out = await tick();
    expect(out).toMatchObject({ processed: 0 });
    expect(sent).toHaveLength(0);
  });

  it("segura o envio no gate humano sem chamar o provedor", async () => {
    fake = createFakeSupabase({
      tables: baseTables({ campaign: { requires_human_approval: true } }),
      ...allow,
    });
    const out = await tick();
    expect(out).toMatchObject({ processed: 0, queued_approval: 1 });
    expect(sent).toHaveLength(0);
    expect(fake.tables.campaign_sends[0]).toMatchObject({ state: "pending_approval" });
    expect(fake.tables.contact_touchpoints[0]).toMatchObject({ status: "pending_approval" });
  });

  it("falha o envio quando a variante não existe", async () => {
    const tables = baseTables();
    tables.campaign_variants = [];
    fake = createFakeSupabase({ tables, ...allow });
    const out = await tick();
    expect(out).toMatchObject({ failed: 1 });
    expect(fake.tables.campaign_sends[0]).toMatchObject({
      state: "failed",
      last_error: "variante não encontrada",
    });
  });

  it("reagenda com backoff quando o provedor falha e não estoura tentativas", async () => {
    singuClient.sendWhatsapp.mockRejectedValueOnce(new Error("timeout do provedor"));
    fake = createFakeSupabase({ tables: baseTables(), ...allow });
    const out = await tick();
    expect(out).toMatchObject({ failed: 1, processed: 0 });
    const send = fake.tables.campaign_sends[0];
    expect(send).toMatchObject({ state: "queued", attempts: 1 });
    expect(new Date(send.next_run_at as string).getTime()).toBeGreaterThan(Date.now());
    expect(fake.tables.contact_touchpoints[0]).toMatchObject({ status: "failed" });
  });

  it("marca falha definitiva após esgotar as tentativas", async () => {
    singuClient.sendWhatsapp.mockRejectedValueOnce(new Error("400 número inválido"));
    fake = createFakeSupabase({ tables: baseTables({ send: { attempts: 3 } }), ...allow });
    await tick();
    expect(fake.tables.campaign_sends[0]).toMatchObject({ state: "failed", attempts: 4 });
    expect(fake.tables.contact_touchpoints[0]).toMatchObject({ status: "dead_letter" });
  });

  it("degrada RCS para SMS quando o canal não é suportado", async () => {
    singuClient.sendRcs.mockRejectedValueOnce(new Error("channel not_supported"));
    fake = createFakeSupabase({ tables: baseTables({ campaign: { channel: "rcs" } }), ...allow });
    const out = await tick();
    expect(out).toMatchObject({ processed: 1, failed: 0 });
    expect(sent).toEqual([{ kind: "sms", message: "Olá Ana, temos novidades." }]);
  });

  it("bloqueia e-mail para contatos com hard bounce", async () => {
    fake = createFakeSupabase({
      tables: baseTables({
        campaign: { channel: "email" },
        entity: { metadata: { email: "ana@x.com", hard_bounce: true } },
      }),
      ...allow,
    });
    const out = await tick();
    expect(out).toMatchObject({ failed: 1 });
    expect(sent).toHaveLength(0);
    expect(String(fake.tables.campaign_sends[0].last_error)).toContain("hard_bounce");
  });

  it("anexa o tracking do Fuxico ao touchpoint de e-mail", async () => {
    fake = createFakeSupabase({ tables: baseTables({ campaign: { channel: "email" } }), ...allow });
    const out = await tick();
    expect(out).toMatchObject({ processed: 1 });
    expect(fake.tables.contact_touchpoints[0]).toMatchObject({
      fuxico_tracking_id: "trk-1",
      status: "sent",
    });
  });

  it("usa o adapter social em campanhas de LinkedIn", async () => {
    fake = createFakeSupabase({
      tables: baseTables({ campaign: { channel: "linkedin" } }),
      ...allow,
    });
    const out = await tick();
    expect(out).toMatchObject({ processed: 1 });
    expect(socialSend).toHaveBeenCalledTimes(1);
    expect(singuClient.sendWhatsapp).not.toHaveBeenCalled();
  });

  it("não dispara duas vezes quando outro worker vence a corrida do lock", async () => {
    fake = createFakeSupabase({
      tables: baseTables(),
      ...allow,
      onUpdate: (table, patch) =>
        table === "campaign_sends" && patch.state === "sending" ? false : undefined,
    });
    const out = await tick();
    expect(out).toMatchObject({ processed: 0 });
    expect(sent).toHaveLength(0);
  });

  it("encerra a campanha quando a fila fica vazia", async () => {
    const tables = baseTables();
    tables.campaign_sends = [];
    fake = createFakeSupabase({ tables, ...allow });
    const out = await tick();
    expect(out).toMatchObject({ processed: 0 });
    expect(fake.tables.marketing_campaigns[0]).toMatchObject({ status: "completed" });
  });
});
