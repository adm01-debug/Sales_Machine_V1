import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPipelineHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Busca agregada de estados reais da tabela campaign_sends.
    const { data: states, error } = await context.supabase
      .from("campaign_sends")
      .select("state");
    
    if (error) throw new Error(error.message);

    const counts = (states ?? []).reduce((acc: Record<string, number>, s) => {
      acc[s.state] = (acc[s.state] ?? 0) + 1;
      return acc;
    }, {});

    const since24h = new Date(Date.now() - 86400_000).toISOString();
    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();

    const [sent24, replies24, optOuts7] = await Promise.all([
      context.supabase.from("contact_touchpoints").select("id", { count: "exact", head: true }).eq("direction", "outbound").gte("created_at", since24h),
      context.supabase.from("contact_touchpoints").select("id", { count: "exact", head: true }).eq("direction", "inbound").gte("created_at", since24h),
      context.supabase.from("consent_ledger").select("id", { count: "exact", head: true }).eq("status", "opted_out").gte("opted_out_at", since7d)
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
      refreshed_at: new Date().toISOString()
    };
  });

export const getDeliverabilityStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data, error } = await context.supabase
      .from("contact_touchpoints")
      .select("status, metadata")
      .eq("channel", "email")
      .gte("created_at", since7d);

    if (error) throw new Error(error.message);

    const stats = { opened: 0, clicked: 0, hard_bounce: 0, complaint: 0 };
    for (const row of data ?? []) {
      const meta = row.metadata as any;
      if (meta?.opened) stats.opened++;
      if (meta?.clicked) stats.clicked++;
      if (row.status === "bounced") stats.hard_bounce++;
      if (row.status === "complaint") stats.complaint++;
    }
    return stats;
  });

export const getAlertNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Mock ou tabela real se existir. Como o sistema é novo, devolvemos vazio para não quebrar.
    return [];
  });

export const getComplianceStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
    const [blocked, optIns, optOuts] = await Promise.all([
      context.supabase.from("compliance_violations_log").select("id", { count: "exact", head: true }).eq("severity", "error").gte("created_at", since7d),
      context.supabase.from("consent_ledger").select("id", { count: "exact", head: true }).eq("status", "opted_in").gte("created_at", since7d),
      context.supabase.from("consent_ledger").select("id", { count: "exact", head: true }).eq("status", "opted_out").gte("opted_out_at", since7d)
    ]);

    return {
      blockedByConsent: blocked.count ?? 0,
      optIns7d: optIns.count ?? 0,
      optOuts7d: optOuts.count ?? 0,
      optOutsByChannel: {}
    };
  });

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
      .in("entity_id", targets.map(t => t.entity_id))
      .in("campaign_id", targets.map(t => t.campaign_id));

    if (updErr) throw new Error(updErr.message);
    return { requeued: targets.length };
  });

export const getBudgetReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return {
      totalSpentToday: 0,
      totalDailyLimit: 0,
      scannedRows: 0,
      truncated: false,
      states: []
    };
  });

export const getSpendBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ days: z.number() }))
  .handler(async ({ data: { days } }) => {
    return {
      totalCost: 0,
      wastedCost: 0,
      wastedRate: 0,
      billableMessages: 0,
      scannedRows: 0,
      days,
      byChannel: []
    };
  });

export const updateChannelBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ channel: z.string(), dailyLimit: z.number(), monthlyLimit: z.number(), enabled: z.boolean() }))
  .handler(async () => ({ ok: true }));

export const applyBudgetReallocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ applied: 0 }));

export const getBudgetReallocationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => []);

export const getBudgetReallocationPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ transfers: [], totalBefore: 0, totalAfter: 0, changes: [], unmet: [] }));

export const getManualInterventions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ days: z.number().nullable(), targetId: z.string().nullable() }))
  .handler(async () => []);

export const exportManualInterventions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ days: z.number().nullable(), targetId: z.string().nullable() }))
  .handler(async () => ({ rows: [], truncated: false }));

export const listComplianceViolations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("compliance_violations_log")
      .select(`
        *,
        marketing_campaigns(name)
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    return data ?? [];
  });
