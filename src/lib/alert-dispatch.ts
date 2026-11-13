/**
 * Diferencial de alertas operacionais — lógica pura, testável sem banco.
 *
 * Objetivo: transformar a lista de alertas "ativos agora" em um plano de ação
 * (o que notificar, o que atualizar, o que marcar como resolvido) sem repetir
 * a mesma notificação a cada varredura do cron.
 */

import type { OpsAlert } from "./ops-alerts";

/** Linha persistida em `ops_alert_notifications` (apenas o que interessa aqui). */
export interface StoredAlert {
  id: string;
  alert_id: string;
  level: string;
  last_notified_at: string;
  occurrences: number;
}

export interface AlertDispatchPlan {
  /** Alertas novos (ou reabertos) que devem gerar notificação imediata. */
  toNotify: OpsAlert[];
  /** Alertas ainda ativos que passaram do cooldown e devem ser relembrados. */
  toRemind: Array<{ alert: OpsAlert; stored: StoredAlert }>;
  /** Alertas ativos dentro do cooldown: só incrementa o contador. */
  toTouch: Array<{ alert: OpsAlert; stored: StoredAlert }>;
  /** Registros ativos cujo alerta desapareceu — devem ser resolvidos. */
  toResolve: StoredAlert[];
}

/** Intervalo padrão antes de relembrar um alerta que continua ativo (4h). */
export const REMINDER_COOLDOWN_MS = 4 * 60 * 60 * 1000;

/**
 * @param active alertas detectados na varredura atual
 * @param stored registros ainda não resolvidos no banco
 * @param now instante de referência (injetado para testes determinísticos)
 */
export function planAlertDispatch(
  active: OpsAlert[],
  stored: StoredAlert[],
  now: Date = new Date(),
  cooldownMs: number = REMINDER_COOLDOWN_MS,
): AlertDispatchPlan {
  const storedByKey = new Map<string, StoredAlert>();
  for (const row of stored) {
    // Defensivo: se houver duplicatas, mantém a mais recente.
    const prev = storedByKey.get(row.alert_id);
    if (!prev || row.last_notified_at > prev.last_notified_at) {
      storedByKey.set(row.alert_id, row);
    }
  }

  const plan: AlertDispatchPlan = { toNotify: [], toRemind: [], toTouch: [], toResolve: [] };
  const activeIds = new Set<string>();

  for (const alert of active) {
    activeIds.add(alert.id);
    const existing = storedByKey.get(alert.id);
    if (!existing) {
      plan.toNotify.push(alert);
      continue;
    }
    const last = Date.parse(existing.last_notified_at);
    const elapsed = Number.isNaN(last) ? Infinity : now.getTime() - last;
    // Escalada (ou queda) de severidade também reabre a notificação.
    if (elapsed >= cooldownMs || existing.level !== alert.level) {
      plan.toRemind.push({ alert, stored: existing });
    } else {
      plan.toTouch.push({ alert, stored: existing });
    }
  }

  for (const row of storedByKey.values()) {
    if (!activeIds.has(row.alert_id)) plan.toResolve.push(row);
  }

  return plan;
}

/** Corpo enviado ao webhook de notificação. */
export interface AlertNotificationPayload {
  event: "ops.alerts";
  generated_at: string;
  opened: OpsAlert[];
  reminded: OpsAlert[];
  resolved: string[];
}

export function buildNotificationPayload(
  plan: AlertDispatchPlan,
  now: Date = new Date(),
): AlertNotificationPayload | null {
  const opened = plan.toNotify;
  const reminded = plan.toRemind.map((r) => r.alert);
  const resolved = plan.toResolve.map((r) => r.alert_id);
  if (opened.length === 0 && reminded.length === 0 && resolved.length === 0) return null;
  return { event: "ops.alerts", generated_at: now.toISOString(), opened, reminded, resolved };
}
