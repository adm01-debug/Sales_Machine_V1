/**
 * Persistência do grafo de jornadas (server-only).
 *
 * Salvar um grafo é uma operação com 5 passos dependentes; mantê-la aqui, fora
 * do arquivo de `createServerFn`, evita que o fatiamento do bundler apague os
 * helpers e garante que a lógica seja testável isoladamente.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  branchesForKind,
  isTempId,
  toEngineEdges,
  toEngineNodes,
  type JourneyGraphInput,
} from "./journey-graph";
import { validateJourney, type JourneyIssue } from "./journey-engine";

type Db = SupabaseClient<never, "public", never>;

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Valida o grafo (motor) + coerência dos ramos declarados por tipo de etapa. */
export function validateGraphInput(graph: JourneyGraphInput): JourneyIssue[] {
  const nodes = toEngineNodes(graph.nodes);
  const edges = toEngineEdges(graph.edges);
  const issues = validateJourney(nodes, edges);

  for (const node of graph.nodes) {
    const allowed = branchesForKind(node.kind, node.config);
    for (const edge of graph.edges.filter((e) => e.from_node_id === node.id)) {
      if (allowed.length === 0) {
        issues.push({
          level: "error",
          nodeId: node.id,
          message: `A etapa "${node.label || node.kind}" é terminal e não pode ter saída.`,
        });
      } else if (!allowed.includes(edge.branch)) {
        issues.push({
          level: "error",
          nodeId: node.id,
          message: `Ramo "${edge.branch}" não existe na etapa "${node.label || node.kind}".`,
        });
      }
    }
  }

  if (graph.settings.send_window_start >= graph.settings.send_window_end) {
    issues.push({
      level: "error",
      message: "A janela de envio precisa começar antes de terminar.",
    });
  }
  return issues;
}

export interface SaveGraphResult {
  issues: JourneyIssue[];
  /** Mapa id temporário da interface → id definitivo no banco. */
  idMap: Record<string, string>;
}

/**
 * Grava o grafo inteiro: normaliza ids temporários, remove etapas apagadas,
 * regrava as ligações e devolve os problemas encontrados (sem bloquear o
 * rascunho — a ativação é que exige grafo sem erros).
 */
export async function saveJourneyGraph(
  db: Db,
  graph: JourneyGraphInput,
): Promise<SaveGraphResult> {
  const issues = validateGraphInput(graph);

  const idMap: Record<string, string> = {};
  for (const node of graph.nodes) {
    idMap[node.id] = isTempId(node.id) ? newId() : node.id;
  }

  const settingsUpdate = await db
    .from("journeys")
    .update({ ...graph.settings, updated_at: new Date().toISOString() } as never)
    .eq("id", graph.id);
  if (settingsUpdate.error) throw new Error(settingsUpdate.error.message);

  // As ligações são recriadas do zero: mais simples e sempre consistente com
  // o grafo enviado. Apagar primeiro evita violar as FKs ao remover etapas.
  const edgeWipe = await db.from("journey_edges").delete().eq("journey_id", graph.id);
  if (edgeWipe.error) throw new Error(edgeWipe.error.message);

  const keptIds = Object.values(idMap);
  const nodeWipe =
    keptIds.length > 0
      ? await db
          .from("journey_nodes")
          .delete()
          .eq("journey_id", graph.id)
          .not("id", "in", `(${keptIds.join(",")})`)
      : await db.from("journey_nodes").delete().eq("journey_id", graph.id);
  if (nodeWipe.error) throw new Error(nodeWipe.error.message);

  if (graph.nodes.length > 0) {
    const rows = graph.nodes.map((n) => ({
      id: idMap[n.id],
      journey_id: graph.id,
      kind: n.kind,
      label: n.label,
      position_x: n.position_x,
      position_y: n.position_y,
      config: n.config,
      updated_at: new Date().toISOString(),
    }));
    const upsert = await db.from("journey_nodes").upsert(rows as never, { onConflict: "id" });
    if (upsert.error) throw new Error(upsert.error.message);
  }

  const edgeRows = graph.edges.flatMap((e) => {
    const from = idMap[e.from_node_id];
    const to = idMap[e.to_node_id];
    // Ligação órfã (etapa apagada) é descartada em silêncio em vez de quebrar o salvamento.
    if (!from || !to) return [];
    return [
      {
        journey_id: graph.id,
        from_node_id: from,
        to_node_id: to,
        branch: e.branch,
        ordinal: e.ordinal,
      },
    ];
  });
  if (edgeRows.length > 0) {
    const insert = await db.from("journey_edges").insert(edgeRows as never);
    if (insert.error) throw new Error(insert.error.message);
  }

  return { issues, idMap };
}