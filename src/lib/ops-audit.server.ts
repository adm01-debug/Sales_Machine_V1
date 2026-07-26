/**
 * Consulta da trilha de auditoria de intervenções manuais.
 *
 * Isolada do wrapper `createServerFn` pelo mesmo motivo de `ops-recovery.server.ts`:
 * o plugin `tss-serverfn-split` remove helpers irmãos do módulo em runtime, e
 * manter a lógica aqui permite testá-la contra o client fake.
 */

/** Períodos oferecidos ao operador (em dias). `null` = sem recorte temporal. */
export const AUDIT_PERIODS = [1, 7, 30, 90] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number];

export const AUDIT_DEFAULT_LIMIT = 25;
export const AUDIT_MAX_LIMIT = 200;

export interface AuditFilters {
  /** Janela em dias; ausente/nulo devolve todo o histórico retido. */
  days?: number | null;
  /** Prefixo ou UUID completo do alvo; entradas vazias são ignoradas. */
  targetId?: string | null;
  limit?: number;
}

export interface AuditClient {
  from: (table: string) => any;
}

export interface ManualInterventionRow {
  id: string;
  target_id: string;
  from_state: string | null;
  to_state: string;
  reason: string | null;
  actor: string;
  created_at: string;
}

/** Só aceitamos caracteres de UUID: evita curingas `%`/`_` vindos do input. */
const UUID_PREFIX = /^[0-9a-fA-F-]{1,36}$/;

export function normalizeTargetFilter(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  return UUID_PREFIX.test(value) ? value.toLowerCase() : null;
}

export function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit < 1) return AUDIT_DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), AUDIT_MAX_LIMIT);
}

/**
 * Lê apenas eventos cujo autor é `operator:<uid>` — o índice parcial
 * `idx_campaign_target_events_operator` cobre exatamente esse predicado, então
 * o filtro por período e por alvo refina um conjunto já pequeno.
 */
export async function listManualInterventions(
  client: AuditClient,
  filters: AuditFilters = {},
): Promise<ManualInterventionRow[]> {
  let q = client
    .from("campaign_target_events")
    .select("id, target_id, from_state, to_state, reason, actor, created_at")
    .like("actor", "operator:%");

  const days = filters.days;
  if (typeof days === "number" && Number.isFinite(days) && days > 0) {
    q = q.gte("created_at", new Date(Date.now() - days * 24 * 3600_000).toISOString());
  }

  const target = normalizeTargetFilter(filters.targetId);
  if (target) q = q.ilike("target_id", `${target}%`);

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(clampLimit(filters.limit));
  if (error) throw new Error(error.message);
  return (data ?? []) as ManualInterventionRow[];
}