/**
 * Lógica de recuperação operacional isolada do wrapper `createServerFn`.
 *
 * Motivo: módulos que declaram server functions são divididos pelo plugin
 * `tss-serverfn-split`; helpers irmãos somem em runtime. Além disso, isolar
 * aqui permite testar o comportamento contra um client fake.
 */

/** Limite defensivo: reprocessa em lotes, nunca a fila inteira de uma vez. */
export const DEAD_LETTER_REQUEUE_LIMIT = 100;

/** Subset estrutural do client PostgREST usado por esta rotina. */
import type { TableClient } from "./table-client";

export type RequeueClient = TableClient;

/**
 * Recoloca alvos em `dead_letter` de volta na fila, dos mais antigos para os
 * mais recentes (servido pelo índice parcial `idx_campaign_targets_dead_letter_recovery`).
 *
 * Zeramos `attempts` (o backoff já cumpriu seu propósito), liberamos o lock e
 * agendamos para agora. O update é filtrado novamente por `state='dead_letter'`
 * para ser idempotente sob concorrência: se outro operador clicar ao mesmo
 * tempo, o segundo update não ressuscita alvos que já voltaram a rodar.
 */
export async function requeueDeadLetter(
  client: RequeueClient,
  limit: number = DEAD_LETTER_REQUEUE_LIMIT,
  actor = "operator",
): Promise<{ requeued: number }> {
  const { data: candidates, error: readErr } = await client
    .from("campaign_targets")
    .select("id")
    .eq("state", "dead_letter")
    .order("last_transition_at", { ascending: true })
    .limit(limit);
  if (readErr) throw new Error(readErr.message);

  const ids = (candidates ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return { requeued: 0 };

  const { error: updErr } = await client
    .from("campaign_targets")
    .update({
      state: "queued",
      attempts: 0,
      locked_until: null,
      last_error: null,
      next_run_at: new Date().toISOString(),
    })
    .eq("state", "dead_letter")
    .in("id", ids);
  if (updErr) throw new Error(updErr.message);

  // Trilha de auditoria: a transição dead_letter -> queued é uma intervenção
  // humana, então é registrada com o ator real em vez de 'system'. Falha aqui
  // não desfaz o requeue (os alvos já voltaram à fila); apenas não silenciamos
  // o erro no log do worker.
  const { error: auditErr } = await client.from("campaign_target_events").insert(
    ids.map((id: string) => ({
      target_id: id,
      from_state: "dead_letter",
      to_state: "queued",
      reason: "manual_requeue",
      actor,
      payload: { batch_size: ids.length },
    })),
  );
  if (auditErr) console.error("[ops-recovery] falha ao registrar auditoria:", auditErr.message);

  return { requeued: ids.length };
}
