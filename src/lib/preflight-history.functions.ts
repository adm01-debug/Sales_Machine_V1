import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTemplatePreflightHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ templateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // @ts-ignore - The table was just created via migration and might not be in types.ts yet
    const { data: history, error } = await context.supabase
      .from("template_preflight_history")
      .select("score, findings, created_at")
      .eq("template_id", data.templateId)
      .order("created_at", { ascending: true });
    
    if (error) throw new Error(error.message);
    return (history || []) as any[];
  });

export const recordTemplatePreflight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => 
    z.object({ 
      templateId: z.string().uuid(),
      score: z.number().min(0).max(100),
      findings: z.array(z.any())
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    // @ts-ignore - The table was just created via migration and might not be in types.ts yet
    const { error } = await context.supabase
      .from("template_preflight_history")
      .insert({
        template_id: data.templateId,
        score: data.score,
        findings: data.findings as any,
        created_by: context.userId
      });
    
    if (error) throw new Error(error.message);
    return { ok: true };
  });
