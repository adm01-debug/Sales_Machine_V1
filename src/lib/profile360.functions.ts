import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    return rows ?? [];
  });

/** Ficha 360 consolidada de uma entidade. */
export const getContactProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entity_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase
      .from("v_contact_profiles")
      .select("*")
      .eq("entity_id", data.entity_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Contato não encontrado");

    const [touchRes, consentRes, audienceRes, sendRes] = await Promise.all([
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
    ]);

    return {
      profile,
      touchpoints: touchRes.data ?? [],
      consent: consentRes.data ?? [],
      audiences: audienceRes.data ?? [],
      campaign_sends: sendRes.data ?? [],
    };
  });