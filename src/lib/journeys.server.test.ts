import { beforeEach, describe, expect, it } from "vitest";
import { createFakeSupabase, resetFakeIds } from "@/test/fake-supabase";
import { saveJourneyGraph, validateGraphInput } from "./journeys.server";
import { journeyGraphSchema, type JourneyGraphInput } from "./journey-graph";

const JID = "11111111-1111-1111-1111-111111111111";

const graph = (over: Partial<JourneyGraphInput> = {}): JourneyGraphInput =>
  journeyGraphSchema.parse({
    id: JID,
    settings: { name: "Boas-vindas", description: null },
    nodes: [
      { id: "n-trigger", kind: "trigger", label: "Entrada", config: {} },
      { id: "tmp-send", kind: "send", label: "Oi", config: { channel: "email", body: "x" } },
      { id: "n-exit", kind: "exit", label: "Fim", config: {} },
    ],
    edges: [
      { from_node_id: "n-trigger", to_node_id: "tmp-send", branch: "default" },
      { from_node_id: "tmp-send", to_node_id: "n-exit", branch: "default" },
    ],
    ...over,
  });

beforeEach(() => resetFakeIds());

describe("validateGraphInput", () => {
  it("aprova um grafo linear completo", () => {
    expect(validateGraphInput(graph()).filter((i) => i.level === "error")).toEqual([]);
  });

  it("recusa ramo inexistente para o tipo de etapa", () => {
    const g = graph({
      edges: [
        { from_node_id: "n-trigger", to_node_id: "tmp-send", branch: "true", ordinal: 0 },
        { from_node_id: "tmp-send", to_node_id: "n-exit", branch: "default", ordinal: 0 },
      ],
    });
    expect(validateGraphInput(g).some((i) => i.message.includes('Ramo "true"'))).toBe(true);
  });

  it("recusa saída em etapa terminal", () => {
    const g = graph({
      edges: [
        { from_node_id: "n-trigger", to_node_id: "tmp-send", branch: "default", ordinal: 0 },
        { from_node_id: "tmp-send", to_node_id: "n-exit", branch: "default", ordinal: 0 },
        { from_node_id: "n-exit", to_node_id: "tmp-send", branch: "default", ordinal: 0 },
      ],
    });
    expect(validateGraphInput(g).some((i) => i.message.includes("terminal"))).toBe(true);
  });

  it("recusa janela de envio invertida", () => {
    const g = graph();
    g.settings.send_window_start = 20;
    g.settings.send_window_end = 8;
    expect(validateGraphInput(g).some((i) => i.message.includes("janela de envio"))).toBe(true);
  });

  it("detecta ciclo sem espera", () => {
    const g = graph({
      edges: [
        { from_node_id: "n-trigger", to_node_id: "tmp-send", branch: "default", ordinal: 0 },
        { from_node_id: "tmp-send", to_node_id: "n-trigger", branch: "default", ordinal: 0 },
      ],
    });
    expect(validateGraphInput(g).some((i) => i.message.includes("laço infinito"))).toBe(true);
  });
});

describe("saveJourneyGraph", () => {
  const makeDb = () =>
    createFakeSupabase({
      tables: {
        journeys: [{ id: JID, name: "Antiga", status: "draft" }],
        journey_nodes: [
          { id: "n-trigger", journey_id: JID, kind: "trigger" },
          { id: "n-exit", journey_id: JID, kind: "exit" },
          { id: "n-orfa", journey_id: JID, kind: "wait" },
        ],
        journey_edges: [
          { journey_id: JID, from_node_id: "n-trigger", to_node_id: "n-orfa", branch: "default" },
        ],
      },
    });

  it("gera id definitivo para etapas novas e mantém os existentes", async () => {
    const db = makeDb();
    const res = await saveJourneyGraph(db as never, graph());
    expect(res.idMap["n-trigger"]).toBe("n-trigger");
    expect(res.idMap["tmp-send"]).not.toBe("tmp-send");
    expect(res.idMap["tmp-send"]).toMatch(/[0-9a-f-]{8,}/);
  });

  it("remove etapas que saíram do grafo e regrava as ligações", async () => {
    const db = makeDb();
    const res = await saveJourneyGraph(db as never, graph());
    const ids = db.tables.journey_nodes.map((n) => n.id);
    expect(ids).not.toContain("n-orfa");
    expect(ids).toHaveLength(3);
    expect(db.tables.journey_edges).toHaveLength(2);
    expect(db.tables.journey_edges[0]).toMatchObject({ from_node_id: "n-trigger" });
    expect(db.tables.journey_edges[1]).toMatchObject({ to_node_id: "n-exit" });
    expect(db.tables.journey_edges[0].to_node_id).toBe(res.idMap["tmp-send"]);
  });

  it("persiste as configurações da jornada", async () => {
    const db = makeDb();
    await saveJourneyGraph(db as never, graph());
    expect(db.tables.journeys[0]).toMatchObject({
      name: "Boas-vindas",
      entry_daily_cap: 200,
      send_window_end: 24,
    });
  });

  it("descarta ligações órfãs em vez de falhar", async () => {
    const db = makeDb();
    const g = graph();
    g.edges.push({ from_node_id: "sumiu", to_node_id: "n-exit", branch: "default", ordinal: 0 });
    await expect(saveJourneyGraph(db as never, g)).resolves.toBeTruthy();
    expect(db.tables.journey_edges).toHaveLength(2);
  });

  it("salva rascunho inválido, mas devolve os problemas encontrados", async () => {
    const db = makeDb();
    const g = graph({ nodes: [{ id: "n-trigger", kind: "trigger", label: "Só o gatilho", config: {}, position_x: 0, position_y: 0 }], edges: [] });
    const res = await saveJourneyGraph(db as never, g);
    expect(res.issues.some((i) => i.level === "error")).toBe(true);
    expect(db.tables.journey_nodes).toHaveLength(1);
  });

  it("propaga erro do banco em vez de fingir sucesso", async () => {
    const db = createFakeSupabase({ tables: { journeys: [], journey_nodes: [], journey_edges: [] } });
    const original = db.from;
    db.from = ((table: string) => {
      const b = original(table);
      if (table === "journeys") {
        return {
          ...b,
          update: () => ({ eq: async () => ({ error: { message: "sem permissão" } }) }),
        };
      }
      return b;
    }) as typeof db.from;
    await expect(saveJourneyGraph(db as never, graph())).rejects.toThrow("sem permissão");
  });
});