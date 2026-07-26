/**
 * Motor de decisão das jornadas automatizadas (Automação 360).
 *
 * Módulo PURO e isomórfico: sem rede, banco, relógio implícito ou
 * `process.env`. Recebe o nó atual, as arestas de saída e os fatos do
 * contato, e devolve a próxima ação. O worker `tick-journeys` apenas coleta
 * os fatos, pergunta ao motor e executa o efeito colateral.
 *
 * Mesma disciplina de `cadence-engine.ts`: toda a política (consentimento,
 * janela de envio, orçamento, gate humano, ramificação, split A/B) mora aqui
 * para poder ser exercitada por testes determinísticos.
 */

import { preflightEmailContent } from "./email-preflight";

export type JourneyNodeKind = "trigger" | "send" | "wait" | "condition" | "split" | "goal" | "exit";

export interface JourneyNode {
  id: string;
  kind: JourneyNodeKind;
  label?: string;
  config: Record<string, unknown>;
}

export interface JourneyEdge {
  from_node_id: string;
  to_node_id: string;
  /** Rótulo do ramo: `default`, `true`/`false` (condição) ou `A`/`B` (split). */
  branch: string;
  ordinal?: number;
}

/** Operadores suportados pelo nó de condição. */
export type ConditionOp =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "exists"
  | "not_exists"
  | "in";

export interface JourneyCondition {
  field: string;
  op: ConditionOp;
  value?: unknown;
}

export const DEFAULT_BRANCH = "default";
export const TRUE_BRANCH = "true";
export const FALSE_BRANCH = "false";

/** Adiamento padrão quando o canal está sem orçamento — reavalia em 1h. */
export const BUDGET_DEFER_MS = 3_600_000;
/** Passo máximo de espera aceito num nó `wait` (30 dias), como guarda de sanidade. */
export const MAX_WAIT_MS = 30 * 86_400_000;

/* ------------------------------------------------------------------ *
 * Utilidades puras
 * ------------------------------------------------------------------ */

/** Lê um caminho `a.b.c` de um objeto sem lançar. */
export function readField(source: unknown, path: string): unknown {
  if (!path) return undefined;
  let cursor: unknown = source;
  for (const part of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

const asNumber = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
};

const asText = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim().toLowerCase();

/** Avalia um predicado isolado contra o perfil 360 do contato. */
export function evaluateCondition(condition: JourneyCondition, profile: unknown): boolean {
  const actual = readField(profile, condition.field);
  const expected = condition.value;

  switch (condition.op) {
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "not_exists":
      return actual === undefined || actual === null || actual === "";
    case "eq":
      return asText(actual) === asText(expected);
    case "neq":
      return asText(actual) !== asText(expected);
    case "contains":
      return asText(actual).includes(asText(expected));
    case "not_contains":
      return !asText(actual).includes(asText(expected));
    case "in":
      return Array.isArray(expected) && expected.some((item) => asText(item) === asText(actual));
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = asNumber(actual);
      const b = asNumber(expected);
      // Comparação numérica com dado ausente é sempre falsa (nunca lança).
      if (a === null || b === null) return false;
      if (condition.op === "gt") return a > b;
      if (condition.op === "gte") return a >= b;
      if (condition.op === "lt") return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}

/** Normaliza o JSON não confiável de `journey_nodes.config` em condições válidas. */
export function parseConditions(raw: unknown): JourneyCondition[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): JourneyCondition[] => {
    if (!item || typeof item !== "object") return [];
    const rec = item as Record<string, unknown>;
    const field = typeof rec.field === "string" ? rec.field.trim() : "";
    const op = typeof rec.op === "string" ? (rec.op.trim() as ConditionOp) : "eq";
    if (!field) return [];
    return [{ field, op, value: rec.value }];
  });
}

/** `all` (E lógico, padrão) ou `any` (OU lógico) sobre a lista de condições. */
export function evaluateConditionGroup(
  conditions: JourneyCondition[],
  mode: "all" | "any",
  profile: unknown,
): boolean {
  if (conditions.length === 0) return true; // grupo vazio não bloqueia o fluxo
  return mode === "any"
    ? conditions.some((c) => evaluateCondition(c, profile))
    : conditions.every((c) => evaluateCondition(c, profile));
}

/** Duração de espera (ms) declarada num nó `wait`, saneada e limitada. */
export function waitDurationMs(config: Record<string, unknown>): number {
  const minutes = asNumber(config.delay_minutes) ?? 0;
  const hours = asNumber(config.delay_hours) ?? 0;
  const days = asNumber(config.delay_days) ?? 0;
  const total = minutes * 60_000 + hours * 3_600_000 + days * 86_400_000;
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(total, MAX_WAIT_MS);
}

