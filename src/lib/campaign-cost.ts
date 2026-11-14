/**
 * Pré-voo de custo de campanha — lógica pura, testável sem banco.
 *
 * Motivação: hoje o operador só descobre o custo *depois* do disparo (painel
 * /ops, melhoria 019) ou quando o guardrail bloqueia o canal (melhorias
 * 020/021). Este módulo antecipa a conta: dado o tamanho da audiência, o canal
 * e as variantes, estima quanto o lançamento vai consumir e compara com o
 * saldo de orçamento ainda disponível no dia e no mês.
 *
 * Premissa explícita: uma mensagem por contato (campanhas de marketing são
 * 1:many, não cadências multi-toque). SMS/RCS/MMS são cobrados por segmento,
 * então o texto de cada variante é analisado e ponderado pelo split A/B.
 */
import { analyzeSms } from "@/lib/sms-segments";
import { unitCostFor } from "@/lib/cost-model";

/** Canais cobrados por segmento — o corpo da mensagem altera o custo. */
export const SEGMENTED_CHANNELS = new Set(["sms", "rcs", "mms"]);

export interface VariantForEstimate {
  label: string;
  body: string;
  split_percent: number;
}

export interface VariantCostLine {
  label: string;
  /** Contatos atribuídos a esta variante pelo split. */
  recipients: number;
  /** Segmentos por mensagem (1 para canais não segmentados). */
  segmentsPerMessage: number;
  /** Segmentos totais faturáveis desta variante. */
  segments: number;
  cost: number;
}

