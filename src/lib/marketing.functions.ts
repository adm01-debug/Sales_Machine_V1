import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHANNELS } from "@/lib/audience-rules";
import { validateCampaign, hasBlockingIssues } from "@/lib/campaign-validation";
import { buildVarValues, extractVariables } from "@/lib/template-vars";

const channelEnum = z.enum(CHANNELS);

const variantSchema = z.object({
  label: z.string().min(1).max(8),
  subject: z.string().max(200).nullish(),
  body: z.string().min(1).max(4000),
  media_url: z.string().url().nullish(),
  rcs_payload: z.record(z.string(), z.unknown()).nullish(),
  split_percent: z.number().int().min(0).max(100),
});

export const listMarketingCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("marketing_campaigns")
      .select(
        "id, name, objective, status, channel, audience_id, scheduled_at, daily_cap, updated_at, audiences(name)",
      )
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMarketingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: campaign, error } = await context.supabase
      .from("marketing_campaigns")
      .select("*, audiences(id, name, member_count)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign) throw new Error("Campanha não encontrada");

    const [variantsRes, sendsRes] = await Promise.all([
      context.supabase
        .from("campaign_variants")
        .select("*")
        .eq("campaign_id", data.id)
        .order("label"),
      context.supabase.from("campaign_sends").select("state, variant_id").eq("campaign_id", data.id),
    ]);

    const byState: Record<string, number> = {};
    const byVariant: Record<string, number> = {};
    for (const row of sendsRes.data ?? []) {
      byState[row.state] = (byState[row.state] ?? 0) + 1;
      if (row.variant_id) byVariant[row.variant_id] = (byVariant[row.variant_id] ?? 0) + 1;
    }

    return {
      campaign,
      variants: variantsRes.data ?? [],
      stats: { by_state: byState, by_variant: byVariant, total: (sendsRes.data ?? []).length },
    };
  });

export const saveMarketingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        objective: z.enum(["awareness", "engagement", "conversion", "reactivation", "announcement"]),
        channel: channelEnum,
        audience_id: z.string().uuid().optional(),
        scheduled_at: z.string().optional(),
        daily_cap: z.number().int().min(1).max(10000).default(500),
        requires_human_approval: z.boolean().default(false),
        variants: z.array(variantSchema).min(1).max(4),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Validação de autoria: erros bloqueiam a gravação de criativos inválidos.
    const issues = validateCampaign({
      name: data.name,
      channel: data.channel,
      audience_id: data.audience_id ?? null,
      variants: data.variants.map((v) => ({
        label: v.label,
        subject: v.subject ?? null,
        body: v.body,
        media_url: v.media_url ?? null,
        rcs_payload: (v.rcs_payload ?? null) as Record<string, unknown> | null,
        split_percent: v.split_percent,
      })),
    }).filter((i) => i.level === "error" && i.scope !== "Audiência");
    if (issues.length > 0) {
      throw new Error(issues.map((i) => `${i.scope}: ${i.message}`).join(" · "));
    }

    const base = {
      name: data.name,
      objective: data.objective,
      channel: data.channel as never,
      audience_id: data.audience_id ?? null,
      scheduled_at: data.scheduled_at ?? null,
      daily_cap: data.daily_cap,
      requires_human_approval: data.requires_human_approval,
    };

    let campaignId = data.id;
    if (campaignId) {
      const { error } = await context.supabase
        .from("marketing_campaigns")
        .update(base)
        .eq("id", campaignId);
      if (error) throw new Error(error.message);
    } else {
      const { data: row, error } = await context.supabase
        .from("marketing_campaigns")
        .insert({ ...base, created_by: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      campaignId = row.id;
    }

    await context.supabase.from("campaign_variants").delete().eq("campaign_id", campaignId);
    const { error: varErr } = await context.supabase.from("campaign_variants").insert(
      data.variants.map((v) => ({
        campaign_id: campaignId!,
        label: v.label,
        subject: v.subject ?? null,
        body: v.body,
        media_url: v.media_url ?? null,
        rcs_payload: (v.rcs_payload ?? null) as never,
        split_percent: v.split_percent,
      })),
    );
    if (varErr) throw new Error(varErr.message);

    return { id: campaignId };
  });