/**
 * Empurra um instante para dentro da janela de envio (hora local do servidor
 * na prática é UTC; a janela é interpretada em UTC de forma consistente com
 * `marketing_campaigns.send_window_*`).
 */
export function clampToSendWindow(atMs: number, startHour: number, endHour: number): number {
  const start = Number.isFinite(startHour) ? Math.min(Math.max(Math.trunc(startHour), 0), 23) : 0;
  const end = Number.isFinite(endHour) ? Math.min(Math.max(Math.trunc(endHour), 0), 24) : 24;
  if (start === 0 && end >= 24) return atMs;
  if (start >= end) return atMs; // janela inválida: não adia (fail-open)

  const at = new Date(atMs);
  const hour = at.getUTCHours();
  if (hour >= start && hour < end) return atMs;

  const shifted = new Date(atMs);
  if (hour < start) {
    shifted.setUTCHours(start, 0, 0, 0);
  } else {
    shifted.setUTCDate(shifted.getUTCDate() + 1);
    shifted.setUTCHours(start, 0, 0, 0);
  }
  return shifted.getTime();
}

/**
 * Escolhe deterministicamente um ramo do nó `split` a partir dos pesos.
 * A semente costuma ser o id da inscrição: o mesmo contato cai sempre no
 * mesmo ramo, mesmo que o worker reprocesse o nó.
 */
export function pickSplitBranch(
  branches: { branch: string; weight: number }[],
  seed: string,
): string | null {
  const valid = branches.filter((b) => b.branch && Number.isFinite(b.weight) && b.weight > 0);
  if (valid.length === 0) return branches[0]?.branch ?? null;
  const total = valid.reduce((acc, b) => acc + b.weight, 0);

  // FNV-1a: hash estável, sem dependência externa.
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bucket = (hash >>> 0) % 10_000;
  const target = (bucket / 10_000) * total;

  let cursor = 0;
  for (const b of valid) {
    cursor += b.weight;
    if (target < cursor) return b.branch;
  }
  return valid[valid.length - 1].branch;
}

/** Lê `config.branches` de um nó `split`, tolerando JSON malformado. */
export function parseSplitBranches(raw: unknown): { branch: string; weight: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const rec = item as Record<string, unknown>;
    const branch = typeof rec.branch === "string" ? rec.branch.trim() : "";
    const weight = asNumber(rec.weight) ?? 0;
    return branch ? [{ branch, weight }] : [];
  });
}

/** Aresta de saída de um nó para um ramo, com fallback para `default`. */
export function findEdge(edges: JourneyEdge[], nodeId: string, branch: string): JourneyEdge | null {
  const outgoing = edges
    .filter((e) => e.from_node_id === nodeId)
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  return (
    outgoing.find((e) => e.branch === branch) ??
    (branch === DEFAULT_BRANCH ? (outgoing[0] ?? null) : null)
  );
}

/* ------------------------------------------------------------------ *
 * Decisão
 * ------------------------------------------------------------------ */

export interface JourneyFacts {
  node: JourneyNode;
  edges: JourneyEdge[];
  /** Perfil 360 achatado do contato, usado pelas condições. */
  profile: Record<string, unknown>;
  /** `check_consent(entity, canal do nó)`. `null` = indeterminado → permite. */
  consentAllowed: boolean | null;
  /** Canal sem orçamento (teto atingido ou desativado). */
  budgetBlocked?: boolean;
  budgetReason?: string | null;
  /** Gate humano herdado da jornada. */
  requiresHumanApproval: boolean;
  /** Semente determinística do split — normalmente o id da inscrição. */
  seed: string;
  /** Janela de envio da jornada (horas UTC). */
  sendWindowStart: number;
  sendWindowEnd: number;
  now: number;
}

export type JourneyDecision =
  | { action: "advance"; toNodeId: string; branch: string }
  | { action: "wait"; toNodeId: string; resumeAt: string }
  | { action: "send"; channel: string; config: Record<string, unknown>; nextNodeId: string | null }
  | { action: "approval_gate"; channel: string; config: Record<string, unknown> }
  | { action: "defer"; reason: string; resumeAt: string }
  | { action: "goal_reached"; reason: string }
  | { action: "exit"; reason: string }
  | { action: "fail"; reason: string };

