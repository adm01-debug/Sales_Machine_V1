import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Leitura da materialized view de saúde do pipeline.
 *
 * IMPORTANTE: o REFRESH não acontece aqui. `refresh_pipeline_health()` é uma
 * função privilegiada (EXECUTE apenas para service_role) chamada pela varredura
 * automática `alert-sweep` a cada 15 minutos. Isso evita que cada operador
 * abrindo o painel dispare um REFRESH pesado e concorrente na view.
 */
export const getPipelineHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("v_pipeline_health" as never)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as {
      queued: number; running: number; paused: number; replied: number;
      stopped: number; completed: number; dead_letter: number; lost: number;
      total: number; sent_24h: number; replies_24h: number; opt_outs_7d: number;
      refreshed_at: string;
    } | null;
  });

export const getDeliverabilityStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data } = await context.supabase
      .from("email_deliverability_events")
      .select("event_type, created_at")
      .gte("created_at", since);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) counts[row.event_type] = (counts[row.event_type] ?? 0) + 1;
    return counts;
  });

/**
 * Histórico das notificações de alerta disparadas pela varredura automática.
 * Mostra o que já foi avisado (e quando) para evitar dúvida do operador
 * sobre "isso já foi comunicado ao time?".
 */
export const getAlertNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ops_alert_notifications")
      .select("id, alert_id, level, title, detail, first_notified_at, last_notified_at, occurrences, resolved_at")
      .order("last_notified_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Métricas de compliance da cadência 1:1: quantos alvos o worker interrompeu
 * por falta de consentimento (LGPD) e quantos opt-outs entraram por canal.
 * Serve como prova auditável de que o gate de consentimento está ativo.
 */
export const getComplianceStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

    // Contagens via `head: true`: o servidor devolve só o total, sem trafegar linhas.
    const { count: blockedCount, error: blockedErr } = await context.supabase
      .from("campaign_targets")
      .select("id", { count: "exact", head: true })
      .eq("state", "stopped")
      .ilike("last_error", "%consentimento%");
    if (blockedErr) throw new Error(blockedErr.message);

    const { count: skippedCount, error: skippedErr } = await context.supabase
      .from("campaign_sends")
      .select("id", { count: "exact", head: true })
      .eq("state", "skipped")
      .ilike("last_error", "%opt-out%");
    if (skippedErr) throw new Error(skippedErr.message);

    const { data: consentRows, error: consentErr } = await context.supabase
      .from("consent_ledger")
      .select("channel, status, created_at")
      .gte("created_at", since);
    if (consentErr) throw new Error(consentErr.message);

    const optOutsByChannel: Record<string, number> = {};
    let optIns = 0;
    for (const row of consentRows ?? []) {
      if (row.status === "opt_in") {
        optIns++;
        continue;
      }
      const channel = row.channel ?? "desconhecido";
      optOutsByChannel[channel] = (optOutsByChannel[channel] ?? 0) + 1;
    }

    return {
      blockedByConsent: (blockedCount ?? 0) + (skippedCount ?? 0),
      optIns7d: optIns,
      optOuts7d: Object.values(optOutsByChannel).reduce((a, b) => a + b, 0),
      optOutsByChannel,
    };
  });

/**
 * Recoloca alvos em `dead_letter` de volta na fila.
 *
 * Sem isso o operador não tem caminho de recuperação: um pico de indisponibilidade
 * do canal enterra os alvos permanentemente. Zeramos `attempts` (o backoff já
 * expirou seu propósito), liberamos o lock e agendamos para agora.
 */
export const requeueDeadLetterTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requeueDeadLetter } = await import("./ops-recovery.server");
    return requeueDeadLetter(context.supabase, undefined, `operator:${context.userId}`);
  });

/**
 * Trilha de auditoria das intervenções humanas no pipeline.
 *
 * Filtra `campaign_target_events` pelos eventos cujo autor é `operator:<uid>`
 * (gravados pelo reprocessamento manual de dead-letter). O índice parcial
 * `idx_campaign_target_events_operator` cobre exatamente esse predicado, então
 * a leitura não varre o histórico automático — que é ordens de grandeza maior.
 */
export const getManualInterventions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number | null; targetId?: string | null } | undefined) => ({
    days: input?.days ?? null,
    targetId: input?.targetId ?? null,
  }))
  .handler(async ({ context, data }) => {
    const { listManualInterventions } = await import("./ops-audit.server");
    return listManualInterventions(context.supabase, {
      days: data.days,
      targetId: data.targetId,
    });
  });

/**
 * Recorte completo (paginado no servidor) para exportação em CSV.
 * Separado do listing da UI porque tem custo maior e roda sob demanda.
 */
export const exportManualInterventions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number | null; targetId?: string | null } | undefined) => ({
    days: input?.days ?? null,
    targetId: input?.targetId ?? null,
  }))
  .handler(async ({ context, data }) => {
    const { collectManualInterventions } = await import("./ops-audit.server");
    return collectManualInterventions(context.supabase, {
      days: data.days,
      targetId: data.targetId,
    });
  });

/**
 * Impacto financeiro por canal: converte os touchpoints outbound do período em
 * custo estimado e destaca quanto foi desperdiçado (opt-out / dead-letter).
 */
export const getSpendBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number | null } | undefined) => ({
    days: input?.days ?? null,
  }))
  .handler(async ({ context, data }) => {
    const { buildSpendReport } = await import("./ops-spend.server");
    return buildSpendReport(context.supabase, { days: data.days });
  });
/**
 * Guardrail de orçamento: gasto do dia/mês por canal cruzado com os tetos
 * configurados em `channel_budgets`. Mesma fonte de verdade usada pelo worker.
 */
export const getBudgetReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { buildBudgetReport } = await import("./budget.server");
    const report = await buildBudgetReport(context.supabase);
    // `Set` não é serializável pelo transporte de server functions.
    return { ...report, blockedChannels: [...report.blockedChannels] };
  });

/** Atualiza os tetos de um canal. RLS restringe a admin/operator. */
export const updateChannelBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    channel: string;
    dailyLimit: number;
    monthlyLimit: number;
    enabled: boolean;
  }) => {
    const channel = String(input?.channel ?? "").trim();
    if (!channel) throw new Error("Canal obrigatório");
    const clamp = (n: unknown) => {
      const v = Number(n);
      if (!Number.isFinite(v) || v < 0) return 0;
      return Math.min(Math.round(v * 100) / 100, 9_999_999);
    };
    return {
      channel,
      dailyLimit: clamp(input.dailyLimit),
      monthlyLimit: clamp(input.monthlyLimit),
      enabled: input.enabled !== false,
    };
  })
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("channel_budgets")
      .update({
        daily_limit_brl: data.dailyLimit,
        monthly_limit_brl: data.monthlyLimit,
        enabled: data.enabled,
      })
      .eq("channel", data.channel);
    if (error) throw new Error(error.message);
    return { ok: true as const, channel: data.channel };
  });

/**
 * Prévia da realocação de teto diário entre canais (melhoria 023).
 * Somente leitura — nada é alterado até o operador confirmar.
 */
export const getBudgetReallocationPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { previewReallocation } = await import("./budget-reallocation.server");
    return previewReallocation(context.supabase);
  });

/**
 * Aplica a realocação recalculando o plano no servidor no instante da execução,
 * para não mover saldo com base em uma prévia obsoleta.
 */
export const applyBudgetReallocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { applyReallocation } = await import("./budget-reallocation.server");
    return applyReallocation(context.supabase);
  });
