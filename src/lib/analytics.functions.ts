import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildChannelBreakdown,
  buildDailySeries,
  buildFunnel,
  type TouchpointRow,
} from "@/lib/analytics-aggregate";

/** Séries e distribuições que alimentam os gráficos do painel de resultados. */
export const getAnalyticsCharts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ days: z.number().int().min(7).max(90).default(30) })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const days = data.days;
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    const [touchRes, sendsRes, campaignsRes] = await Promise.all([
      context.supabase
        .from("contact_touchpoints")
        .select("channel, direction, status, created_at")
        .gte("created_at", since)
        .limit(20000),
      context.supabase.from("campaign_sends").select("state, campaign_id"),
      context.supabase.from("marketing_campaigns").select("id, name, status, channel"),
    ]);

    const rows = (touchRes.data ?? []) as TouchpointRow[];

    const states: Record<string, number> = {};
    const sendsByCampaign: Record<string, number> = {};
    for (const s of sendsRes.data ?? []) {
      states[s.state] = (states[s.state] ?? 0) + 1;
      sendsByCampaign[s.campaign_id] = (sendsByCampaign[s.campaign_id] ?? 0) + 1;
    }

    const campaigns = (campaignsRes.data ?? [])
      .map((c) => ({ ...c, sends: sendsByCampaign[c.id] ?? 0 }))
      .sort((a, b) => b.sends - a.sends)
      .slice(0, 6);

    return {
      days,
      daily: buildDailySeries(rows, days),
      channels: buildChannelBreakdown(rows),
      funnel: buildFunnel(states),
      states,
      campaigns,
    };
  });