/** Materializa os envios a partir da audiência e coloca a campanha em execução. */
export const launchMarketingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: campaign, error } = await context.supabase
      .from("marketing_campaigns")
      .select("id, name, channel, audience_id, status, scheduled_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign) throw new Error("Campanha não encontrada");
    if (!campaign.audience_id) throw new Error("Selecione uma audiência antes de lançar");

    const { data: variants } = await context.supabase
      .from("campaign_variants")
      .select("id, split_percent, label, subject, body, media_url, rcs_payload")
      .eq("campaign_id", data.id)
      .order("label");
    if (!variants || variants.length === 0) throw new Error("Crie ao menos uma variante");

    const { data: members } = await context.supabase
      .from("audience_members")
      .select("entity_id")
      .eq("audience_id", campaign.audience_id);
    if (!members || members.length === 0) {
      throw new Error("A audiência está vazia — atualize os membros antes de lançar");
    }

    // Autoridade final: a mesma validação do editor roda aqui antes de materializar.
    const issues = validateCampaign({
      name: campaign.name ?? "campanha",
      channel: campaign.channel as never,
      audience_id: campaign.audience_id,
      audience_size: members.length,
      variants: variants.map((v) => ({
        label: v.label,
        subject: v.subject,
        body: v.body,
        media_url: v.media_url,
        rcs_payload: v.rcs_payload as Record<string, unknown> | null,
        split_percent: v.split_percent,
      })),
    });
    if (hasBlockingIssues(issues)) {
      const errs = issues.filter((i) => i.level === "error");
      throw new Error(
        `Corrija antes de lançar — ${errs.map((i) => `${i.scope}: ${i.message}`).join(" · ")}`,
      );
    }

    // Distribuição determinística por índice, respeitando os percentuais.
    const weights = variants.map((v) => Math.max(v.split_percent, 0));
    const totalWeight = weights.reduce((a, b) => a + b, 0) || variants.length;
    const pickVariant = (index: number) => {
      const position = ((index * totalWeight) / members.length) % totalWeight;
      let acc = 0;
      for (let i = 0; i < variants.length; i++) {
        acc += weights[i] || 1;
        if (position < acc) return variants[i].id;
      }
      return variants[variants.length - 1].id;
    };

    const startAt = campaign.scheduled_at ?? new Date().toISOString();
    let created = 0;
    const chunkSize = 500;
    for (let i = 0; i < members.length; i += chunkSize) {
      const chunk = members.slice(i, i + chunkSize).map((m, offset) => ({
        campaign_id: data.id,
        entity_id: m.entity_id,
        variant_id: pickVariant(i + offset),
        state: "queued",
        next_run_at: startAt,
      }));
      const { error: insErr, count } = await context.supabase
        .from("campaign_sends")
        .upsert(chunk, { onConflict: "campaign_id,entity_id", ignoreDuplicates: true, count: "exact" });
      if (insErr) throw new Error(insErr.message);
      created += count ?? chunk.length;
    }

    const { error: updErr } = await context.supabase
      .from("marketing_campaigns")
      .update({
        status: campaign.scheduled_at ? "scheduled" : "running",
        started_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    return { queued: created };
  });

export const setCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "scheduled", "running", "paused", "completed", "cancelled"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: { status: typeof data.status; completed_at?: string } = { status: data.status };
    if (data.status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("marketing_campaigns")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Métricas agregadas para a Visão Geral. */
export const getMarketingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [campaignsRes, sendsRes, touchRes, audiencesRes] = await Promise.all([
      context.supabase.from("marketing_campaigns").select("id, name, status, channel, updated_at"),
      context.supabase.from("campaign_sends").select("state, campaign_id"),
      context.supabase
        .from("contact_touchpoints")
        .select("channel, direction, status, created_at")
        .gte("created_at", since),
      context.supabase.from("audiences").select("id, name, member_count").eq("archived", false),
    ]);

    const sendsByState: Record<string, number> = {};
    const sendsByCampaign: Record<string, number> = {};
    for (const s of sendsRes.data ?? []) {
      sendsByState[s.state] = (sendsByState[s.state] ?? 0) + 1;
      sendsByCampaign[s.campaign_id] = (sendsByCampaign[s.campaign_id] ?? 0) + 1;
    }

    const byChannel: Record<string, { sent: number; replies: number }> = {};
    for (const t of touchRes.data ?? []) {
      const bucket = (byChannel[t.channel] ??= { sent: 0, replies: 0 });
      if (t.direction === "outbound" && t.status === "sent") bucket.sent += 1;
      if (t.direction === "inbound") bucket.replies += 1;
    }

    const campaigns = (campaignsRes.data ?? []).map((c) => ({
      ...c,
      sends: sendsByCampaign[c.id] ?? 0,
    }));

    return {
      campaigns: campaigns.sort((a, b) => b.sends - a.sends).slice(0, 6),
      campaign_count: campaigns.length,
      running: campaigns.filter((c) => c.status === "running").length,
      sends_by_state: sendsByState,
      by_channel: byChannel,
      audiences: (audiencesRes.data ?? []).slice(0, 6),
      audience_count: (audiencesRes.data ?? []).length,
      reach: (audiencesRes.data ?? []).reduce((acc, a) => acc + (a.member_count ?? 0), 0),
    };
  });