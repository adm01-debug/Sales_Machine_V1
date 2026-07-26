/**
 * Motor de decisão da cadência 1:1 (tick-cadence).
 *
 * Módulo PURO e isomórfico: sem acesso a rede, banco ou `process.env`.
 * Toda a política de despacho (consentimento, cooldown, hard bounce, cap de
 * e-mail, gate humano, retry/backoff) mora aqui para poder ser exercitada por
 * testes determinísticos. O worker apenas coleta os fatos no banco, pergunta
 * ao motor o que fazer e executa o efeito colateral resultante.
 */

export interface CadenceStep {
  channel: string;
  delay_days: number;
  media_url?: string;
  rcs_payload?: Record<string, unknown>;
}

/** Backoff exponencial (minutos) por tentativa consecutiva de falha. */
export const BACKOFF_MINUTES: readonly number[] = [1, 5, 30, 120, 480];

/** Cadência de fallback quando a campanha não referencia uma `cadence_rule`. */
export const DEFAULT_STEPS: readonly CadenceStep[] = [
  { channel: "whatsapp", delay_days: 0 },
  { channel: "email", delay_days: 2 },
];

export const SOCIAL_CHANNELS = ["linkedin", "instagram"] as const;

export function isSocialChannel(channel: string): channel is "linkedin" | "instagram" {
  return (SOCIAL_CHANNELS as readonly string[]).includes(channel);
}

/** Instante (ISO) da próxima tentativa após `attempts` falhas acumuladas. */
export function nextRetryAt(attempts: number, now: number = Date.now()): string {
  const safeAttempts = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0;
  const idx = Math.min(safeAttempts, BACKOFF_MINUTES.length - 1);
  return new Date(now + BACKOFF_MINUTES[idx] * 60_000).toISOString();
}

/**
 * Normaliza o JSON `cadence_rules.steps` (não confiável) em passos válidos.
 * Passos malformados são descartados em vez de derrubar o tick inteiro.
 */
export function resolveSteps(raw: unknown): CadenceStep[] {
  if (!Array.isArray(raw)) return [...DEFAULT_STEPS];
  const steps = raw.flatMap((item): CadenceStep[] => {
    if (!item || typeof item !== "object") return [];
    const rec = item as Record<string, unknown>;
    const channel = typeof rec.channel === "string" ? rec.channel.trim().toLowerCase() : "";
    if (!channel) return [];
    const delay = Number(rec.delay_days);
    return [
      {
        channel,
        delay_days: Number.isFinite(delay) && delay >= 0 ? delay : 0,
        ...(typeof rec.media_url === "string" ? { media_url: rec.media_url } : {}),
        ...(rec.rcs_payload && typeof rec.rcs_payload === "object"
          ? { rcs_payload: rec.rcs_payload as Record<string, unknown> }
          : {}),
      },
    ];
  });
  return steps.length > 0 ? steps : [...DEFAULT_STEPS];
}

export interface CadenceFacts {
  /** Índice do passo atual dentro de `steps`. */
  currentStep: number;
  steps: CadenceStep[];
  /** Resultado de `check_consent(entity, channel)`. `null` = indeterminado. */
  consentAllowed: boolean | null;
  /** Resultado de `has_recent_account_touchpoint`. */
  hasRecentAccountTouchpoint: boolean;
  accountCooldownHours: number;
  /** `metadata.hard_bounce` da entidade. */
  emailHardBounce: boolean;
  /** Envios de e-mail já feitos hoje pelo sender. */
  emailSentToday: number;
  /** `compute_daily_cap(sender)`. */
  emailDailyCap: number;
  requiresHumanApproval: boolean;
}

export type CadenceDecision =
  | { action: "complete"; reason: string }
  | { action: "stop"; reason: string }
  | { action: "defer"; reason: string; delayMs: number }
  | { action: "approval_gate"; step: CadenceStep }
  | { action: "send"; step: CadenceStep };

export const COOLDOWN_DEFER_MS = 24 * 3_600_000;
export const EMAIL_CAP_DEFER_MS = 3_600_000;

/**
 * Decide a próxima ação para um target travado.
 *
 * Ordem de precedência (deliberada, do mais restritivo ao mais permissivo):
 *  1. Cadência esgotada → completed
 *  2. Consentimento negado → stopped (LGPD: nunca reagendar quem pediu opt-out)
 *  3. Cooldown de conta → adia 24h
 *  4. Hard bounce em e-mail → stopped
 *  5. Cap diário de e-mail → adia 1h
 *  6. Gate humano → pending_approval
 *  7. Envio
 */
export function decideCadenceAction(facts: CadenceFacts): CadenceDecision {
  const step = facts.steps[facts.currentStep];
  if (!step) return { action: "complete", reason: "cadência concluída" };

  // `null` (RPC indisponível) é tratado como opt-in implícito, igual ao
  // COALESCE(..., TRUE) de public.check_consent.
  if (facts.consentAllowed === false) {
    return { action: "stop", reason: `sem consentimento para o canal ${step.channel}` };
  }

  if (facts.hasRecentAccountTouchpoint) {
    return {
      action: "defer",
      reason: `account cooldown ${facts.accountCooldownHours}h`,
      delayMs: COOLDOWN_DEFER_MS,
    };
  }

  if (step.channel === "email") {
    if (facts.emailHardBounce) {
      return { action: "stop", reason: "email hard_bounce — canal desativado para este contato" };
    }
    if (facts.emailSentToday >= facts.emailDailyCap) {
      return {
        action: "defer",
        reason: `email cap ${facts.emailDailyCap} atingido`,
        delayMs: EMAIL_CAP_DEFER_MS,
      };
    }
  }

  if (facts.requiresHumanApproval) return { action: "approval_gate", step };
  return { action: "send", step };
}

export type FailureOutcome =
  | { action: "dead_letter"; attempts: number; error: string }
  | { action: "retry"; attempts: number; nextRunAt: string; error: string };

/** Aplica a política de retry/backoff após uma falha de despacho. */
export function decideFailureOutcome(
  previousAttempts: number,
  maxAttempts: number,
  error: string,
  now: number = Date.now(),
): FailureOutcome {
  const attempts = (Number.isFinite(previousAttempts) ? Math.max(0, previousAttempts) : 0) + 1;
  const limit = Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 5;
  if (attempts >= limit) return { action: "dead_letter", attempts, error };
  return { action: "retry", attempts, nextRunAt: nextRetryAt(attempts, now), error };
}

/** Erros de RCS que justificam degradar automaticamente para SMS. */
export function isRcsFallbackError(message: string): boolean {
  return /not[_ ]?support|unavailable|404|405/i.test(message);
}

/** Próximo estado do target após um despacho bem-sucedido. */
export function advancePlan(
  currentStep: number,
  steps: CadenceStep[],
  now: number = Date.now(),
): { done: true } | { done: false; nextStep: number; nextRunAt: string } {
  const nextIdx = currentStep + 1;
  const next = steps[nextIdx];
  if (!next) return { done: true };
  const delayDays = Number.isFinite(next.delay_days) ? next.delay_days : 1;
  return { done: false, nextStep: nextIdx, nextRunAt: new Date(now + delayDays * 86_400_000).toISOString() };
}