import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPipelineHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Refresh + read
    await context.supabase.rpc("refresh_pipeline_health");
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

    const { data: blockedRows, error: blockedErr } = await context.supabase
      .from("campaign_targets")
      .select("id")
      .eq("state", "stopped")
      .ilike("last_error", "%consentimento%");
    if (blockedErr) throw new Error(blockedErr.message);

    const { data: skippedRows, error: skippedErr } = await context.supabase
      .from("campaign_sends")
      .select("id")
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
      blockedByConsent: (blockedRows?.length ?? 0) + (skippedRows?.length ?? 0),
      optIns7d: optIns,
      optOuts7d: Object.values(optOutsByChannel).reduce((a, b) => a + b, 0),
      optOutsByChannel,
    };
  });