export interface CampaignCostEstimate {
  channel: string;
  audienceSize: number;
  unitCost: number;
  /** Segmentos totais do lançamento (soma das variantes). */
  totalSegments: number;
  /** Custo estimado total, em BRL. */
  totalCost: number;
  /** Custo médio por contato, em BRL. */
  costPerContact: number;
  variants: VariantCostLine[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

function segmentsFor(channel: string, body: string): number {
  if (!SEGMENTED_CHANNELS.has(channel)) return 1;
  return Math.max(analyzeSms(body ?? "").segments, 1);
}

/**
 * Distribui `total` destinatários entre as variantes respeitando os pesos.
 * O resto da divisão vai para a maior variante, de modo que a soma das linhas
 * sempre feche exatamente com o tamanho da audiência (sem sub/superestimar).
 */
export function allocateRecipients(total: number, weights: number[]): number[] {
  const size = Math.max(Math.trunc(Number(total) || 0), 0);
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  if (safe.length === 0 || size === 0) return safe.map(() => 0);
  // Sem pesos válidos: divisão igualitária, para não zerar a estimativa.
  const effective = sum > 0 ? safe : safe.map(() => 1);
  const effSum = effective.reduce((a, b) => a + b, 0);

  const alloc = effective.map((w) => Math.floor((size * w) / effSum));
  let remainder = size - alloc.reduce((a, b) => a + b, 0);
  // Distribui o resto começando pelas maiores frações, de forma determinística.
  const order = effective
    .map((w, i) => ({ i, frac: (size * w) / effSum - Math.floor((size * w) / effSum) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let k = 0;
  while (remainder > 0 && order.length > 0) {
    alloc[order[k % order.length].i] += 1;
    remainder--;
    k++;
  }
  return alloc;
}

export function estimateCampaignCost(input: {
  channel: string;
  audienceSize: number;
  variants: VariantForEstimate[];
  overrides?: Partial<Record<string, number>>;
}): CampaignCostEstimate {
  const channel = input.channel || "desconhecido";
  const audienceSize = Math.max(Math.trunc(Number(input.audienceSize) || 0), 0);
  const unitCost = unitCostFor(channel, input.overrides);
  const variants = input.variants ?? [];
  const alloc = allocateRecipients(
    audienceSize,
    variants.map((v) => v.split_percent),
  );

  let totalSegments = 0;
  const lines: VariantCostLine[] = variants.map((v, i) => {
    const recipients = alloc[i] ?? 0;
    const segmentsPerMessage = segmentsFor(channel, v.body);
    const segments = recipients * segmentsPerMessage;
    totalSegments += segments;
    return {
      label: v.label,
      recipients,
      segmentsPerMessage,
      segments,
      cost: round4(segments * unitCost),
    };
  });

  const totalCost = round2(totalSegments * unitCost);
  return {
    channel,
    audienceSize,
    unitCost,
    totalSegments,
    totalCost,
    costPerContact: audienceSize > 0 ? round4(totalCost / audienceSize) : 0,
    variants: lines,
  };
}

export type PreflightVerdict = "ok" | "warning" | "blocked";

export interface CostPreflight {
  verdict: PreflightVerdict;
  estimate: CampaignCostEstimate;
  /** Saldo diário restante do canal; `null` quando não há teto configurado. */
  remainingToday: number | null;
  /** Saldo mensal restante; `null` quando não há teto configurado. */
  remainingMonth: number | null;
  /** Percentual do saldo diário que o lançamento consome; `null` sem teto. */
  consumesDailyPct: number | null;
  reasons: string[];
}

export interface BudgetStateForPreflight {
  channel: string;
  status: "ok" | "warning" | "exhausted" | "disabled";
  spentToday: number;
  spentMonth: number;
  dailyLimit: number;
  monthlyLimit: number;
  reason?: string | null;
}

/**
 * Cruza a estimativa com o guardrail de orçamento.
 *
 * Precedência:
 *  1. canal desativado/esgotado → `blocked` (nem adianta lançar; o worker adia)
 *  2. estimativa maior que o saldo diário ou mensal → `blocked`
 *  3. estimativa consome ≥ 80% do saldo diário → `warning`
 *  4. audiência vazia → `blocked` (nada a estimar)
 *
 * Sem teto configurado o veredito é `ok`: fail-open coerente com o guardrail.
 */
export function evaluateCostPreflight(
  estimate: CampaignCostEstimate,
  budget: BudgetStateForPreflight | null | undefined,
): CostPreflight {
  const reasons: string[] = [];
  let verdict: PreflightVerdict = "ok";

  const dailyLimit = Number(budget?.dailyLimit) > 0 ? Number(budget?.dailyLimit) : 0;
  const monthlyLimit = Number(budget?.monthlyLimit) > 0 ? Number(budget?.monthlyLimit) : 0;
  const remainingToday =
    dailyLimit > 0 ? round2(Math.max(dailyLimit - (budget?.spentToday ?? 0), 0)) : null;
  const remainingMonth =
    monthlyLimit > 0 ? round2(Math.max(monthlyLimit - (budget?.spentMonth ?? 0), 0)) : null;
  const consumesDailyPct =
    remainingToday !== null && remainingToday > 0
      ? round2((estimate.totalCost / remainingToday) * 100)
      : remainingToday === 0
        ? 100
        : null;

  if (estimate.audienceSize === 0) {
    return {
      verdict: "blocked",
      estimate,
      remainingToday,
      remainingMonth,
      consumesDailyPct,
      reasons: ["Audiência vazia — nada a estimar."],
    };
  }

  if (budget?.status === "disabled") {
    verdict = "blocked";
    reasons.push(`Canal ${estimate.channel} está desativado no guardrail de orçamento.`);
  } else if (budget?.status === "exhausted") {
    verdict = "blocked";
    reasons.push(budget.reason ?? `Orçamento do canal ${estimate.channel} já está esgotado.`);
  }

  if (verdict !== "blocked" && remainingToday !== null && estimate.totalCost > remainingToday) {
    verdict = "blocked";
    reasons.push(
      `Custo estimado R$ ${estimate.totalCost.toFixed(2)} excede o saldo diário de R$ ${remainingToday.toFixed(2)}.`,
    );
  }
  if (verdict !== "blocked" && remainingMonth !== null && estimate.totalCost > remainingMonth) {
    verdict = "blocked";
    reasons.push(
      `Custo estimado R$ ${estimate.totalCost.toFixed(2)} excede o saldo mensal de R$ ${remainingMonth.toFixed(2)}.`,
    );
  }
  if (verdict === "ok" && consumesDailyPct !== null && consumesDailyPct >= 80) {
    verdict = "warning";
    reasons.push(
      `O lançamento consome ${consumesDailyPct.toFixed(1)}% do saldo diário restante do canal.`,
    );
  }

  return { verdict, estimate, remainingToday, remainingMonth, consumesDailyPct, reasons };
}
