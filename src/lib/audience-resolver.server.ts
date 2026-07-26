import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AudienceRules } from "@/lib/audience-rules";

export type ResolvedContact = {
  entity_id: string;
  display_name: string | null;
  kind: string | null;
  signal_score: number;
  last_touch_at: string | null;
  touchpoint_count: number;
  metadata: Record<string, unknown>;
  consent_by_channel: Record<string, string>;
};

type AnySupabase = SupabaseClient<Database> | SupabaseClient<Database, "public">;

/**
 * Traduz as regras declarativas de uma audiência em filtros parametrizados
 * sobre a view 360. Nenhum SQL vem do cliente: apenas valores validados.
 */
export async function resolveAudience(
  supabase: AnySupabase,
  rules: AudienceRules,
): Promise<ResolvedContact[]> {
  let query = supabase
    .from("v_contact_profiles")
    .select(
      "entity_id, display_name, kind, signal_score, last_touch_at, touchpoint_count, metadata, consent_by_channel",
    )
    .limit(Math.min(rules.limit * 3, 5000));

  if (rules.kinds.length > 0) query = query.in("kind", rules.kinds);
  if (rules.search.trim()) query = query.ilike("display_name", `%${rules.search.trim()}%`);
  if (rules.min_signal_score > 0) query = query.gte("signal_score", rules.min_signal_score);
  if (rules.only_previously_contacted) query = query.gt("touchpoint_count", 0);
  if (rules.engaged_within_days > 0) {
    const since = new Date(Date.now() - rules.engaged_within_days * 86400_000).toISOString();
    query = query.gte("last_touch_at", since);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as ResolvedContact[];
  const cutoff =
    rules.exclude_contacted_hours > 0
      ? Date.now() - rules.exclude_contacted_hours * 3600_000
      : null;

  const filtered = rows.filter((row) => {
    if (rules.industries.length > 0) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const industry = String(meta.industry ?? meta.setor ?? meta.ramo ?? "").toLowerCase();
      if (!rules.industries.some((i) => industry.includes(i.toLowerCase()))) return false;
    }
    if (rules.require_consent_channel) {
      const status = (row.consent_by_channel ?? {})[rules.require_consent_channel];
      // Ausência de registro = opt-in implícito (mesma regra de check_consent).
      if (status && status !== "opt_in") return false;
    }
    if (cutoff && row.last_touch_at && new Date(row.last_touch_at).getTime() > cutoff) {
      return false;
    }
    return true;
  });

  return filtered
    .sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0))
    .slice(0, rules.limit);
}