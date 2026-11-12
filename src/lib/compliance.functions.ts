import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ComplianceNiche, ComplianceRule, ComplianceSeverity } from "@/lib/compliance-terms";

const nicheEnum = z.enum([
  "geral",
  "saude",
  "financeiro",
  "juridico",
  "apostas",
  "suplementos",
  "custom",
]);
const severityEnum = z.enum(["error", "warning", "info"]);

export interface ComplianceTermRow extends ComplianceRule {
  id: string;
  niche: ComplianceNiche | "custom";
  is_active: boolean;
}

/** Termos proibidos cadastrados pelo usuário (RLS: apenas os próprios). */
export const listComplianceTerms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ComplianceTermRow[]> => {
    const { data, error } = await context.supabase
      .from("compliance_terms")
      .select("id, term, niche, severity, reason, suggestion, is_active")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      term: r.term,
      niche: r.niche as ComplianceNiche | "custom",
      severity: r.severity as ComplianceSeverity,
      reason: r.reason,
      suggestion: r.suggestion ?? undefined,
      is_active: r.is_active,
    }));
  });

export const upsertComplianceTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        term: z.string().trim().min(2).max(120),
        niche: nicheEnum.default("custom"),
        severity: severityEnum.default("warning"),
        reason: z.string().trim().min(3).max(500),
        suggestion: z.string().trim().max(500).optional(),
        is_active: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = {
      term: data.term,
      niche: data.niche as never,
      severity: data.severity as never,
      reason: data.reason,
      suggestion: data.suggestion?.length ? data.suggestion : null,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("compliance_terms")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("compliance_terms")
      .insert({ ...row, created_by: context.userId })
      .select("id")
      .single();
    if (error) {
      // 23505 = índice único (mesmo termo/nicho para o mesmo dono).
      if (error.code === "23505") throw new Error("Este termo já existe neste nicho.");
      throw new Error(error.message);
    }
    return { id: inserted.id };
  });

export const deleteComplianceTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("compliance_terms").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
