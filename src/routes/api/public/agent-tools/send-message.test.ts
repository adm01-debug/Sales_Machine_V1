import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, resetFakeIds, type Row, type Tables } from "@/test/fake-supabase";

/**
 * Teste de integração do endpoint de envio manual do agente (FATOR X → SINGU), cobrindo auth
 * bearer, resolução de entidade e o gate de consentimento (LGPD) — regra crítica 2 do AGENTS.md.
 */

const sent: Array<{ kind: string; message: string }> = [];
const singuClient = {
  sendWhatsapp: vi.fn(async (i: { message: string }) =>
    sent.push({ kind: "whatsapp", message: i.message }),
  ),
  sendSms: vi.fn(async (i: { message: string }) => sent.push({ kind: "sms", message: i.message })),
  sendMms: vi.fn(async (i: { message: string }) => sent.push({ kind: "mms", message: i.message })),
  sendRcs: vi.fn(async (i: { message: string }) => sent.push({ kind: "rcs", message: i.message })),
  runEmailSequence: vi.fn(async () => sent.push({ kind: "email", message: "" })),
};

let fake: ReturnType<typeof createFakeSupabase>;

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return fake;
  },
}));
vi.mock("@/integrations/external/singu.server", () => ({ singuClient }));

const TOKEN = "test-agent-token";

function baseTables(over: { entity?: Row } = {}): Tables {
  return {
    entity_map: [{ id: "e1", singu_id: "sg1", ...over.entity }],
    contact_touchpoints: [],
  };
}

async function call(body: Row): Promise<{ status: number; json: Row }> {
  const mod = await import("./send-message");
  const handler = (
    mod.Route as unknown as {
      options: { server: { handlers: { POST: (c: { request: Request }) => Promise<Response> } } };
    }
  ).options.server.handlers.POST;
  const res = await handler({
    request: new Request("http://x/api/public/agent-tools/send-message", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
  return { status: res.status, json: (await res.json()) as Row };
}

beforeEach(() => {
  process.env.AGENT_TOOL_TOKEN = TOKEN;
  sent.length = 0;
  resetFakeIds();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetModules();
});

const BODY = { entity_id: "e1", channel: "whatsapp", message: "Olá!" };

describe("agent-tools/send-message (integração)", () => {
  it("rejeita sem bearer válido", async () => {
    fake = createFakeSupabase({ tables: baseTables() });
    const mod = await import("./send-message");
    const handler = (
      mod.Route as unknown as {
        options: { server: { handlers: { POST: (c: { request: Request }) => Promise<Response> } } };
      }
    ).options.server.handlers.POST;
    const res = await handler({
      request: new Request("http://x", { method: "POST", body: JSON.stringify(BODY) }),
    });
    expect(res.status).toBe(401);
  });

  it("despacha quando o consentimento permite", async () => {
    fake = createFakeSupabase({ tables: baseTables(), rpc: { check_consent: () => true } });
    const { status, json } = await call(BODY);
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true });
    expect(sent).toEqual([{ kind: "whatsapp", message: "Olá!" }]);
    expect(fake.tables.contact_touchpoints[0]).toMatchObject({ status: "sent" });
  });

  it("bloqueia o envio quando há opt-out registrado (LGPD)", async () => {
    fake = createFakeSupabase({ tables: baseTables(), rpc: { check_consent: () => false } });
    const { status, json } = await call(BODY);
    expect(status).toBe(409);
    expect(json).toMatchObject({ ok: false, error: "opt-out registrado para o canal" });
    expect(sent).toHaveLength(0);
    expect(fake.tables.contact_touchpoints).toHaveLength(0);
  });

  it("falha fechado (não envia) quando check_consent fica indisponível", async () => {
    fake = createFakeSupabase({
      tables: baseTables(),
      rpcErrors: { check_consent: { message: "connection refused" } },
    });
    const { status, json } = await call(BODY);
    expect(status).toBe(503);
    expect(json).toMatchObject({
      ok: false,
      error: "check_consent indisponível: connection refused",
    });
    expect(sent).toHaveLength(0);
    expect(fake.tables.contact_touchpoints).toHaveLength(0);
  });

  it("checa consentimento antes de despachar canal stub (linkedin/instagram)", async () => {
    fake = createFakeSupabase({ tables: baseTables(), rpc: { check_consent: () => false } });
    const { status, json } = await call({ ...BODY, channel: "linkedin" });
    expect(status).toBe(409);
    expect(json).toMatchObject({ ok: false });
    expect(fake.tables.contact_touchpoints).toHaveLength(0);
  });
});
