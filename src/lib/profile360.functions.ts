import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  computeReplyPriority,
  summarizeLeadSentiment,
  type LeadSentimentSummary,
  type ReplyPriority,
} from "@/lib/sentiment";

/** Lista a base unificada de contatos/contas com métricas 360. */
export const listContactProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().max(120).optional(),
        kind: z.enum(["company", "person"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("v_contact_profiles")
      .select(
        "entity_id, display_name, kind, signal_score, touchpoint_count, inbound_count, last_touch_at, audience_count",
      )
      .order("signal_score", { ascending: false })
      .limit(data.limit ?? 60);
    if (data.kind) query = query.eq("kind", data.kind);
    if (data.search?.trim()) query = query.ilike("display_name", `%${data.search.trim()}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const profiles = rows ?? [];
    const ids = profiles.map((p) => p.entity_id).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return [];

    // Respostas inbound recentes alimentam o sentimento por lead.
    const { data: inbound } = await context.supabase
      .from("contact_touchpoints")
      .select("entity_id, payload, created_at")
      .in("entity_id", ids)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1000);

    const byEntity = new Map<string, string[]>();
    for (const tp of inbound ?? []) {
      if (!tp.entity_id) continue;
      const payload = tp.payload as Record<string, unknown> | null;
      const text = String(payload?.["content"] ?? payload?.["body"] ?? payload?.["text"] ?? "");
      const list = byEntity.get(tp.entity_id) ?? [];
      list.push(text);
      byEntity.set(tp.entity_id, list);
    }

    return profiles.map((p) => {
      const sentiment: LeadSentimentSummary = summarizeLeadSentiment(
        byEntity.get(p.entity_id ?? "") ?? [],
      );
      const { priority, probability, label } = computeReplyPriority(
        Number(p.signal_score ?? 0),
        sentiment,
      );
      return {
        ...p,
        sentiment,
        reply_priority: priority as ReplyPriority,
        reply_probability: probability,
        reply_priority_label: label,
      };
    });
  });

/** Ficha 360 consolidada de uma entidade. */
export const getContactProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entity_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase
      .from("v_contact_profiles")
      .select("*")
      .eq("entity_id", data.entity_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Contato não encontrado");

    const [touchRes, consentRes, audienceRes, sendRes, trackRes] = await Promise.all([
      context.supabase
        .from("contact_touchpoints")
        .select("id, channel, direction, status, created_at, payload, error")
        .eq("entity_id", data.entity_id)
        .order("created_at", { ascending: false })
        .limit(25),
      context.supabase
        .from("consent_ledger")
        .select("channel, status, source, reason, created_at")
        .eq("entity_id", data.entity_id)
        .order("created_at", { ascending: false })
        .limit(20),
      context.supabase
        .from("audience_members")
        .select("audience_id, audiences(name)")
        .eq("entity_id", data.entity_id)
        .limit(20),
      context.supabase
        .from("campaign_sends")
        .select("id, state, sent_at, marketing_campaigns(name, channel)")
        .eq("entity_id", data.entity_id)
        .order("created_at", { ascending: false })
        .limit(20),
      // Eventos de tracking de e-mail (FUXICO e provedores internos)
      context.supabase
        .from("email_deliverability_events")
        .select("id, event_type, provider, created_at, raw")
        .eq("entity_id", data.entity_id)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    return {
      profile,
      touchpoints: touchRes.data ?? [],
      consent: consentRes.data ?? [],
      audiences: audienceRes.data ?? [],
      campaign_sends: sendRes.data ?? [],
      tracking_events: trackRes.data ?? [],
    };
  });
