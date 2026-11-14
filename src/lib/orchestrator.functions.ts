import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** List latest orchestration events (admin/operator only via RLS). */
export const listRecentEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sales_machine_events")
      .select("id, source, event_type, status, received_at")
      .order("received_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** List orchestration campaigns. */
export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("campaigns_orchestration")
      .select("id, name, status, channels, requires_human_approval, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Import a company from LUX and stage it as an entity in SALES MACHINE. */
export const importFromLux = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        lux_company_id: z.string().min(1),
        display_name: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("entity_map")
      .upsert(
        {
          kind: "company",
          lux_id: data.lux_company_id,
          display_name: data.display_name,
        },
        { onConflict: "kind,lux_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { entity_id: row.id };
  });

/**
 * Dispatch a single agent turn: FATOR X drafts a message, SALES MACHINE
 * queues it as a touchpoint. Actual delivery happens through the
 * agent-tool endpoint (SINGU channels).
 */
export const dispatchAgentTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entity_id: z.string().uuid(),
        campaign_id: z.string().uuid().optional(),
        agent_id: z.string().optional(),
        prompt: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Resolve or create a fatorx thread bound to this entity.
    const { data: entity } = await context.supabase
      .from("entity_map")
      .select("id, fatorx_thread_id, display_name")
      .eq("id", data.entity_id)
      .maybeSingle();
    if (!entity) throw new Error("entity not found");

    const threadId = entity.fatorx_thread_id ?? `sm_${entity.id}`;
    const { fatorxClient } = await import("@/integrations/external/fatorx.server");
    const result = await fatorxClient.runAgent({
      agent_id: data.agent_id,
      thread_id: threadId,
      input: data.prompt,
      metadata: {
        entity_id: entity.id,
        campaign_id: data.campaign_id,
        display_name: entity.display_name,
      },
    });

    if (!entity.fatorx_thread_id) {
      await context.supabase
        .from("entity_map")
        .update({ fatorx_thread_id: threadId })
        .eq("id", entity.id);
    }

    return { thread_id: threadId, agent_result: result };
  });

/** List ICP companies from LUX, marking Sales Machine status via entity_map join. */
export const listIcpCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ icp_id: z.string().optional(), limit: z.number().int().min(1).max(200).optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { luxClient } = await import("@/integrations/external/lux.server");
    let companies: Array<Record<string, unknown>> = [];
    try {
      const res = await luxClient.listCompanies({ icp_id: data.icp_id, limit: data.limit ?? 50 });
      const raw = (res as { data?: unknown; companies?: unknown } | null) ?? {};
      const arr = Array.isArray(raw) ? raw : (raw.data ?? raw.companies ?? []);
      companies = Array.isArray(arr) ? (arr as Array<Record<string, unknown>>) : [];
    } catch (err) {
      return { companies: [], error: err instanceof Error ? err.message : String(err) };
    }

    const luxIds = companies.map((c) => String(c.id ?? c.company_id ?? "")).filter(Boolean);

    const statusByLux = new Map<string, { entity_id: string; in_campaign: boolean }>();
    if (luxIds.length > 0) {
      const { data: mapped } = await context.supabase
        .from("entity_map")
        .select("id, lux_id")
        .eq("kind", "company")
        .in("lux_id", luxIds);
      const entityIds = (mapped ?? []).map((m) => m.id);
      const { data: targets } = entityIds.length
        ? await context.supabase
            .from("campaign_targets")
            .select("entity_id, status")
            .in("entity_id", entityIds)
            .in("status", ["queued", "running"])
        : { data: [] as Array<{ entity_id: string; status: string }> };
      const activeSet = new Set((targets ?? []).map((t) => t.entity_id));
      for (const m of mapped ?? []) {
        if (m.lux_id) {
          statusByLux.set(m.lux_id, { entity_id: m.id, in_campaign: activeSet.has(m.id) });
        }
      }
    }

    return {
      companies: companies.map((c) => {
        const luxId = String(c.id ?? c.company_id ?? "");
        const s = statusByLux.get(luxId);
        return {
          lux_id: luxId,
          name: String(c.name ?? c.display_name ?? c.razao_social ?? "—"),
          industry: (c.industry ?? c.ramo ?? c.setor ?? null) as string | null,
          size: (c.size ?? c.porte ?? c.employees ?? null) as string | number | null,
          entity_id: s?.entity_id ?? null,
          in_campaign: s?.in_campaign ?? false,
        };
      }),
      error: null,
    };
  });

