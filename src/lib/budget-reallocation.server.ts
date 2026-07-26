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
  return { applied, plan };
}
