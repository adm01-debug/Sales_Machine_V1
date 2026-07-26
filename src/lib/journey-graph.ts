/**
 * Contrato de persistência do grafo de jornadas — módulo PURO e client-safe.
 *
 * Vive separado de `journeys.functions.ts` porque arquivos que declaram
 * `createServerFn` são fatiados pelo bundler: qualquer helper irmão some do
 * chunk do servidor e vira `ReferenceError` em produção.
 */

import { z } from "zod";
import {
  validateJourney,
  type JourneyEdge,
  type JourneyIssue,
  type JourneyNode,
  type JourneyNodeKind,
} from "./journey-engine";

export const JOURNEY_NODE_KINDS = [
  "trigger",
  "send",
  "wait",
  "condition",
  "split",
  "goal",
  "exit",
] as const satisfies readonly JourneyNodeKind[];

export const JOURNEY_STATUSES = ["draft", "active", "paused", "archived"] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

/** Rótulos em português para a interface. */
export const NODE_KIND_LABEL: Record<JourneyNodeKind, string> = {
  trigger: "Gatilho",
  send: "Enviar mensagem",
  wait: "Esperar",
  condition: "Condição",
  split: "Teste A/B",
  goal: "Meta",
  exit: "Sair do fluxo",
};

export const STATUS_LABEL: Record<JourneyStatus, string> = {
  draft: "Rascunho",
  active: "Ativa",
  paused: "Pausada",
  archived: "Arquivada",
};

/** ids temporários criados na interface antes de existirem no banco. */
export const isTempId = (id: string): boolean => id.startsWith("tmp-");

export const journeySettingsSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome à jornada").max(120),
  description: z.string().trim().max(500).nullable().default(null),
  requires_human_approval: z.boolean().default(false),
  allow_reentry: z.boolean().default(false),
  entry_daily_cap: z.number().int().min(0).max(100_000).default(200),
  send_window_start: z.number().int().min(0).max(23).default(0),
  send_window_end: z.number().int().min(1).max(24).default(24),
});
export type JourneySettings = z.infer<typeof journeySettingsSchema>;

export const journeyNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(JOURNEY_NODE_KINDS),
  label: z.string().trim().max(120).default(""),
  position_x: z.number().finite().default(0),
  position_y: z.number().finite().default(0),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type JourneyNodeInput = z.infer<typeof journeyNodeSchema>;

export const journeyEdgeSchema = z.object({
  from_node_id: z.string().min(1),
  to_node_id: z.string().min(1),
  branch: z.string().trim().min(1).max(40).default("default"),
  ordinal: z.number().int().min(0).max(999).default(0),
});
export type JourneyEdgeInput = z.infer<typeof journeyEdgeSchema>;

export const journeyGraphSchema = z.object({
  id: z.string().uuid(),
  settings: journeySettingsSchema,
  nodes: z.array(journeyNodeSchema).max(200),
  edges: z.array(journeyEdgeSchema).max(400),
});
export type JourneyGraphInput = z.infer<typeof journeyGraphSchema>;

/** Adapta as linhas do banco para o formato que o motor entende. */
export const toEngineNodes = (rows: JourneyNodeInput[]): JourneyNode[] =>
  rows.map((n) => ({ id: n.id, kind: n.kind, label: n.label, config: n.config }));

export const toEngineEdges = (rows: JourneyEdgeInput[]): JourneyEdge[] =>
  rows.map((e) => ({
    from_node_id: e.from_node_id,
    to_node_id: e.to_node_id,
    branch: e.branch,
    ordinal: e.ordinal,
  }));

/** Config inicial coerente com cada tipo de etapa. */
export function defaultNodeConfig(kind: JourneyNodeKind): Record<string, unknown> {
  switch (kind) {
    case "trigger":
      return { event_types: [], sources: [], match: "all", conditions: [], cooldown_hours: 0 };
    case "send":
      return { channel: "email", subject: "", body: "" };
    case "wait":
      return { delay_hours: 24 };
    case "condition":
      return { match: "all", conditions: [{ field: "signal_score", op: "gte", value: 10 }] };
    case "split":
      return {
        branches: [
          { branch: "A", weight: 50 },
          { branch: "B", weight: 50 },
        ],
      };
    case "goal":
      return { label: "Reunião agendada" };
    case "exit":
      return { reason: "Fim do fluxo" };
    default:
      return {};
  }
}

/** Ramos válidos de saída para cada tipo — guia a interface e a validação. */
export function branchesForKind(kind: JourneyNodeKind, config: Record<string, unknown>): string[] {
  if (kind === "condition") return ["true", "false"];
  if (kind === "split") {
    const raw = config.branches;
    const list = Array.isArray(raw)
      ? raw.flatMap((b) =>
          b && typeof b === "object" && typeof (b as { branch?: unknown }).branch === "string"
            ? [String((b as { branch: string }).branch)]
            : [],
        )
      : [];
    return list.length > 0 ? list : ["A", "B"];
  }
  if (kind === "goal" || kind === "exit") return [];
  return ["default"];
}

/**
 * Validação completa do grafo: regras do motor + coerência dos ramos por tipo
 * de etapa + janela de envio. Pura, para rodar igual no editor e no servidor.
 */
export function validateGraphInput(graph: JourneyGraphInput): JourneyIssue[] {
  const issues = validateJourney(toEngineNodes(graph.nodes), toEngineEdges(graph.edges));

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
    issues.push({ level: "error", message: "A janela de envio precisa começar antes de terminar." });
  }
  return issues;
}