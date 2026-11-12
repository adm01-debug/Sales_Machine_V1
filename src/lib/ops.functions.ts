import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { summarizeSpend, type SpendRow } from "@/lib/cost-model";
import type { Tables } from "@/integrations/supabase/types";
import type { ReallocationPlan, ReallocationTransfer } from "@/lib/budget-reallocation";

/**
 * Saúde do pipeline: estados agregados de envios e métricas de 24h/7d.
 */
export const getPipelineHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Busca agregada de estados reais da tabela campaign_sends.
    const { data: states, error } = await context.supabase.from("campaign_sends").select("state");

    if (error) throw new Error(error.message);

    const counts = (states ?? []).reduce((acc: Record<string, number>, s) => {
      acc[s.state] = (acc[s.state] ?? 0) + 1;
      return acc;
    }, {});

    const since24h = new Date(Date.now() - 86400_000).toISOString();
    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();

    const [sent24, replies24, optOuts7] = await Promise.all([
      context.supabase
        .from("contact_touchpoints")
        .select("id", { count: "exact", head: true })
        .eq("direction", "outbound")
        .gte("created_at", since24h),
      context.supabase
        .from("contact_touchpoints")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .gte("created_at", since24h),
      context.supabase
        .from("consent_ledger")
        .select("id", { count: "exact", head: true })
        .eq("status", "opted_out")
        .gte("created_at", since7d),
    ]);

    return {
      queued: counts.queued ?? 0,
      running: counts.running ?? 0,
      replied: counts.replied ?? 0,
      paused: counts.paused ?? 0,
      completed: counts.completed ?? 0,
      stopped: counts.stopped ?? 0,
      lost: counts.lost ?? 0,
      dead_letter: counts.dead_letter ?? 0,
      sent_24h: sent24.count ?? 0,
      replies_24h: replies24.count ?? 0,
      opt_outs_7d: optOuts7.count ?? 0,
      refreshed_at: new Date().toISOString(),
    };
  });

/**
 * Métricas de entregabilidade de e-mail dos últimos 7 dias.
 */
export const getDeliverabilityStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data, error } = await context.supabase
      .from("contact_touchpoints")
      .select("status, payload")
      .eq("channel", "email")
      .gte("created_at", since7d);

    if (error) throw new Error(error.message);

    const stats = { opened: 0, clicked: 0, hard_bounce: 0, complaint: 0 };
    for (const row of data ?? []) {
      const payload = row.payload as { opened?: unknown; clicked?: unknown } | null;
      if (payload?.opened) stats.opened++;
      if (payload?.clicked) stats.clicked++;
      // Usar comparação de string direta já que o enum TS é mais restrito que os dados reais possíveis.
      const status = row.status as string;
      if (status === "bounced") stats.hard_bounce++;
      if (status === "complaint") stats.complaint++;
    }
    return stats;
  });

/**
 * Notificações de alerta enviadas (Mock por enquanto).
 */
export const getAlertNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return [] as Tables<"ops_alert_notifications">[];
  });

/**
 * Estatísticas de conformidade e consentimento.
 */
export const getComplianceStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
    const [blocked, optIns, optOuts, channelStats] = await Promise.all([
      context.supabase
        .from("compliance_violations_log")
        .select("id", { count: "exact", head: true })
        .eq("severity", "error")
        .gte("created_at", since7d),
      context.supabase
        .from("consent_ledger")
        .select("id", { count: "exact", head: true })
        .eq("status", "opted_in")
        .gte("created_at", since7d),
      context.supabase
        .from("consent_ledger")
        .select("id", { count: "exact", head: true })
        .eq("status", "opted_out")
        .gte("created_at", since7d),
      context.supabase
        .from("consent_ledger")
        .select("channel")
        .eq("status", "opted_out")
        .gte("created_at", since7d),
    ]);

    const optOutsByChannel: Record<string, number> = {};
    for (const row of channelStats.data ?? []) {
      optOutsByChannel[row.channel] = (optOutsByChannel[row.channel] ?? 0) + 1;
    }

    return {
      blockedByConsent: blocked.count ?? 0,
      optIns7d: optIns.count ?? 0,
      optOuts7d: optOuts.count ?? 0,
      optOutsByChannel,
    };
  });

/**
 * Recuperação de alvos em dead-letter.
 */
export const requeueDeadLetterTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: targets, error: fetchErr } = await context.supabase
      .from("campaign_sends")
      .select("campaign_id, entity_id")
      .eq("state", "dead_letter")
      .limit(100);

    if (fetchErr) throw new Error(fetchErr.message);
    if (!targets?.length) return { requeued: 0 };

    const { error: updErr } = await context.supabase
      .from("campaign_sends")
      .update({ state: "queued", next_run_at: new Date().toISOString(), attempts: 0 })
      .in(
        "entity_id",
        targets.map((t) => t.entity_id),
      );

    if (updErr) throw new Error(updErr.message);
    return { requeued: targets.length };
  });

