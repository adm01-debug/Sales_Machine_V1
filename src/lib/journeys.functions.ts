import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { journeyGraphSchema, journeySettingsSchema } from "@/lib/journey-graph";

export const listJourneys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("journeys")
      .select(
        "id, name, description, status, requires_human_approval, allow_reentry, entry_daily_cap, send_window_start, send_window_end, updated_at",
      )
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const journeys = data ?? [];
    if (journeys.length === 0) return [];

    const { data: enrollments } = await context.supabase
      .from("journey_enrollments")
      .select("journey_id, state")
      .in(
        "journey_id",
        journeys.map((j) => j.id),
      )
      .limit(5000);

    return journeys.map((j) => {
      const rows = (enrollments ?? []).filter((e) => e.journey_id === j.id);
      return {
        ...j,
        active_count: rows.filter((r) => r.state === "running" || r.state === "waiting").length,
        total_count: rows.length,
      };
    });
  });

export const getJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: journey, error } = await context.supabase
      .from("journeys")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!journey) throw new Error("Jornada não encontrada");

    const [{ data: nodes }, { data: edges }, { data: enrollments }] = await Promise.all([
      context.supabase
        .from("journey_nodes")
        .select("id, kind, label, position_x, position_y, config")
        .eq("journey_id", data.id)
        .order("position_y", { ascending: true }),
      context.supabase
        .from("journey_edges")
        .select("from_node_id, to_node_id, branch, ordinal")
        .eq("journey_id", data.id),
      context.supabase
        .from("journey_enrollments")
        .select("id, entity_id, state, current_node_id, next_run_at, last_error, updated_at")
        .eq("journey_id", data.id)
        .order("updated_at", { ascending: false })
        .limit(50),
    ]);

    return {
      journey,
      nodes: nodes ?? [],
      edges: edges ?? [],
      enrollments: enrollments ?? [],
    };
  });

export const createJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ name: z.string().trim().min(2).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: journey, error } = await context.supabase
      .from("journeys")
      .insert({ name: data.name, created_by: context.userId } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Toda jornada nasce com gatilho + saída para nunca existir grafo vazio.
    const { defaultNodeConfig } = await import("@/lib/journey-graph");
    const { data: created } = await context.supabase
      .from("journey_nodes")
      .insert([
        {
          journey_id: journey.id,
          kind: "trigger",
          label: "Entrada",
          position_x: 0,
          position_y: 0,
          config: defaultNodeConfig("trigger"),
        },
        {
          journey_id: journey.id,
          kind: "exit",
          label: "Fim",
          position_x: 0,
          position_y: 240,
          config: defaultNodeConfig("exit"),
        },
      ] as never)
      .select("id, kind");

    const trigger = (created ?? []).find((n) => n.kind === "trigger");
    const exit = (created ?? []).find((n) => n.kind === "exit");
    if (trigger && exit) {
      await context.supabase.from("journey_edges").insert({
        journey_id: journey.id,
        from_node_id: trigger.id,
        to_node_id: exit.id,
        branch: "default",
        ordinal: 0,
      } as never);
    }

    return { id: journey.id as string };
  });

export const saveJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => journeyGraphSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { saveJourneyGraph } = await import("@/lib/journeys.server");
    return saveJourneyGraph(context.supabase as never, data);
  });

export const setJourneyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "active", "paused", "archived"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { validateGraphInput } = await import("@/lib/journeys.server");

    if (data.status === "active") {
      const [{ data: journey }, { data: nodes }, { data: edges }] = await Promise.all([
        context.supabase.from("journeys").select("*").eq("id", data.id).maybeSingle(),
        context.supabase
          .from("journey_nodes")
          .select("id, kind, label, position_x, position_y, config")
          .eq("journey_id", data.id),
        context.supabase
          .from("journey_edges")
          .select("from_node_id, to_node_id, branch, ordinal")
          .eq("journey_id", data.id),
      ]);
      if (!journey) throw new Error("Jornada não encontrada");

      const parsed = journeyGraphSchema.parse({
        id: data.id,
        settings: journeySettingsSchema.parse(journey),
        nodes: nodes ?? [],
        edges: edges ?? [],
      });
      const blocking = validateGraphInput(parsed).filter((i) => i.level === "error");
      if (blocking.length > 0) {
        throw new Error(
          `Não é possível ativar: ${blocking.map((i) => i.message).join(" ")}`,
        );
      }
    }

    const { error } = await context.supabase
      .from("journeys")
      .update({ status: data.status, updated_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const, status: data.status };
  });