/**
 * Decide a próxima ação de uma inscrição parada no nó atual.
 *
 * Precedência dentro do nó `send` (do mais restritivo ao mais permissivo):
 *  1. Canal ausente/ inválido → fail (grafo malformado)
 *  2. Consentimento negado → exit (LGPD: nunca reagendar quem pediu opt-out)
 *  3. Fora da janela de envio → defer até a abertura
 *  4. Orçamento do canal esgotado → defer 1h
 *  5. Gate humano → approval_gate
 *  6. Envio
 */
export function decideJourneyAction(facts: JourneyFacts): JourneyDecision {
  const { node, edges, now } = facts;
  const config = node.config ?? {};

  switch (node.kind) {
    case "trigger": {
      const edge = findEdge(edges, node.id, DEFAULT_BRANCH);
      if (!edge) return { action: "fail", reason: "gatilho sem etapa seguinte" };
      return { action: "advance", toNodeId: edge.to_node_id, branch: edge.branch };
    }

    case "wait": {
      const edge = findEdge(edges, node.id, DEFAULT_BRANCH);
      if (!edge) return { action: "fail", reason: "espera sem etapa seguinte" };
      const duration = waitDurationMs(config);
      const resumeAt = clampToSendWindow(
        now + duration,
        facts.sendWindowStart,
        facts.sendWindowEnd,
      );
      return { action: "wait", toNodeId: edge.to_node_id, resumeAt: new Date(resumeAt).toISOString() };
    }

    case "condition": {
      const conditions = parseConditions(config.conditions);
      const mode = config.match === "any" ? "any" : "all";
      const result = evaluateConditionGroup(conditions, mode, facts.profile);
      const branch = result ? TRUE_BRANCH : FALSE_BRANCH;
      const edge = findEdge(edges, node.id, branch);
      if (!edge) {
        return { action: "exit", reason: `condição ${branch} sem saída — encerrando jornada` };
      }
      return { action: "advance", toNodeId: edge.to_node_id, branch };
    }

    case "split": {
      const branches = parseSplitBranches(config.branches);
      const picked = pickSplitBranch(branches, facts.seed) ?? DEFAULT_BRANCH;
      const edge = findEdge(edges, node.id, picked) ?? findEdge(edges, node.id, DEFAULT_BRANCH);
      if (!edge) return { action: "fail", reason: `divisão sem saída para o ramo ${picked}` };
      return { action: "advance", toNodeId: edge.to_node_id, branch: edge.branch };
    }

    case "goal":
      return { action: "goal_reached", reason: String(config.label ?? node.label ?? "meta atingida") };

    case "exit":
      return { action: "exit", reason: String(config.reason ?? node.label ?? "saída do fluxo") };

    case "send": {
      const channel = typeof config.channel === "string" ? config.channel.trim().toLowerCase() : "";
      if (!channel) return { action: "fail", reason: "etapa de envio sem canal definido" };

      // `null` (RPC indisponível) equivale a opt-in implícito, igual ao
      // COALESCE(..., TRUE) de public.check_consent.
      if (facts.consentAllowed === false) {
        return { action: "exit", reason: `sem consentimento para o canal ${channel}` };
      }

      const windowed = clampToSendWindow(now, facts.sendWindowStart, facts.sendWindowEnd);
      if (windowed > now) {
        return {
          action: "defer",
          reason: "fora da janela de envio",
          resumeAt: new Date(windowed).toISOString(),
        };
      }

      // Guardrail financeiro nunca encerra a jornada — apenas adia.
      if (facts.budgetBlocked === true) {
        return {
          action: "defer",
          reason: `orçamento do canal ${channel}: ${facts.budgetReason ?? "teto atingido"}`,
          resumeAt: new Date(now + BUDGET_DEFER_MS).toISOString(),
        };
      }

      if (facts.requiresHumanApproval) return { action: "approval_gate", channel, config };

      const edge = findEdge(edges, node.id, DEFAULT_BRANCH);
      return { action: "send", channel, config, nextNodeId: edge?.to_node_id ?? null };
    }

    default:
      return { action: "fail", reason: `tipo de etapa desconhecido: ${String(node.kind)}` };
  }
}

/* ------------------------------------------------------------------ *
 * Validação do grafo (antes de publicar)
 * ------------------------------------------------------------------ */

export interface JourneyIssue {
  level: "error" | "warning";
  nodeId?: string;
  message: string;
}

/**
 * Valida o grafo antes de ativar a jornada: exatamente um gatilho, nenhum nó
 * órfão, saídas obrigatórias por tipo e ausência de ciclo sem espera (que
 * causaria laço infinito no worker).
 */
