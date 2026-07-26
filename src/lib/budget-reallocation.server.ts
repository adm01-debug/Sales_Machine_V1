/**
 * Camada de banco da realocação de orçamento (melhoria 023).
 *
 * Mantida fora de `*.functions.ts` porque o split de server functions remove
 * helpers irmãos em runtime, e para permitir teste com client fake.
 */

import { planReallocation, type ReallocationPlan } from "./budget-reallocation";
import { buildBudgetReport, type BudgetClient } from "./budget.server";

export interface ReallocationPreview extends ReallocationPlan {
  generatedAt: string;
}

export interface ReallocationHistoryEntry {
  id: string;
  appliedAt: string;
  actorUserId: string | null;
  movedTotal: number;
  totalBefore: number;
  totalAfter: number;
  channelsChanged: number;
  transfers: ReallocationPlan["transfers"];
  changes: ReallocationPlan["changes"];
  unmet: ReallocationPlan["unmet"];
}

export async function previewReallocation(
  client: BudgetClient,
  now: Date = new Date(),
): Promise<ReallocationPreview> {
  const report = await buildBudgetReport(client, now);
  return { ...planReallocation(report.states), generatedAt: now.toISOString() };
}

/**
 * Aplica o plano recalculado no momento da execução — nunca o plano que o
 * navegador enviou. Isso evita que um preview obsoleto (aberto há uma hora)
 * mova saldo com base em gastos que já mudaram.
 */
export async function applyReallocation(
  client: BudgetClient,
  now: Date = new Date(),
  actorUserId: string | null = null,
): Promise<{ applied: number; plan: ReallocationPreview }> {
  const plan = await previewReallocation(client, now);
  if (plan.changes.length === 0) return { applied: 0, plan };

  let applied = 0;
  for (const change of plan.changes) {
    const { error } = await client
      .from("channel_budgets")
      .update({ daily_limit_brl: change.proposedDailyLimit })
      .eq("channel", change.channel);
    if (error) throw new Error(`Falha ao ajustar ${change.channel}: ${error.message}`);
    applied++;
  }

  // Trilha de auditoria: gravada após os ajustes para nunca registrar uma
  // realocação que falhou no meio. Uma falha aqui não desfaz os tetos já
  // aplicados, então ela é reportada em vez de silenciada.
  const { error: auditError } = await client.from("budget_reallocations").insert({
    actor_user_id: actorUserId,
    moved_total_brl: plan.movedTotal,
    total_before_brl: plan.totalBefore,
    total_after_brl: plan.totalAfter,
    channels_changed: applied,
    transfers: plan.transfers,
    changes: plan.changes,
    unmet: plan.unmet,
  });
  if (auditError) {
    throw new Error(
      `Tetos ajustados (${applied}), mas o registro de auditoria falhou: ${auditError.message}`,
    );
  }

  return { applied, plan };
}

/** Histórico das realocações já aplicadas, da mais recente para a mais antiga. */
export async function listReallocationHistory(
  client: BudgetClient,
  limit = 20,
): Promise<ReallocationHistoryEntry[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 1, 1), 100);
  const { data, error } = await client
    .from("budget_reallocations")
    .select(
      "id, applied_at, actor_user_id, moved_total_brl, total_before_brl, total_after_brl, channels_changed, transfers, changes, unmet",
    )
    .order("applied_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(`Falha ao ler histórico de realocações: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    appliedAt: String(row.applied_at),
    actorUserId: (row.actor_user_id as string | null) ?? null,
    movedTotal: Number(row.moved_total_brl ?? 0),
    totalBefore: Number(row.total_before_brl ?? 0),
    totalAfter: Number(row.total_after_brl ?? 0),
    channelsChanged: Number(row.channels_changed ?? 0),
    transfers: (row.transfers ?? []) as ReallocationPlan["transfers"],
    changes: (row.changes ?? []) as ReallocationPlan["changes"],
    unmet: (row.unmet ?? []) as ReallocationPlan["unmet"],
  }));
}