/** Full dossier for a company: LUX profile + decisors, SINGU history/NBA, FATOR X suggestion. */
export const getCompanyDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ lux_company_id: z.string().min(1), display_name: z.string().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Ensure entity exists (upsert lightweight)
    const { data: entity } = await context.supabase
      .from("entity_map")
      .upsert(
        {
          kind: "company",
          lux_id: data.lux_company_id,
          display_name: data.display_name ?? data.lux_company_id,
        },
        { onConflict: "kind,lux_id" },
      )
      .select("id, singu_id, fatorx_thread_id, display_name")
      .single();

    const [luxRes, singuRes, fatorxRes] = await Promise.allSettled([
      (async () => {
        const { luxClient } = await import("@/integrations/external/lux.server");
        return luxClient.searchDecisors({ company_id: data.lux_company_id });
      })(),
      (async () => {
        if (!entity?.singu_id) return null;
        const { singuClient } = await import("@/integrations/external/singu.server");
        return singuClient.nextBestAction({ contact_id: entity.singu_id });
      })(),
      (async () => {
        const { fatorxClient } = await import("@/integrations/external/fatorx.server");
        return fatorxClient.quickTest({
          message: `Sugira uma abordagem inicial de prospecção para a empresa "${data.display_name ?? data.lux_company_id}". Formato: 3 mensagens curtas, uma para WhatsApp, uma para Email e uma para LinkedIn.`,
        });
      })(),
    ]);

    // Recent local touchpoints
    const { data: recentTouchpoints } = entity
      ? await context.supabase
          .from("contact_touchpoints")
          .select("id, channel, direction, status, created_at, payload")
          .eq("entity_id", entity.id)
          .order("created_at", { ascending: false })
          .limit(10)
      : { data: [] };

    return {
      entity,
      decisors: luxRes.status === "fulfilled" ? luxRes.value : { error: String(luxRes.reason) },
      singu: singuRes.status === "fulfilled" ? singuRes.value : { error: String(singuRes.reason) },
      agent_suggestion:
        fatorxRes.status === "fulfilled" ? fatorxRes.value : { error: String(fatorxRes.reason) },
      recent_touchpoints: recentTouchpoints ?? [],
    };
  });

/** Enqueue a batch of companies (by LUX id) into a campaign as targets. */
export const enqueueBatchProspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        campaign_id: z.string().uuid(),
        companies: z
          .array(z.object({ lux_id: z.string().min(1), display_name: z.string().min(1) }))
          .min(1)
          .max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let enqueued = 0;
    let skipped = 0;
    for (const c of data.companies) {
      const { data: ent, error: entErr } = await context.supabase
        .from("entity_map")
        .upsert(
          { kind: "company", lux_id: c.lux_id, display_name: c.display_name },
          { onConflict: "kind,lux_id" },
        )
        .select("id")
        .single();
      if (entErr || !ent) {
        skipped++;
        continue;
      }
      const { error: tgtErr } = await context.supabase.from("campaign_targets").upsert(
        {
          campaign_id: data.campaign_id,
          entity_id: ent.id,
          next_run_at: new Date().toISOString(),
          status: "queued",
        },
        { onConflict: "campaign_id,entity_id", ignoreDuplicates: true },
      );
      if (tgtErr) {
        skipped++;
        continue;
      }
      enqueued++;
    }
    await context.supabase.from("sales_machine_events").insert({
      source: "manual",
      event_type: "batch_enqueued",
      payload: { campaign_id: data.campaign_id, enqueued, skipped } as never,
    });
    return { enqueued, skipped };
  });

