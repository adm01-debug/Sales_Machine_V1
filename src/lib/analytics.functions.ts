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
import { diagnoseCampaign } from "./campaign-diagnostics";

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
    z.object({ 
      campaignId: z.string().uuid(),
      days: z.number().int().min(1).max(365).optional().default(30),
      sentimentFilter: z.enum(["all", "positive", "neutral", "negative"]).optional().default("all")
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { campaignId, days, sentimentFilter } = data;
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    const [campaignRes, sendsRes, variantsRes] = await Promise.all([
      context.supabase
        .from("marketing_campaigns")
        .select("id, name, objective, status, channel, created_at")
        .eq("id", campaignId)
        .maybeSingle(),
      context.supabase
        .from("campaign_sends")
        .select("state, variant_id, touchpoint_id, attempts, last_error, created_at")
        .eq("campaign_id", campaignId)
        .gte("created_at", since)
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
    const touchpoints: {
      channel: string;
      status: string;
      direction: string;
      content?: string;
      sentiment?: string;
      created_at?: string;
    }[] = [];
    const CHUNK = 200;
    const positiveWords = /obrigado|gostei|quero|interessante|agendar|marcar|bom|excelente/i;
    const negativeWords = /nao quero|remover|spam|pare|ruim|pessimo|desinscrever/i;

    for (let i = 0; i < touchpointIds.length && i < 4000; i += CHUNK) {
      const chunk = touchpointIds.slice(i, i + CHUNK);
      const res = await context.supabase
        .from("contact_touchpoints")
        .select("channel, status, direction, payload, created_at")
        .in("id", chunk);
      if (res.data) {
        for (const tp of res.data) {
          const content = (tp.payload as any)?.content || (tp.payload as any)?.body || "";
          let sentiment = "neutral";
          if (tp.direction === "inbound") {
            if (positiveWords.test(content)) sentiment = "positive";
            else if (negativeWords.test(content)) sentiment = "negative";
          }
          
          touchpoints.push({
            channel: tp.channel,
            status: tp.status,
            direction: tp.direction,
            content,
            sentiment,
            created_at: tp.created_at,
          });
        }
      }
    }

    // Filtragem de touchpoints baseada em sentimento se solicitado
    let filteredTouchpoints = touchpoints;
    if (sentimentFilter !== "all") {
      // Quando filtramos por sentimento, queremos ver os touchpoints que levaram ou são a resposta desse sentimento
      // Para fins de métricas de funil, filtramos os inbound e mantemos a estrutura
      filteredTouchpoints = touchpoints.filter(t => t.direction === "outbound" || t.sentiment === sentimentFilter);
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

    const stages = buildCampaignStages(states);

    // ---- Tendências de sentimento (série temporal diária + quebra por canal) ----
    const inbound = touchpoints.filter((t) => t.direction === "inbound");

    const dayMap = new Map<string, { positive: number; neutral: number; negative: number }>();
    for (const t of inbound) {
      const day = (t.created_at ?? "").slice(0, 10);
      if (!day) continue;
      const bucket = dayMap.get(day) ?? { positive: 0, neutral: 0, negative: 0 };
      bucket[(t.sentiment ?? "neutral") as "positive" | "neutral" | "negative"] += 1;
      dayMap.set(day, bucket);
    }
    const sentiment_timeline = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => {
        const total = v.positive + v.neutral + v.negative;
        return {
          date,
          ...v,
          total,
          net_score: total > 0 ? Number((((v.positive - v.negative) / total) * 100).toFixed(1)) : 0,
        };
      });

    const channelMap = new Map<string, { positive: number; neutral: number; negative: number }>();
    for (const t of inbound) {
      const bucket = channelMap.get(t.channel) ?? { positive: 0, neutral: 0, negative: 0 };
      bucket[(t.sentiment ?? "neutral") as "positive" | "neutral" | "negative"] += 1;
      channelMap.set(t.channel, bucket);
    }
    const sentiment_by_channel = Array.from(channelMap.entries())
      .map(([channel, v]) => {
        const total = v.positive + v.neutral + v.negative;
        return {
          channel,
          ...v,
          total,
          net_score: total > 0 ? Number((((v.positive - v.negative) / total) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    const topErrors = Object.entries(errors)
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      campaign: campaignRes.data ?? null,
      total_sends: sends.length,
      states,
      stages,
      channels: buildCampaignChannelBreakdown(filteredTouchpoints),
      sentiment_timeline,
      sentiment_by_channel,
      diagnosis: campaignRes.data ? diagnoseCampaign(
        campaignRes.data, 
        topErrors, 
        stages, 
        inbound.map(t => ({ content: t.content || "" }))
      ) : null,
      variants: Object.entries(byVariant)
        .map(([id, v]) => ({
          id,
          label: id === "__default" ? "Sem variante" : (variantLabels.get(id) ?? "Variante"),
          sends: v.sends,
          failed: v.failed,
        }))
        .sort((a, b) => b.sends - a.sends),
      top_errors: topErrors,
    };
  });