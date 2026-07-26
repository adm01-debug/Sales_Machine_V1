/**
 * Guardrail de orçamento por canal — lógica pura, testável sem banco.
 *
 * Motivação: o painel /ops já mostra *quanto* foi gasto (melhoria 019), mas
 * mostrar custo depois do estouro é auditoria, não controle. Este módulo
 * transforma o custo em decisão operacional: quando o gasto do dia de um canal
 * atinge o limite configurado em `channel_budgets`, o worker de cadência deixa
 * de despachar naquele canal e reagenda o target.
 *
 * Princípio de projeto: **fail-open controlado**. Limite ausente ou igual a
 * zero significa "sem teto configurado" — nunca bloqueamos o pipeline inteiro
 * por falta de configuração. Já `enabled = false` é uma decisão explícita do
 * operador e bloqueia o canal integralmente.
 */

/** Fração do limite a partir da qual emitimos alerta antes do bloqueio. */
export const BUDGET_WARNING_THRESHOLD = 0.8;

/** Adiamento aplicado quando o canal está sem orçamento (vira meia-noite). */
export const BUDGET_DEFER_MS = 60 * 60_000;

export type BudgetStatus = "ok" | "warning" | "exhausted" | "disabled";

export interface ChannelBudget {
  channel: string;
  daily_limit_brl: number;
  monthly_limit_brl: number;
  enabled: boolean;
  note?: string | null;
}

export interface ChannelBudgetState {
  channel: string;
  status: BudgetStatus;
  /** Gasto estimado do dia corrente, em BRL. */
  spentToday: number;
  /** Gasto estimado do mês corrente, em BRL. */
  spentMonth: number;
  dailyLimit: number;
  monthlyLimit: number;
  /** Saldo restante do dia; `null` quando não há teto diário configurado. */
  remainingToday: number | null;
  /** Percentual do teto diário consumido (0–100+); `null` sem teto. */
  usageRate: number | null;
  /** Percentual do teto mensal consumido; `null` sem teto. */
  monthlyUsageRate: number | null;
  blocked: boolean;
  reason: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function toFiniteNonNegative(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Avalia um canal isolado. Precedência deliberada:
 *  1. canal desabilitado manualmente → bloqueio total
 *  2. teto mensal estourado → bloqueio (mais grave que o diário)
 *  3. teto diário estourado → bloqueio
 *  4. >= 80% de qualquer teto → alerta
 */
export function evaluateChannelBudget(
  budget: ChannelBudget | null | undefined,
  spend: { spentToday?: number; spentMonth?: number },
  channelFallback = "desconhecido",
): ChannelBudgetState {
  const channel = budget?.channel || channelFallback;
  const spentToday = round2(toFiniteNonNegative(spend.spentToday));
  const spentMonth = round2(Math.max(toFiniteNonNegative(spend.spentMonth), spentToday));
  const dailyLimit = toFiniteNonNegative(budget?.daily_limit_brl);
  const monthlyLimit = toFiniteNonNegative(budget?.monthly_limit_brl);

  const usageRate = dailyLimit > 0 ? round2((spentToday / dailyLimit) * 100) : null;
  const monthlyUsageRate = monthlyLimit > 0 ? round2((spentMonth / monthlyLimit) * 100) : null;
  const remainingToday = dailyLimit > 0 ? round2(Math.max(dailyLimit - spentToday, 0)) : null;

  const base = {
    channel,
    spentToday,
    spentMonth,
    dailyLimit,
    monthlyLimit,
    remainingToday,
    usageRate,
    monthlyUsageRate,
  };

  if (budget && budget.enabled === false) {
    return { ...base, status: "disabled", blocked: true, reason: "canal desativado pelo operador" };
  }
  if (monthlyLimit > 0 && spentMonth >= monthlyLimit) {
    return {
      ...base,
      status: "exhausted",
      blocked: true,
      reason: `orçamento mensal de ${monthlyLimit.toFixed(2)} BRL atingido`,
    };
  }
  if (dailyLimit > 0 && spentToday >= dailyLimit) {
    return {
      ...base,
      status: "exhausted",
      blocked: true,
      reason: `orçamento diário de ${dailyLimit.toFixed(2)} BRL atingido`,
    };
  }
  const nearDaily = usageRate !== null && usageRate >= BUDGET_WARNING_THRESHOLD * 100;
  const nearMonthly = monthlyUsageRate !== null && monthlyUsageRate >= BUDGET_WARNING_THRESHOLD * 100;
  if (nearDaily || nearMonthly) {
    return { ...base, status: "warning", blocked: false, reason: "acima de 80% do teto" };
  }
  return { ...base, status: "ok", blocked: false, reason: null };
}

export interface BudgetSnapshot {
  states: ChannelBudgetState[];
  /** Conjunto de canais que devem parar de despachar agora. */
  blockedChannels: Set<string>;
  totalSpentToday: number;
  totalDailyLimit: number;
}

/**
 * Constrói o snapshot completo cruzando as linhas de `channel_budgets` com os
 * gastos apurados. Canais com gasto mas sem linha de orçamento aparecem no
 * relatório como "sem teto" — visibilidade sem bloqueio.
 */
export function buildBudgetSnapshot(
  budgets: ChannelBudget[],
  spendByChannel: Record<string, { spentToday?: number; spentMonth?: number }>,
): BudgetSnapshot {
  const channels = new Set<string>([
    ...budgets.map((b) => b.channel),
    ...Object.keys(spendByChannel ?? {}),
  ]);
  const byChannel = new Map(budgets.map((b) => [b.channel, b]));

  const states: ChannelBudgetState[] = [];
  const blockedChannels = new Set<string>();
  let totalSpentToday = 0;
  let totalDailyLimit = 0;

  for (const channel of channels) {
    const state = evaluateChannelBudget(
      byChannel.get(channel) ?? null,
      spendByChannel?.[channel] ?? {},
      channel,
    );
    states.push(state);
    if (state.blocked) blockedChannels.add(channel);
    totalSpentToday += state.spentToday;
    totalDailyLimit += state.dailyLimit;
  }

  states.sort(
    (a, b) =>
      (b.usageRate ?? -1) - (a.usageRate ?? -1) ||
      b.spentToday - a.spentToday ||
      a.channel.localeCompare(b.channel),
  );

  return {
    states,
    blockedChannels,
    totalSpentToday: round2(totalSpentToday),
    totalDailyLimit: round2(totalDailyLimit),
  };
}
