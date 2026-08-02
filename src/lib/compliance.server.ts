import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComplianceNiche, ComplianceRule } from "@/lib/compliance-terms";

export interface ComplianceContext {
  niches: ComplianceNiche[];
  rules: ComplianceRule[];
}

/**
 * Carrega os termos ativos do usuário (RLS) e deriva os nichos regulatórios
 * a aplicar. Um termo cadastrado em `saude` liga a lista embutida de saúde;
 * `geral` é sempre aplicado como piso mínimo.
 */
export async function loadComplianceContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<ComplianceContext> {
  const { data, error } = await supabase
    .from("compliance_terms")
    .select("term, niche, severity, reason, suggestion")
    .eq("is_active", true)
    .limit(500);
  // Falha de leitura não pode derrubar o lançamento: aplica-se o piso `geral`.
  if (error || !data) return { niches: ["geral"], rules: [] };

  const niches = new Set<ComplianceNiche>(["geral"]);
  const rules: ComplianceRule[] = [];
  for (const row of data as Array<Record<string, string | null>>) {
    const niche = (row.niche ?? "custom") as ComplianceNiche | "custom";
    if (niche !== "custom") niches.add(niche);
    if (row.term) {
      rules.push({
        term: row.term,
        severity: (row.severity ?? "warning") as ComplianceRule["severity"],
        reason: row.reason ?? "Termo proibido pela política do cliente.",
        suggestion: row.suggestion ?? undefined,
      });
    }
  }
  return { niches: [...niches], rules };
}