/**
 * Relatório de orçamento diário e mensal por canal.
 */
export const getBudgetReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("channel_budgets")
      .select("*")
      .order("channel");

    if (error) throw new Error(error.message);

    const states = (data ?? []).map((b) => ({
      channel: b.channel,
      status: b.enabled ? ("ok" as const) : ("disabled" as const),
      dailyLimit: b.daily_limit_brl,
      monthlyLimit: b.monthly_limit_brl,
      spentToday: 0,
      spentMonth: 0,
      usageRate: 0,
      remainingToday: b.daily_limit_brl,
      blocked: !b.enabled,
      reason: b.note,
    }));

    return {
      totalSpentToday: 0,
      totalDailyLimit: states.reduce((acc, s) => acc + s.dailyLimit, 0),
      scannedRows: 0,
      truncated: false,
      states,
    };
  });

/**
 * Quebra de gastos detalhada para o gráfico de impacto financeiro.
 */
export const getSpendBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ days: z.number() }).parse(input))
  .handler(async ({ data: { days }, context }) => {
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const { data, error } = await context.supabase
      .from("contact_touchpoints")
      .select("channel, status")
      .gte("created_at", since);

    if (error) throw new Error(error.message);

    const spendRows: SpendRow[] = (data ?? []).map((r) => ({
      channel: r.channel,
      status: r.status,
      count: 1,
    }));

    const summary = summarizeSpend(spendRows);
    return {
      ...summary,
      scannedRows: spendRows.length,
      days,
      truncated: false,
    };
  });

/**
 * Atualiza configurações de orçamento de um canal.
 */
export const updateChannelBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        channel: z.string(),
        dailyLimit: z.number(),
        monthlyLimit: z.number(),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("channel_budgets").upsert(
      {
        channel: data.channel,
        daily_limit_brl: data.dailyLimit,
        monthly_limit_brl: data.monthlyLimit,
        enabled: data.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel" },
    );

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Aplica o plano de realocação de saldo (Mock).
 */
export const applyBudgetReallocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { applied: 0, plan: { movedTotal: 0 } };
  });

/**
 * Histórico de realocações.
 */
export const getBudgetReallocationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("budget_reallocations")
      .select("*")
      .order("applied_at", { ascending: false })
      .limit(10);

    if (error) throw new Error(error.message);

    return (data ?? []).map((r) => ({
      id: r.id,
      appliedAt: r.applied_at,
      movedTotal: r.moved_total_brl,
      channelsChanged: r.channels_changed,
      transfers: (Array.isArray(r.transfers)
        ? r.transfers
        : []) as unknown as ReallocationTransfer[],
    }));
  });

/**
 * Simula um plano de realocação (Mock).
 */
export const getBudgetReallocationPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<ReallocationPlan> => {
    return {
      transfers: [],
      totalBefore: 0,
      totalAfter: 0,
      movedTotal: 0,
      changes: [],
      unmet: [],
    };
  });

/**
 * Lista intervenções manuais para auditoria.
 */
export const getManualInterventions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        days: z.number().nullable(),
        targetId: z.string().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("campaign_target_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (data.days) {
      const since = new Date(Date.now() - data.days * 86400_000).toISOString();
      query = query.gte("created_at", since);
    }
    if (data.targetId) {
      query = query.ilike("target_id", `${data.targetId}%`);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Exporta intervenções manuais em formato CSV.
 */
export const exportManualInterventions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        days: z.number().nullable(),
        targetId: z.string().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("campaign_target_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (data.days) {
      const since = new Date(Date.now() - data.days * 86400_000).toISOString();
      query = query.gte("created_at", since);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], truncated: (rows?.length ?? 0) >= 5000 };
  });

/**
 * Lista logs de violações de conformidade (Melhoria 036).
 */
export const listComplianceViolations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("compliance_violations_log")
      .select(
        `
        *,
        marketing_campaigns(name)
      `,
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Busca estatísticas de ROI por canal (Melhoria 037).
 */
export const getChannelROI = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ days: z.number() }).parse(input))
  .handler(async ({ data: { days }, context }) => {
    // Tenta atualizar as estatísticas primeiro
    await context.supabase.rpc("fn_refresh_roi_stats", { _days: days });

    const since = new Date(Date.now() - days * 86400_000).toISOString().split("T")[0];

    const { data, error } = await context.supabase
      .from("channel_roi_stats")
      .select("*")
      .gte("date", since)
      .order("conversion_rate", { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  });
