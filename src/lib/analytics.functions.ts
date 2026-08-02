import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildChannelBreakdown,
  buildCampaignChannelBreakdown,
  buildCampaignStages,
  buildDailySeries,
  buildFunnel,
  buildTotals,
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
    const previousSince = new Date(Date.now() - days * 2 * 86400_000).toISOString();

    const [touchRes, prevTouchRes, sendsRes, campaignsRes] = await Promise.all([
      context.supabase
        .from("contact_touchpoints")
        .select("channel, direction, status, created_at")
        .gte("created_at", since)
        .limit(20000),
      context.supabase
        .from("contact_touchpoints")
        .select("channel, direction, status, created_at")
        .gte("created_at", previousSince)
        .lt("created_at", since)
        .limit(20000),
      context.supabase.from("campaign_sends").select("state, campaign_id"),
      context.supabase.from("marketing_campaigns").select("id, name, status, channel"),
    ]);

    const rows = (touchRes.data ?? []) as TouchpointRow[];
    const prevRows = (prevTouchRes.data ?? []) as TouchpointRow[];

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
      totals: buildTotals(rows),
      previous_totals: buildTotals(prevRows),
      previous_channels: buildChannelBreakdown(prevRows),
      funnel: buildFunnel(states),
      states,
      campaigns,
    };
  });

/**
 * Drill-down de uma campanha: métricas por canal, por etapa e por variante.
 * Usa campaign_sends como espinha dorsal e resolve os touchpoints relacionados.
 */
export const getCampaignDrilldown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campaignId: z.string().uuid() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { campaignId } = data;

    const [campaignRes, sendsRes, variantsRes] = await Promise.all([
      context.supabase
        .from("marketing_campaigns")
        .select("id, name, objective, status, channel, created_at")
        .eq("id", campaignId)
        .maybeSingle(),
      context.supabase
        .from("campaign_sends")
        .select("state, variant_id, touchpoint_id, attempts, last_error")
        .eq("campaign_id", campaignId)
        .limit(20000),
      context.supabase
        .from("campaign_variants")
        .select("id, label, split_percent")
        .eq("campaign_id", campaignId),
    ]);

    const sends = sendsRes.data ?? [];
    const states: Record<string, number> = {};
    const byVariant: Record<string, { sends: number; failed: number }> = {};
    const touchpointIds: string[] = [];

    for (const s of sends) {
      states[s.state] = (states[s.state] ?? 0) + 1;
      const key = s.variant_id ?? "__default";
      const v = byVariant[key] ?? { sends: 0, failed: 0 };
      v.sends += 1;
      if (s.state === "failed" || s.state === "dead_letter") v.failed += 1;
      byVariant[key] = v;
      if (s.touchpoint_id) touchpointIds.push(s.touchpoint_id);
    }

    // Resolve os touchpoints em lotes para não estourar o limite da query string.
    const touchpoints: { channel: string; status: string; direction: string }[] = [];
    const CHUNK = 200;
    for (let i = 0; i < touchpointIds.length && i < 4000; i += CHUNK) {
      const chunk = touchpointIds.slice(i, i + CHUNK);
      const res = await context.supabase
        .from("contact_touchpoints")
        .select("channel, status, direction")
        .in("id", chunk);
      if (res.data) touchpoints.push(...res.data);
    }

    const variantLabels = new Map(
      (variantsRes.data ?? []).map((v) => [v.id, v.label] as const),
    );

    const errors: Record<string, number> = {};
    for (const s of sends) {
      if (!s.last_error) continue;
      const key = s.last_error.slice(0, 80);
      errors[key] = (errors[key] ?? 0) + 1;
    }

    return {
      campaign: campaignRes.data ?? null,
      total_sends: sends.length,
      states,
      stages: buildCampaignStages(states),
      channels: buildCampaignChannelBreakdown(touchpoints),
      variants: Object.entries(byVariant)
        .map(([id, v]) => ({
          id,
          label: id === "__default" ? "Sem variante" : (variantLabels.get(id) ?? "Variante"),
          sends: v.sends,
          failed: v.failed,
        }))
        .sort((a, b) => b.sends - a.sends),
      top_errors: Object.entries(errors)
        .map(([message, count]) => ({ message, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  });