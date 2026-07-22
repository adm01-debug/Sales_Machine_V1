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