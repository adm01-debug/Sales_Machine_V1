import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, resetFakeIds, type Row, type Tables } from "@/test/fake-supabase";

/**
 * Teste de integração do worker de jornadas: exercita o handler HTTP real
 * contra um banco em memória, cobrindo auth, travessia do grafo, consentimento,
 * janela de envio, orçamento, gate humano e falha de despacho.
 */

const sent: Array<{ kind: string; message: string }> = [];
const singuClient = {
  sendWhatsapp: vi.fn(async (i: { message: string }) => {
    sent.push({ kind: "whatsapp", message: i.message });
  }),
  sendSms: vi.fn(async () => undefined),
  sendMms: vi.fn(async () => undefined),
  sendRcs: vi.fn(async () => undefined),
  sendEmail: vi.fn(async (i: { body: string }) => {
    sent.push({ kind: "email", message: i.body });
  }),
};

let fake: ReturnType<typeof createFakeSupabase>;
let blockedChannels = new Set<string>();

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return fake;
  },
}));
vi.mock("@/integrations/external/singu.server", () => ({ singuClient }));
vi.mock("@/lib/budget.server", () => ({
  loadBlockedChannels: async () => blockedChannels,
}));
vi.mock("@/lib/email-tracking.server", () => ({
  withFuxicoTracking: async (i: { body: string }) => ({ body: i.body, trackingId: "trk-1" }),
}));

const APIKEY = "test-anon-key";

function baseTables(
  over: {
    journey?: Row;
    enrollment?: Row;
    nodes?: Row[];
    edges?: Row[];
  } = {},
): Tables {
  return {
    journey_enrollments: [
      {
        id: "en1",
        journey_id: "j1",
        entity_id: "e1",
        current_node_id: null,
        state: "active",
        attempts: 0,
        context: {},
        locked_until: null,
        next_run_at: "2000-01-01T00:00:00.000Z",
        ...over.enrollment,
      },
    ],
    journeys: [
      {
        id: "j1",
        name: "Boas-vindas",
        status: "active",
        requires_human_approval: false,
        send_window_start: 0,
        send_window_end: 24,
        ...over.journey,
      },
    ],
    journey_nodes: over.nodes ?? [
      { id: "n1", journey_id: "j1", kind: "trigger", label: "Entrada", config: {} },
      {
        id: "n2",
        journey_id: "j1",
        kind: "send",
        label: "Mensagem",
        config: { channel: "whatsapp", body: "Olá {{nome}}!" },
      },
      { id: "n3", journey_id: "j1", kind: "goal", label: "Meta", config: {} },
    ],
    journey_edges: over.edges ?? [
      { journey_id: "j1", from_node_id: "n1", to_node_id: "n2", branch: "default", ordinal: 0 },
      { journey_id: "j1", from_node_id: "n2", to_node_id: "n3", branch: "default", ordinal: 0 },
    ],
    journey_enrollment_events: [],
    entity_map: [
      { id: "e1", display_name: "Ana", singu_id: "sg1", metadata: { email: "ana@x.com" } },
    ],
    contact_touchpoints: [],
    message_templates: [
      { id: "tpl1", subject: "Assunto", body: "Corpo do modelo", media_url: null, rcs_payload: null },
    ],
  };
}

async function tick(): Promise<Row> {
  const mod = await import("./tick-journeys");
  const handler = (
    mod.Route as unknown as {
      options: { server: { handlers: { POST: (c: { request: Request }) => Promise<Response> } } };
    }
  ).options.server.handlers.POST;
  const res = await handler({
    request: new Request("http://x/api/public/hooks/tick-journeys", {
      method: "POST",
      headers: { apikey: APIKEY },
    }),
  });
  return (await res.json()) as Row;
}

beforeEach(() => {
  process.env.SUPABASE_PUBLISHABLE_KEY = APIKEY;
  sent.length = 0;
  blockedChannels = new Set();
  resetFakeIds();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetModules();
});

