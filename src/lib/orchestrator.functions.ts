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