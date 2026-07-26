/**
 * Política da realocação automática de orçamento (melhoria 025).
 *
 * Módulo puro: nenhuma dependência de banco, de rede ou de relógio implícito.
 * O objetivo é decidir *se* a varredura agendada pode aplicar o plano corrente,
 * protegendo o sistema de três falhas previstas na simulação de cenários:
 *
 *  1. Oscilação (flapping): dois ticks seguidos movendo saldo de ida e volta.
 *     → intervalo mínimo entre aplicações automáticas.
 *  2. Ruído contábil: transferências irrelevantes poluindo a trilha de auditoria.
 *     → valor mínimo movimentado.
 *  3. Movimentos silenciosos e grandes demais: um plano que remaneja quase todo
 *     o teto autorizado deve passar por um humano.
 *     → limite percentual do total autorizado.
 */

export interface ScheduleInput {
  /** Total que o plano corrente pretende movimentar, em BRL. */
  movedTotal: number;
  /** Soma dos tetos diários antes da aplicação, em BRL. */
  totalBefore: number;
  /** Quantidade de canais que teriam o teto alterado. */
  channelsChanged: number;
  /** Momento da última realocação registrada (ISO) ou null se nunca houve. */
  lastAppliedAt: string | null;
  now: Date;
}

export interface SchedulePolicy {
  /** Intervalo mínimo entre duas aplicações automáticas. */
  minIntervalMinutes: number;
  /** Valor mínimo movimentado para justificar a aplicação. */
  minMovedBrl: number;
  /** Fração máxima do total autorizado que a automação pode remanejar (0–1). */
  maxMovedShare: number;
}

export const DEFAULT_SCHEDULE_POLICY: SchedulePolicy = {
  minIntervalMinutes: 60,
  minMovedBrl: 5,
  maxMovedShare: 0.5,
};

export type ScheduleDecisionCode =
  | "apply"
  | "no_plan"
  | "cooldown"
  | "below_min_moved"
  | "exceeds_max_share";

export interface ScheduleDecision {
  shouldApply: boolean;
  code: ScheduleDecisionCode;
  reason: string;
  /** Minutos restantes de cooldown (0 quando não há). */
  cooldownRemainingMinutes: number;
}

function sanitizePolicy(policy: Partial<SchedulePolicy> | undefined): SchedulePolicy {
  const p = { ...DEFAULT_SCHEDULE_POLICY, ...(policy ?? {}) };
  return {
    minIntervalMinutes: Number.isFinite(p.minIntervalMinutes)
      ? Math.max(0, p.minIntervalMinutes)
      : DEFAULT_SCHEDULE_POLICY.minIntervalMinutes,
    minMovedBrl: Number.isFinite(p.minMovedBrl)
      ? Math.max(0, p.minMovedBrl)
      : DEFAULT_SCHEDULE_POLICY.minMovedBrl,
    maxMovedShare:
      Number.isFinite(p.maxMovedShare) && p.maxMovedShare > 0
        ? Math.min(1, p.maxMovedShare)
        : DEFAULT_SCHEDULE_POLICY.maxMovedShare,
  };
}

export function decideScheduledReallocation(
  input: ScheduleInput,
  policy?: Partial<SchedulePolicy>,
): ScheduleDecision {
  const p = sanitizePolicy(policy);
  const moved = Number.isFinite(input.movedTotal) ? Math.max(0, input.movedTotal) : 0;

  if (input.channelsChanged <= 0 || moved <= 0) {
    return {
      shouldApply: false,
      code: "no_plan",
      reason: "Nenhuma transferência proposta pelo motor no momento.",
      cooldownRemainingMinutes: 0,
    };
  }

  if (input.lastAppliedAt && p.minIntervalMinutes > 0) {
    const last = new Date(input.lastAppliedAt).getTime();
    // Data inválida no histórico não pode travar a automação para sempre.
    if (Number.isFinite(last)) {
      const elapsedMin = (input.now.getTime() - last) / 60_000;
      if (elapsedMin < p.minIntervalMinutes) {
        const remaining = Math.ceil(p.minIntervalMinutes - elapsedMin);
        return {
          shouldApply: false,
          code: "cooldown",
          reason: `Última realocação há ${Math.floor(Math.max(elapsedMin, 0))} min; aguardando ${remaining} min de intervalo mínimo.`,
          cooldownRemainingMinutes: remaining,
        };
      }
    }
  }

  if (moved < p.minMovedBrl) {
    return {
      shouldApply: false,
      code: "below_min_moved",
      reason: `Movimento de R$ ${moved.toFixed(2)} abaixo do mínimo de R$ ${p.minMovedBrl.toFixed(2)}.`,
      cooldownRemainingMinutes: 0,
    };
  }

  const total = Number.isFinite(input.totalBefore) ? input.totalBefore : 0;
  if (total > 0 && moved / total > p.maxMovedShare) {
    return {
      shouldApply: false,
      code: "exceeds_max_share",
      reason: `Plano remaneja ${((moved / total) * 100).toFixed(1)}% do teto autorizado (máximo automático: ${(p.maxMovedShare * 100).toFixed(0)}%). Requer aprovação manual em /ops.`,
      cooldownRemainingMinutes: 0,
    };
  }

  return {
    shouldApply: true,
    code: "apply",
    reason: `Aplicando R$ ${moved.toFixed(2)} em ${input.channelsChanged} canal(is).`,
    cooldownRemainingMinutes: 0,
  };
}

/** Lê a política a partir de variáveis de ambiente, caindo no padrão seguro. */
export function policyFromEnv(env: Record<string, string | undefined>): SchedulePolicy {
  const num = (v: string | undefined) => {
    if (v === undefined || v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return sanitizePolicy({
    minIntervalMinutes: num(env.BUDGET_REALLOC_MIN_INTERVAL_MIN),
    minMovedBrl: num(env.BUDGET_REALLOC_MIN_MOVED_BRL),
    maxMovedShare: num(env.BUDGET_REALLOC_MAX_SHARE),
  });
}