describe("tick-journeys (integração)", () => {
  it("rejeita chamadas sem a apikey correta", async () => {
    fake = createFakeSupabase({ tables: baseTables() });
    const mod = await import("./tick-journeys");
    const handler = (
      mod.Route as unknown as {
        options: { server: { handlers: { POST: (c: { request: Request }) => Promise<Response> } } };
      }
    ).options.server.handlers.POST;
    const res = await handler({ request: new Request("http://x", { method: "POST" }) });
    expect(res.status).toBe(401);
  });

  it("atravessa gatilho → envio, renderiza variáveis e registra eventos", async () => {
    fake = createFakeSupabase({ tables: baseTables(), rpc: { check_consent: () => true } });
    const out = await tick();
    expect(out).toMatchObject({ ok: true, processed: 1, sent: 1 });
    expect(sent).toEqual([{ kind: "whatsapp", message: "Olá Ana!" }]);
    expect(fake.tables.contact_touchpoints[0]).toMatchObject({
      channel: "whatsapp",
      status: "sent",
    });
    const actions = fake.tables.journey_enrollment_events.map((e) => e.action);
    expect(actions).toContain("advance");
    expect(actions).toContain("sent");
    expect(fake.tables.journey_enrollments[0]).toMatchObject({
      current_node_id: "n3",
      state: "active",
      locked_until: null,
    });
  });

  it("NÃO envia quando check_consent retorna false e encerra a inscrição (LGPD)", async () => {
    fake = createFakeSupabase({ tables: baseTables(), rpc: { check_consent: () => false } });
    const out = await tick();
    expect(out).toMatchObject({ exited: 1, sent: 0 });
    expect(sent).toHaveLength(0);
    expect(fake.tables.journey_enrollments[0]).toMatchObject({ state: "exited" });
    expect(fake.tables.contact_touchpoints).toHaveLength(0);
  });

  it("adia sem enviar quando o RPC de consentimento falha", async () => {
    fake = createFakeSupabase({
      tables: baseTables(),
      rpc: {
        check_consent: () => {
          throw new Error("indisponível");
        },
      },
    });
    const out = await tick();
    expect(sent).toHaveLength(0);
    expect(out).toMatchObject({ deferred: 1 });
    expect(fake.tables.journey_enrollments[0]).toMatchObject({ state: "waiting" });
  });

  it("adia quando o canal está sem orçamento", async () => {
    blockedChannels = new Set(["whatsapp"]);
    fake = createFakeSupabase({ tables: baseTables(), rpc: { check_consent: () => true } });
    const out = await tick();
    expect(out).toMatchObject({ deferred: 1, sent: 0 });
    expect(String(fake.tables.journey_enrollments[0].last_error)).toContain("orçamento");
  });

  it("cria touchpoint pendente sem despachar quando há gate humano", async () => {
    fake = createFakeSupabase({
      tables: baseTables({ journey: { requires_human_approval: true } }),
      rpc: { check_consent: () => true },
    });
    const out = await tick();
    expect(out).toMatchObject({ queued_approval: 1, sent: 0 });
    expect(sent).toHaveLength(0);
    expect(fake.tables.contact_touchpoints[0]).toMatchObject({ status: "pending_approval" });
  });

  it("suspende a inscrição quando a jornada não está ativa", async () => {
    fake = createFakeSupabase({
      tables: baseTables({ journey: { status: "paused" } }),
      rpc: { check_consent: () => true },
    });
    await tick();
    expect(fake.tables.journey_enrollments[0]).toMatchObject({
      state: "waiting",
      last_error: "jornada não está ativa",
    });
    expect(sent).toHaveLength(0);
  });

  it("agenda a retomada em etapa de espera sem consumir o envio", async () => {
    fake = createFakeSupabase({
      tables: baseTables({
        nodes: [
          { id: "n1", journey_id: "j1", kind: "trigger", label: "Entrada", config: {} },
          { id: "nw", journey_id: "j1", kind: "wait", label: "Esperar", config: { delay_hours: 2 } },
          {
            id: "n2",
            journey_id: "j1",
            kind: "send",
            label: "Mensagem",
            config: { channel: "whatsapp", body: "Oi" },
          },
        ],
        edges: [
          { journey_id: "j1", from_node_id: "n1", to_node_id: "nw", branch: "default", ordinal: 0 },
          { journey_id: "j1", from_node_id: "nw", to_node_id: "n2", branch: "default", ordinal: 0 },
        ],
      }),
      rpc: { check_consent: () => true },
    });
    const out = await tick();
    expect(out).toMatchObject({ waiting: 1, sent: 0 });
    expect(fake.tables.journey_enrollments[0]).toMatchObject({
      state: "waiting",
      current_node_id: "n2",
    });
  });

  it("usa o modelo da biblioteca quando a etapa não traz corpo próprio", async () => {
    fake = createFakeSupabase({
      tables: baseTables({
        nodes: [
          { id: "n1", journey_id: "j1", kind: "trigger", label: "Entrada", config: {} },
          {
            id: "n2",
            journey_id: "j1",
            kind: "send",
            label: "Mensagem",
            config: { channel: "whatsapp", template_id: "tpl1" },
          },
        ],
        edges: [
          { journey_id: "j1", from_node_id: "n1", to_node_id: "n2", branch: "default", ordinal: 0 },
        ],
      }),
      rpc: { check_consent: () => true },
    });
    const out = await tick();
    expect(out).toMatchObject({ sent: 1 });
    expect(sent[0].message).toBe("Corpo do modelo");
    // Última etapa sem saída conclui a jornada.
    expect(fake.tables.journey_enrollments[0]).toMatchObject({ state: "completed" });
  });

  it("falha a etapa quando não há conteúdo nem modelo", async () => {
    fake = createFakeSupabase({
      tables: baseTables({
        nodes: [
          { id: "n1", journey_id: "j1", kind: "trigger", label: "Entrada", config: {} },
          {
            id: "n2",
            journey_id: "j1",
            kind: "send",
            label: "Mensagem",
            config: { channel: "whatsapp" },
          },
        ],
        edges: [
          { journey_id: "j1", from_node_id: "n1", to_node_id: "n2", branch: "default", ordinal: 0 },
        ],
      }),
      rpc: { check_consent: () => true },
    });
    const out = await tick();
    expect(out).toMatchObject({ failed: 1, sent: 0 });
    expect(fake.tables.journey_enrollments[0]).toMatchObject({ state: "failed" });
  });

  it("reprograma com backoff quando o despacho falha", async () => {
    singuClient.sendWhatsapp.mockRejectedValueOnce(new Error("SINGU 500"));
    fake = createFakeSupabase({ tables: baseTables(), rpc: { check_consent: () => true } });
    const out = await tick();
    expect(out).toMatchObject({ failed: 1 });
    const enrollment = fake.tables.journey_enrollments[0];
    expect(enrollment).toMatchObject({ state: "waiting", attempts: 1 });
    expect(fake.tables.contact_touchpoints[0]).toMatchObject({ status: "failed" });
  });

  it("não reprocessa inscrição já travada por outro tick", async () => {
    fake = createFakeSupabase({
      tables: baseTables(),
      rpc: { check_consent: () => true },
      onUpdate: (table, patch) =>
        table === "journey_enrollments" && patch.locked_until ? false : undefined,
    });
    const out = await tick();
    expect(out).toMatchObject({ processed: 0, sent: 0 });
    expect(sent).toHaveLength(0);
  });
});