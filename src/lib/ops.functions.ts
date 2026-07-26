import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Leitura da materialized view de saúde do pipeline.
 *
 * IMPORTANTE: o REFRESH não acontece aqui. `refresh_pipeline_health()` é uma
 * função privilegiada (EXECUTE apenas para service_role) chamada pela varredura
 * automática `alert-sweep` a cada 15 minutos. Isso evita que cada operador
 * abrindo o painel dispare um REFRESH pesado e concorrente na view.
 */
export const getPipelineHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("v_pipeline_health" as never)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as {
      queued: number; running: number; paused: number; replied: number;
      stopped: number; completed: number; dead_letter: number; lost: number;
      total: number; sent_24h: number; replies_24h: number; opt_outs_7d: number;
      refreshed_at: string;
    } | null;
  });

export const getDeliverabilityStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data } = await context.supabase
      .from("email_deliverability_events")
      .select("event_type, created_at")
      .gte("created_at", since);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) counts[row.event_type] = (counts[row.event_type] ?? 0) + 1;
    return counts;
  });

/**
 * Histórico das notificações de alerta disparadas pela varredura automática.
 * Mostra o que já foi avisado (e quando) para evitar dúvida do operador
 * sobre "isso já foi comunicado ao time?".
 */
export const getAlertNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ops_alert_notifications")
      .select("id, alert_id, level, title, detail, first_notified_at, last_notified_at, occurrences, resolved_at")
      .order("last_notified_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Métricas de compliance da cadência 1:1: quantos alvos o worker interrompeu
 * por falta de consentimento (LGPD) e quantos opt-outs entraram por canal.
 * Serve como prova auditável de que o gate de consentimento está ativo.
 */
export const getComplianceStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

    // Contagens via `head: true`: o servidor devolve só o total, sem trafegar linhas.
    const { count: blockedCount, error: blockedErr } = await context.supabase
      .from("campaign_targets")
      .select("id", { count: "exact", head: true })
      .eq("state", "stopped")
      .ilike("last_error", "%consentimento%");
    if (blockedErr) throw new Error(blockedErr.message);

    const { count: skippedCount, error: skippedErr } = await context.supabase
      .from("campaign_sends")
      .select("id", { count: "exact", head: true })
      .eq("state", "skipped")
      .ilike("last_error", "%opt-out%");
    if (skippedErr) throw new Error(skippedErr.message);

    const { data: consentRows, error: consentErr } = await context.supabase
      .from("consent_ledger")
      .select("channel, status, created_at")
      .gte("created_at", since);
    if (consentErr) throw new Error(consentErr.message);

    const optOutsByChannel: Record<string, number> = {};
    let optIns = 0;
    for (const row of consentRows ?? []) {
      if (row.status === "opt_in") {
        optIns++;
        continue;
      }
      const channel = row.channel ?? "desconhecido";
      optOutsByChannel[channel] = (optOutsByChannel[channel] ?? 0) + 1;
    }

    return {
      blockedByConsent: (blockedCount ?? 0) + (skippedCount ?? 0),
      optIns7d: optIns,
      optOuts7d: Object.values(optOutsByChannel).reduce((a, b) => a + b, 0),
      optOutsByChannel,
    };
  });

/** Limite defensivo: reprocessa em lotes, nunca a fila inteira de uma vez. */
export const DEAD_LETTER_REQUEUE_LIMIT = 100;

/**
 * Recoloca alvos em `dead_letter` de volta na fila.
 *
 * Sem isso o operador não tem caminho de recuperação: um pico de indisponibilidade
 * do canal enterra os alvos permanentemente. Zeramos `attempts` (o backoff já
 * expirou seu propósito), liberamos o lock e agendamos para agora.
 */
export const requeueDeadLetterTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: candidates, error: readErr } = await context.supabase
      .from("campaign_targets")
      .select("id")
      .eq("state", "dead_letter")
      .order("last_transition_at", { ascending: true })
      .limit(DEAD_LETTER_REQUEUE_LIMIT);
    if (readErr) throw new Error(readErr.message);

    const ids = (candidates ?? []).map((r) => r.id);
    if (ids.length === 0) return { requeued: 0 };

    const { error: updErr } = await context.supabase
      .from("campaign_targets")
      .update({
        state: "queued",
        attempts: 0,
        locked_until: null,
        last_error: null,
        next_run_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (updErr) throw new Error(updErr.message);

    return { requeued: ids.length };
  });