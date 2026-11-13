/**
 * Gatilhos de jornada (Automação 360) — módulo PURO.
 *
 * Responde a duas perguntas, sem tocar em rede/banco/relógio implícito:
 *  1. Este evento casa com o gatilho declarado no nó `trigger`?
 *  2. Este contato PODE entrar na jornada agora (reentrada, cooldown, teto
 *     diário de entradas, consentimento)?
 *
 * O worker apenas coleta os fatos e obedece. Mesma disciplina de
 * `cadence-engine.ts` e `journey-engine.ts`.
 */

import { evaluateConditionGroup, parseConditions, type JourneyCondition } from "./journey-engine";

/** Origens de evento aceitas como gatilho. */
export const TRIGGER_SOURCES = ["lux", "singu", "fatorx", "fuxico", "promo", "manual"] as const;
export type TriggerSource = (typeof TRIGGER_SOURCES)[number];

export interface JourneyTriggerConfig {
  /** Tipos de evento aceitos (vazio = qualquer tipo). Comparação case-insensitive. */
  eventTypes: string[];
  /** Origens aceitas (vazio = qualquer origem). */
  sources: string[];
  /** Predicados extras sobre o perfil 360 do contato. */
  conditions: JourneyCondition[];
  match: "all" | "any";
  /** Só entra se pertencer a esta audiência (null = sem restrição). */
  audienceId: string | null;
  /** Janela mínima entre duas entradas do mesmo contato, em horas. */
  cooldownHours: number;
}

export const DEFAULT_TRIGGER_CONFIG: JourneyTriggerConfig = {
  eventTypes: [],
  sources: [],
  conditions: [],
  match: "all",
  audienceId: null,
  cooldownHours: 0,
};

const asList = (raw: unknown): string[] => {
  const items = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return items
    .map((v) =>
      String(v ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter((v) => v.length > 0);
};

const asPositiveNumber = (raw: unknown): number => {
  const n = typeof raw === "string" ? Number(raw.replace(",", ".")) : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Normaliza o JSON não confiável de `journey_nodes.config` do nó `trigger`. */
export function parseTriggerConfig(raw: unknown): JourneyTriggerConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TRIGGER_CONFIG };
  const rec = raw as Record<string, unknown>;
  const audience = typeof rec.audience_id === "string" ? rec.audience_id.trim() : "";
  return {
    eventTypes: asList(rec.event_types ?? rec.event_type),
    sources: asList(rec.sources ?? rec.source),
    conditions: parseConditions(rec.conditions),
    match: rec.match === "any" ? "any" : "all",
    audienceId: audience.length > 0 ? audience : null,
    cooldownHours: asPositiveNumber(rec.cooldown_hours),
  };
}

export interface TriggerEvent {
  eventType: string;
  source: string;
  /** Perfil 360 achatado do contato — alvo das condições. */
  profile: Record<string, unknown>;
  /** Audiências às quais o contato pertence (ids). */
  audienceIds?: string[];
}

/** O evento casa com o gatilho? Config vazia casa com tudo (por desenho). */
export function matchesTrigger(config: JourneyTriggerConfig, event: TriggerEvent): boolean {
  const type = String(event.eventType ?? "")
    .trim()
    .toLowerCase();
  const source = String(event.source ?? "")
    .trim()
    .toLowerCase();

  if (config.eventTypes.length > 0 && !config.eventTypes.includes(type)) return false;
  if (config.sources.length > 0 && !config.sources.includes(source)) return false;
  if (config.audienceId && !(event.audienceIds ?? []).includes(config.audienceId)) return false;

  return evaluateConditionGroup(config.conditions, config.match, event.profile);
}

export type EnrollmentBlockCode =
  | "ok"
  | "journey_inactive"
  | "already_enrolled"
  | "reentry_blocked"
  | "cooldown"
  | "entry_cap"
  | "no_consent";

export interface EnrollmentFacts {
  journeyStatus: string;
  allowReentry: boolean;
  /** Já existe inscrição ativa (running/waiting/paused) deste contato. */
  hasActiveEnrollment: boolean;
  /** ISO da última inscrição encerrada, ou null. */
  lastFinishedAt: string | null;
  entriesToday: number;
  entryDailyCap: number;
  /** `check_consent` global; `null` = indeterminado → permite (igual ao COALESCE do SQL). */
  consentAllowed?: boolean | null;
  now: Date;
}

export interface EnrollmentDecision {
  shouldEnroll: boolean;
  code: EnrollmentBlockCode;
  reason: string;
}

/**
 * Precedência (do mais restritivo ao mais permissivo):
 * jornada inativa → sem consentimento → inscrição ativa → reentrada proibida
 * → cooldown → teto diário de entradas.
 */
export function decideEnrollment(
  facts: EnrollmentFacts,
  config: JourneyTriggerConfig = DEFAULT_TRIGGER_CONFIG,
): EnrollmentDecision {
  if (facts.journeyStatus !== "active") {
    return { shouldEnroll: false, code: "journey_inactive", reason: "Jornada não está ativa." };
  }
  if (facts.consentAllowed === false) {
    return { shouldEnroll: false, code: "no_consent", reason: "Contato sem consentimento." };
  }
  if (facts.hasActiveEnrollment) {
    return {
      shouldEnroll: false,
      code: "already_enrolled",
      reason: "Contato já está percorrendo esta jornada.",
    };
  }
  if (facts.lastFinishedAt && !facts.allowReentry) {
    return {
      shouldEnroll: false,
      code: "reentry_blocked",
      reason: "Jornada não permite reentrada.",
    };
  }

  if (facts.lastFinishedAt && config.cooldownHours > 0) {
    const last = new Date(facts.lastFinishedAt).getTime();
    if (Number.isFinite(last)) {
      const elapsedHours = (facts.now.getTime() - last) / 3_600_000;
      if (elapsedHours < config.cooldownHours) {
        const remaining = Math.ceil(config.cooldownHours - elapsedHours);
        return {
          shouldEnroll: false,
          code: "cooldown",
          reason: `Aguardando intervalo mínimo entre entradas (${remaining}h restantes).`,
        };
      }
    }
    // Data inválida no histórico não pode travar a jornada para sempre.
  }

  const cap = Number.isFinite(facts.entryDailyCap) ? facts.entryDailyCap : 0;
  if (cap > 0 && facts.entriesToday >= cap) {
    return {
      shouldEnroll: false,
      code: "entry_cap",
      reason: `Teto diário de entradas atingido (${cap}).`,
    };
  }

  return { shouldEnroll: true, code: "ok", reason: "Elegível para entrar na jornada." };
}
