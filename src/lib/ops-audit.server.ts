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

/**
 * Exportação: a UI lista no máximo 200 linhas, mas a auditoria externa precisa
 * do recorte inteiro. Paginamos por keyset (não por OFFSET, que degrada em
 * O(n) e ainda pode duplicar/pular linhas se um evento novo chegar entre as
 * páginas) e limitamos o total para não estourar a memória do worker.
 */
export const AUDIT_EXPORT_PAGE_SIZE = 200;
export const AUDIT_EXPORT_MAX_ROWS = 5_000;

export interface AuditFilters {
  /** Janela em dias; ausente/nulo devolve todo o histórico retido. */
  days?: number | null;
  /** Prefixo ou UUID completo do alvo; entradas vazias são ignoradas. */
  targetId?: string | null;
  limit?: number;
}

import type { TableClient } from "./table-client";

export type AuditClient = TableClient;

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

export interface AuditExportResult {
  rows: ManualInterventionRow[];
  /** `true` quando batemos o teto — o CSV está incompleto e a UI deve avisar. */
  truncated: boolean;
}

/**
 * Percorre a trilha completa via keyset em `created_at` decrescente.
 *
 * Dois cuidados que a paginação ingênua erra:
 * - Eventos com o MESMO `created_at` (o worker grava em lote) ficariam presos
 *   num laço infinito com `lt(created_at, cursor)`, ou seriam perdidos. Por
 *   isso pedimos `lte` a partir do cursor e descartamos os `id` já vistos.
 * - Se uma página inteira for composta só de ids repetidos, não há progresso
 *   possível; encerramos em vez de girar para sempre.
 */
export async function collectManualInterventions(
  client: AuditClient,
  filters: AuditFilters = {},
): Promise<AuditExportResult> {
  const seen = new Set<string>();
  const rows: ManualInterventionRow[] = [];
  let cursor: string | null = null;

  for (;;) {
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
    if (cursor) q = q.lte("created_at", cursor);

    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(AUDIT_EXPORT_PAGE_SIZE);
    if (error) throw new Error(error.message);

    const page = (data ?? []) as ManualInterventionRow[];
    if (page.length === 0) return { rows, truncated: false };

    let added = 0;
    for (const row of page) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
      added++;
      if (rows.length >= AUDIT_EXPORT_MAX_ROWS) return { rows, truncated: true };
    }

    // Página cheia só de repetidos, ou última página parcial: fim do conjunto.
    if (added === 0 || page.length < AUDIT_EXPORT_PAGE_SIZE) {
      return { rows, truncated: false };
    }
    cursor = page[page.length - 1].created_at;
  }
}