export function validateJourney(nodes: JourneyNode[], edges: JourneyEdge[]): JourneyIssue[] {
  const issues: JourneyIssue[] = [];
  const triggers = nodes.filter((n) => n.kind === "trigger");

  if (triggers.length === 0) issues.push({ level: "error", message: "A jornada precisa de um gatilho." });
  if (triggers.length > 1)
    issues.push({ level: "error", message: "A jornada só pode ter um gatilho de entrada." });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hasOutgoing = (id: string) => edges.some((e) => e.from_node_id === id);
  const hasIncoming = (id: string) => edges.some((e) => e.to_node_id === id);

  for (const node of nodes) {
    const terminal = node.kind === "exit" || node.kind === "goal";
    if (!terminal && !hasOutgoing(node.id)) {
      issues.push({
        level: "error",
        nodeId: node.id,
        message: `A etapa "${node.label || node.kind}" não tem saída.`,
      });
    }
    if (node.kind !== "trigger" && !hasIncoming(node.id)) {
      issues.push({
        level: "warning",
        nodeId: node.id,
        message: `A etapa "${node.label || node.kind}" está desconectada do fluxo.`,
      });
    }
    if (node.kind === "send" && !String(node.config?.channel ?? "").trim()) {
      issues.push({ level: "error", nodeId: node.id, message: "Etapa de envio sem canal definido." });
    }
    if (node.kind === "send") {
      const cfg = node.config ?? {};
      const inlineBody = typeof cfg.body === "string" ? cfg.body.trim() : "";
      const templateId = typeof cfg.template_id === "string" ? cfg.template_id.trim() : "";
      if (!inlineBody && !templateId) {
        issues.push({
          level: "error",
          nodeId: node.id,
          message: `A etapa "${node.label || "envio"}" não tem mensagem nem template selecionado.`,
        });
      }
      // Pré-voo de entregabilidade só é possível para conteúdo escrito no nó;
      // quando vem de template, a Biblioteca já bloqueia no salvamento.
      if (String(cfg.channel ?? "") === "email" && inlineBody) {
        const report = preflightEmailContent({
          subject: typeof cfg.subject === "string" ? cfg.subject : "",
          body: inlineBody,
        });
        for (const finding of report.findings) {
          if (finding.severity === "info") continue;
          issues.push({
            level: finding.severity === "error" ? "error" : "warning",
            nodeId: node.id,
            message: `Entregabilidade: ${finding.message}${finding.hint ? ` ${finding.hint}` : ""}`,
          });
        }
      }
    }
    if (node.kind === "wait" && waitDurationMs(node.config ?? {}) === 0) {
      issues.push({
        level: "warning",
        nodeId: node.id,
        message: "Espera de duração zero — a etapa será atravessada imediatamente.",
      });
    }
    if (node.kind === "condition") {
      for (const branch of [TRUE_BRANCH, FALSE_BRANCH]) {
        if (!edges.some((e) => e.from_node_id === node.id && e.branch === branch)) {
          issues.push({
            level: "warning",
            nodeId: node.id,
            message: `Condição sem ramo "${branch}" — o contato sai do fluxo nesse caso.`,
          });
        }
      }
    }
  }

  for (const edge of edges) {
    if (!byId.has(edge.from_node_id) || !byId.has(edge.to_node_id)) {
      issues.push({ level: "error", message: "Existe uma ligação apontando para etapa inexistente." });
    }
  }

  if (findWaitlessCycle(nodes, edges)) {
    issues.push({
      level: "error",
      message: "Há um ciclo sem etapa de espera — isso criaria um laço infinito.",
    });
  }

  return issues;
}

/** DFS procurando ciclo que não passe por nenhum nó `wait`. */
export function findWaitlessCycle(nodes: JourneyNode[], edges: JourneyEdge[]): boolean {
  const kind = new Map(nodes.map((n) => [n.id, n.kind]));
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (kind.get(e.from_node_id) === "wait") continue; // espera quebra o laço
    adj.set(e.from_node_id, [...(adj.get(e.from_node_id) ?? []), e.to_node_id]);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(nodes.map((n) => [n.id, WHITE]));

  const visit = (id: string): boolean => {
    color.set(id, GRAY);
    for (const next of adj.get(id) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && visit(next)) return true;
    }
    color.set(id, BLACK);
    return false;
  };

  for (const node of nodes) {
    if ((color.get(node.id) ?? WHITE) === WHITE && visit(node.id)) return true;
  }
  return false;
}
