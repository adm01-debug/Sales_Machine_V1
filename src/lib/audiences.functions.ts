import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audienceRulesSchema, parseRules } from "@/lib/audience-rules";

export const listAudiences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audiences")
      .select("id, name, description, rules, member_count, last_refreshed_at, updated_at")
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: audience, error } = await context.supabase
      .from("audiences")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!audience) throw new Error("Audiência não encontrada");

    const { data: members } = await context.supabase
      .from("audience_members")
      .select("entity_id, snapshot")
      .eq("audience_id", data.id)
      .limit(200);

    return { audience, rules: parseRules(audience.rules), members: members ?? [] };
  });

export const previewAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ rules: audienceRulesSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { resolveAudience } = await import("@/lib/audience-resolver.server");
    const rows = await resolveAudience(context.supabase, data.rules);
    return {
      count: rows.length,
      sample: rows.slice(0, 12).map((r) => ({
        entity_id: r.entity_id,
        display_name: r.display_name,
        kind: r.kind,
        signal_score: r.signal_score,
        last_touch_at: r.last_touch_at,
      })),
    };
  });

export const saveAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        rules: audienceRulesSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      name: data.name,
      description: data.description ?? null,
      rules: data.rules as never,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("audiences")
        .update({ name: payload.name, description: payload.description, rules: payload.rules })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("audiences")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const refreshAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: audience, error } = await context.supabase
      .from("audiences")
      .select("id, rules")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!audience) throw new Error("Audiência não encontrada");

    const { resolveAudience } = await import("@/lib/audience-resolver.server");
    const rows = await resolveAudience(context.supabase, parseRules(audience.rules));

    await context.supabase.from("audience_members").delete().eq("audience_id", data.id);
    if (rows.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize).map((r) => ({
          audience_id: data.id,
          entity_id: r.entity_id,
          snapshot: {
            display_name: r.display_name,
            kind: r.kind,
            signal_score: r.signal_score,
          } as never,
        }));
        const { error: insErr } = await context.supabase.from("audience_members").insert(chunk);
        if (insErr) throw new Error(insErr.message);
      }
    }

    await context.supabase
      .from("audiences")
      .update({ member_count: rows.length, last_refreshed_at: new Date().toISOString() })
      .eq("id", data.id);

    return { member_count: rows.length };
  });

export const archiveAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("audiences")
      .update({ archived: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