/** List campaigns for pickers. */
export const listCampaignsForPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("campaigns_orchestration")
      .select("id, name, status, channels, fatorx_agent_id")
      .in("status", ["draft", "active"])
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Create a new campaign. */
export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        description: z.string().optional(),
        channels: z.array(z.enum(["whatsapp", "email", "sms", "linkedin", "instagram"])).min(1),
        fatorx_agent_id: z.string().optional(),
        cadence_rule_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("campaigns_orchestration")
      .insert({
        name: data.name,
        description: data.description ?? null,
        channels: data.channels,
        fatorx_agent_id: data.fatorx_agent_id ?? null,
        cadence_rule_id: data.cadence_rule_id ?? null,
        status: "active",
        owner_id: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

/** List cadence rules for pickers. */
export const listCadenceRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cadence_rules")
      .select("id, name, description, steps")
      .eq("is_active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============================================================
// APROVAÇÕES (human-in-the-loop) — Item 4
// ============================================================

export const listPendingApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contact_touchpoints")
      .select("id, entity_id, campaign_id, channel, payload, created_at")
      .eq("status", "pending_approval")
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const decideApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        touchpoint_id: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        edited_message: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: tp, error: fetchErr } = await context.supabase
      .from("contact_touchpoints")
      .select("id, entity_id, channel, payload")
      .eq("id", data.touchpoint_id)
      .eq("status", "pending_approval")
      .single();
    if (fetchErr) throw new Error(fetchErr.message);

    if (data.decision === "reject") {
      await context.supabase
        .from("contact_touchpoints")
        .update({ status: "failed", error: "rejected by reviewer" })
        .eq("id", data.touchpoint_id);
      return { ok: true, decision: "rejected" };
    }

    const payload = (tp.payload ?? {}) as { message?: string };
    const finalMessage = data.edited_message ?? payload.message ?? "";

    // Dispatch real via singu/social
    const isSocial = tp.channel === "linkedin" || tp.channel === "instagram";
    try {
      if (isSocial) {
        const { getSocialSender } = await import("@/integrations/social/types");
        const sender = getSocialSender(tp.channel as "linkedin" | "instagram");
        const res = await sender.send(tp.channel as "linkedin" | "instagram", {
          entity_id: tp.entity_id,
          message: finalMessage,
        });
        await context.supabase
          .from("contact_touchpoints")
          .update({
            status: res.status,
            error: res.error ?? null,
            payload: { ...payload, message: finalMessage, provider: res.provider } as never,
          })
          .eq("id", tp.id);
      } else {
        const { data: ent } = await context.supabase
          .from("entity_map")
          .select("singu_id")
          .eq("id", tp.entity_id)
          .maybeSingle();
        if (ent?.singu_id) {
          const { singuClient } = await import("@/integrations/external/singu.server");
          if (tp.channel === "whatsapp") {
            await singuClient.sendWhatsapp({ contact_id: ent.singu_id, message: finalMessage });
          } else if (tp.channel === "sms") {
            await singuClient.sendSms({ contact_id: ent.singu_id, message: finalMessage });
          }
          await context.supabase
            .from("contact_touchpoints")
            .update({ status: "sent", payload: { ...payload, message: finalMessage } as never })
            .eq("id", tp.id);
        }
      }
    } catch (err) {
      const emsg = err instanceof Error ? err.message : String(err);
      await context.supabase
        .from("contact_touchpoints")
        .update({ status: "failed", error: emsg })
        .eq("id", tp.id);
    }
    return { ok: true, decision: "approved" };
  });

// ============================================================
// EVAL HARNESS — Item 9
// ============================================================

export const listEvalCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agent_eval_cases")
      .select("id, name, expected_channel, expected_intent, signal_json, agent_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createEvalCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1),
        expected_channel: z.enum(["whatsapp", "email", "sms", "linkedin", "instagram"]).optional(),
        expected_intent: z.string().min(1),
        signal_json: z.record(z.string(), z.unknown()).default({}),
        agent_id: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("agent_eval_cases")
      .insert({
        name: data.name,
        expected_channel: data.expected_channel ?? null,
        expected_intent: data.expected_intent,
        signal_json: data.signal_json as never,
        agent_id: data.agent_id ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const runEvalCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ case_id: z.string().uuid(), agent_id: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: c, error } = await context.supabase
      .from("agent_eval_cases")
      .select("id, expected_intent, expected_channel, agent_id, signal_json")
      .eq("id", data.case_id)
      .single();
    if (error) throw new Error(error.message);

    const { fatorxClient } = await import("@/integrations/external/fatorx.server");
    const started = Date.now();
    let output = "";
    let ok = false;
    let errMsg: string | null = null;
    try {
      const res = await fatorxClient.runAgent({
        agent_id: data.agent_id ?? c.agent_id ?? undefined,
        thread_id: `eval_${c.id}_${Date.now()}`,
        input: `[EVAL canal=${c.expected_channel ?? "any"}] Intent esperado: ${c.expected_intent}. Sinal: ${JSON.stringify(c.signal_json)}`,
      });
      const r = res as { message?: string; output?: string; text?: string } | null;
      output = r?.message ?? r?.output ?? r?.text ?? "";
      ok = output.length > 0 && output.length < 800;
    } catch (e) {
      errMsg = e instanceof Error ? e.message : String(e);
    }
    const { data: run } = await context.supabase
      .from("agent_eval_runs")
      .insert({
        case_id: c.id,
        actual_output: { output } as never,
        passed: ok,
        latency_ms: Date.now() - started,
        error: errMsg,
        ran_by: context.userId,
      })
      .select("id")
      .single();
    return { run_id: run?.id, passed: ok, output, error: errMsg };
  });
