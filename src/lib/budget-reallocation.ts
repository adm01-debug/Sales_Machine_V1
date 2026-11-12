/**
 * Melhoria 023 — Realocação automática de saldo entre canais.
 *
 * Problema observado na simulação de cenários: com tetos fixos por canal, é
 * comum o WhatsApp bloquear às 14h enquanto SMS e e-mail terminam o dia com
 * 70% do teto ocioso. O orçamento agregado do dia sobrou, mas o pipeline parou.
 *
 * Este módulo é *lógica pura* (sem banco) e resolve isso propondo transferências
 * de teto diário de canais ociosos (doadores) para canais saturados (receptores),
 * mantendo a soma dos tetos diários **constante** — nunca aumenta o gasto máximo
 * autorizado, apenas redistribui.
 *
 * Invariantes de segurança (todos cobertos por teste):
 *  1. Soma dos tetos diários após o plano == soma antes (tolerância de 1 centavo).
 *  2. Nenhum doador fica com teto abaixo do que já gastou hoje somado à margem
 *     de segurança — realocar não pode bloquear quem estava saudável.
 *  3. Canais desativados manualmente não doam nem recebem.
 *  4. Canais sem teto configurado (limite 0) ficam fora dos dois lados: não têm
 *     saldo a doar e não sofrem bloqueio por teto.
 *  5. Bloqueio por teto **mensal** não é resolvido aqui — mexer no teto diário
 *     não destrava o mês; esses canais são reportados como não elegíveis.
 */

import type { ChannelBudgetState } from "./budget-guard";

/** Fração do teto abaixo da qual um canal é considerado ocioso e pode doar. */
export const DONOR_MAX_USAGE = 0.5;
/** Margem preservada no doador: teto final >= gasto de hoje / este fator. */
export const DONOR_SAFETY_USAGE = 0.7;
/** Alvo de folga do receptor: teto final = gasto de hoje / este fator. */
export const RECEIVER_TARGET_USAGE = 0.75;
/** Transferências abaixo deste valor (BRL) são ruído e são descartadas. */
export const MIN_TRANSFER_BRL = 1;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ReallocationTransfer {
  from: string;
  to: string;
  amount: number;
}

export interface ReallocationChange {
  channel: string;
  currentDailyLimit: number;
  proposedDailyLimit: number;
  delta: number;
  role: "donor" | "receiver";
}

export interface ReallocationPlan {
  transfers: ReallocationTransfer[];
  changes: ReallocationChange[];
  /** Total movimentado em BRL. */
  movedTotal: number;
  /** Canais que precisavam de saldo mas não puderam ser atendidos. */
  unmet: Array<{ channel: string; missing: number; reason: string }>;
  /** Soma dos tetos diários antes e depois — devem ser iguais. */
  totalBefore: number;
  totalAfter: number;
}

interface Donor {
  channel: string;
  limit: number;
  available: number;
}

interface Receiver {
  channel: string;
  limit: number;
  need: number;
}

function classify(states: ChannelBudgetState[]): {
  donors: Donor[];
  receivers: Receiver[];
  unmet: ReallocationPlan["unmet"];
} {
  const donors: Donor[] = [];
  const receivers: Receiver[] = [];
  const unmet: ReallocationPlan["unmet"] = [];

  for (const s of states) {
    const limit = Number(s.dailyLimit) || 0;
    if (s.status === "disabled") continue; // invariante 3
    if (limit <= 0) continue; // invariante 4

    const monthlyBlocked = s.monthlyLimit > 0 && s.spentMonth >= s.monthlyLimit; // invariante 5
    const needsMore = s.status === "exhausted" || (s.usageRate ?? 0) >= 80;

    if (needsMore) {
      if (monthlyBlocked) {
        unmet.push({
          channel: s.channel,
          missing: 0,
          reason: "bloqueio mensal — teto diário não resolve",
        });
        continue;
      }
      const target = s.spentToday / RECEIVER_TARGET_USAGE;
      const need = round2(Math.max(target - limit, 0));
      if (need >= MIN_TRANSFER_BRL) receivers.push({ channel: s.channel, limit, need });
      continue;
    }

    const usage = s.usageRate === null ? 0 : s.usageRate / 100;
    if (usage <= DONOR_MAX_USAGE) {
      const floor = s.spentToday > 0 ? s.spentToday / DONOR_SAFETY_USAGE : 0; // invariante 2
      const available = round2(Math.max(limit - floor, 0));
      if (available >= MIN_TRANSFER_BRL) donors.push({ channel: s.channel, limit, available });
    }
  }

  // Maior necessidade primeiro; maior folga primeiro. Empates pelo nome do
  // canal para tornar o plano determinístico (importante para os testes e
  // para o operador conferir duas execuções seguidas).
  receivers.sort((a, b) => b.need - a.need || a.channel.localeCompare(b.channel));
  donors.sort((a, b) => b.available - a.available || a.channel.localeCompare(b.channel));

  return { donors, receivers, unmet };
}

/**
 * Monta o plano de realocação. Não executa nada: quem aplica é a camada
 * `budget-reallocation.server.ts`, sempre com confirmação do operador.
 */
export function planReallocation(states: ChannelBudgetState[]): ReallocationPlan {
  const list = Array.isArray(states) ? states : [];
  const totalBefore = round2(list.reduce((acc, s) => acc + (Number(s.dailyLimit) || 0), 0));
  const { donors, receivers, unmet } = classify(list);

  const transfers: ReallocationTransfer[] = [];
  const deltas = new Map<string, number>();
  const limits = new Map<string, number>(list.map((s) => [s.channel, Number(s.dailyLimit) || 0]));
  const roles = new Map<string, "donor" | "receiver">();

  for (const receiver of receivers) {
    let remaining = receiver.need;
    for (const donor of donors) {
      if (remaining < MIN_TRANSFER_BRL) break;
      if (donor.available < MIN_TRANSFER_BRL) continue;
      const amount = round2(Math.min(donor.available, remaining));
      if (amount < MIN_TRANSFER_BRL) continue;

      donor.available = round2(donor.available - amount);
      remaining = round2(remaining - amount);
      transfers.push({ from: donor.channel, to: receiver.channel, amount });
      deltas.set(donor.channel, round2((deltas.get(donor.channel) ?? 0) - amount));
      deltas.set(receiver.channel, round2((deltas.get(receiver.channel) ?? 0) + amount));
      roles.set(donor.channel, "donor");
      roles.set(receiver.channel, "receiver");
    }
    if (remaining >= MIN_TRANSFER_BRL) {
      unmet.push({
        channel: receiver.channel,
        missing: remaining,
        reason: "sem saldo ocioso suficiente em outros canais",
      });
    }
  }

  const changes: ReallocationChange[] = [...deltas.entries()]
    .filter(([, delta]) => Math.abs(delta) >= 0.01)
    .map(([channel, delta]) => {
      const current = limits.get(channel) ?? 0;
      return {
        channel,
        currentDailyLimit: round2(current),
        proposedDailyLimit: round2(current + delta),
        delta: round2(delta),
        role: roles.get(channel) ?? (delta < 0 ? "donor" : "receiver"),
      };
    })
    .sort((a, b) => b.delta - a.delta || a.channel.localeCompare(b.channel));

  const movedTotal = round2(transfers.reduce((acc, t) => acc + t.amount, 0));
  const totalAfter = round2(totalBefore + changes.reduce((acc, c) => acc + c.delta, 0));

  return { transfers, changes, movedTotal, unmet, totalBefore, totalAfter };
}
