/**
 * Regras de alerta operacional — lógica pura para ser testável sem banco.
 * Cada regra responde a uma pergunta que o operador faria de manhã:
 * "o pipeline travou?", "estou queimando reputação?", "as métricas são confiáveis?".
 */

export type AlertLevel = "critical" | "warning";

export interface OpsAlert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
}

export interface OpsHealthInput {
  dead_letter: number;
  queued: number;
  running: number;
  sent_24h: number;
  replies_24h: number;
  opt_outs_7d: number;
}

export interface OpsDeliverabilityInput {
  opened: number;
  clicked: number;
  hard_bounce: number;
  complaint: number;
}

export interface OpsTrackingInput {
  sends: number;
  coverageRate: number;
  collisions: number;
  redeliveries: number;
}

/**
 * Sinal de compliance: quantos disparos o motor recusou por falta de
 * consentimento comparado ao total de tentativas do período. Uma taxa alta
 * indica audiência montada sobre contatos que já pediram para sair.
 */
export interface OpsComplianceInput {
  blockedByConsent: number;
  deliveryAttempts: number;
}

/**
 * Estado de orçamento por canal, na forma mínima que o motor de alertas
 * precisa. Deliberadamente estrutural (e não um import de `budget-guard`)
 * para manter este módulo puro e sem acoplamento de tipos de banco.
 */
export interface OpsBudgetChannelInput {
  channel: string;
  status: "ok" | "warning" | "exhausted" | "disabled";
  spentToday: number;
  dailyLimit: number;
  usageRate: number | null;
  monthlyUsageRate?: number | null;
  reason?: string | null;
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  sms: "SMS",
  rcs: "RCS",
  mms: "MMS",
  linkedin: "LinkedIn",
  instagram: "Instagram",
};
const channelLabel = (c: string) => CHANNEL_LABELS[c] ?? c;

/** Acima disso a audiência está sendo montada em cima de opt-outs. */
export const CONSENT_BLOCK_WARN_RATE = 10;
export const CONSENT_BLOCK_CRITICAL_RATE = 25;

/** Cobertura mínima de rastreio aceitável antes de desconfiar das métricas. */
export const TRACKING_COVERAGE_FLOOR = 90;
/** Amostra mínima para que uma taxa percentual signifique alguma coisa. */
const MIN_SAMPLE = 20;

const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);
const fmt = (n: number) => `${Math.round(n * 10) / 10}%`;

export function buildOpsAlerts(input: {
  health?: OpsHealthInput | null;
  deliverability?: OpsDeliverabilityInput | null;
  tracking?: OpsTrackingInput | null;
  compliance?: OpsComplianceInput | null;
  budget?: OpsBudgetChannelInput[] | null;
}): OpsAlert[] {
  const alerts: OpsAlert[] = [];
  const { health, deliverability: d, tracking: t, compliance: c, budget: b } = input;

  if (health) {
    if (health.dead_letter > 0) {
      alerts.push({
        id: "dead_letter",
        level: "critical",
        title: `${health.dead_letter} alvo(s) em dead-letter`,
        detail: "Falharam todas as tentativas. Revise o erro e reprocese ou encerre manualmente.",
      });
    }
    if (health.queued > 0 && health.running === 0 && health.sent_24h === 0) {
      alerts.push({
        id: "pipeline_stalled",
        level: "critical",
        title: "Pipeline parado com fila pendente",
        detail: `${health.queued} alvo(s) na fila e nenhum envio nas últimas 24h — verifique o agendamento do tick.`,
      });
    }
    if (health.sent_24h >= MIN_SAMPLE && health.replies_24h === 0) {
      alerts.push({
        id: "no_replies",
        level: "warning",
        title: "Nenhuma resposta nas últimas 24h",
        detail: `${health.sent_24h} mensagens enviadas sem retorno. Reveja copy, segmentação e horários.`,
      });
    }
    if (health.sent_24h >= MIN_SAMPLE) {
      const optOutRate = pct(health.opt_outs_7d, health.sent_24h);
      if (optOutRate > 5) {
        alerts.push({
          id: "opt_out_rate",
          level: "warning",
          title: `Taxa de opt-out elevada (${fmt(optOutRate)})`,
          detail: "Acima de 5% costuma indicar audiência mal segmentada ou abordagem invasiva.",
        });
      }
    }
  }

  if (d) {
    const emailEvents = d.opened + d.clicked + d.hard_bounce + d.complaint;
    if (emailEvents >= MIN_SAMPLE) {
      const bounceRate = pct(d.hard_bounce, emailEvents);
      if (bounceRate > 5) {
        alerts.push({
          id: "bounce_rate",
          level: "critical",
          title: `Hard bounce em ${fmt(bounceRate)}`,
          detail: "Acima de 5% ameaça a reputação do domínio. Higienize a lista antes de novos envios.",
        });
      }
      const complaintRate = pct(d.complaint, emailEvents);
      if (complaintRate > 0.3) {
        alerts.push({
          id: "complaint_rate",
          level: "critical",
          title: `Reclamações de spam em ${fmt(complaintRate)}`,
          detail: "O limite tolerado pelos provedores é 0,3%. Pause a campanha e revise o consentimento.",
        });
      }
    }
  }

  if (t && t.sends > 0) {
    if (t.coverageRate < TRACKING_COVERAGE_FLOOR) {
      alerts.push({
        id: "tracking_coverage",
        level: "warning",
        title: `Cobertura de rastreio em ${fmt(t.coverageRate)}`,
        detail: `Abaixo de ${TRACKING_COVERAGE_FLOOR}%: aberturas e cliques estão subestimados. Veja a auditoria em Entregabilidade.`,
      });
    }
    if (t.collisions > 0) {
      alerts.push({
        id: "tracking_collisions",
        level: "critical",
        title: `${t.collisions} código(s) de rastreio duplicado(s)`,
        detail: "Eventos podem estar sendo atribuídos ao contato errado.",
      });
    }
    if (t.redeliveries > 0) {
      alerts.push({
        id: "tracking_redeliveries",
        level: "warning",
        title: `${t.redeliveries} evento(s) possivelmente contados em dobro`,
        detail: "Reentregas do webhook inflam aberturas e cliques.",
      });
    }
  }

  if (c && c.blockedByConsent > 0) {
    const attempts = c.deliveryAttempts + c.blockedByConsent;
    const rate = pct(c.blockedByConsent, attempts);
    if (attempts >= MIN_SAMPLE && rate > CONSENT_BLOCK_CRITICAL_RATE) {
      alerts.push({
        id: "consent_block_rate_critical",
        level: "critical",
        title: `${fmt(rate)} dos disparos bloqueados por consentimento`,
        detail:
          `${c.blockedByConsent} de ${attempts} tentativas foram recusadas pelo gate de LGPD. ` +
          "Pause a campanha e refaça a audiência excluindo quem já pediu descadastro.",
      });
    } else if (attempts >= MIN_SAMPLE && rate > CONSENT_BLOCK_WARN_RATE) {
      alerts.push({
        id: "consent_block_rate",
        level: "warning",
        title: `Bloqueios por consentimento em ${fmt(rate)}`,
        detail:
          `${c.blockedByConsent} de ${attempts} tentativas recusadas. ` +
          "Aplique o filtro de opt-out na origem da audiência para não queimar quota.",
      });
    }
  }

  if (b && b.length > 0) {
    // Um alerta agregado por severidade: o operador quer saber "quais canais
    // pararam" em uma linha, não sete cards separados.
    const halted = b.filter((s) => s.status === "exhausted" || s.status === "disabled");
    if (halted.length > 0) {
      const exhausted = halted.filter((s) => s.status === "exhausted");
      const disabled = halted.filter((s) => s.status === "disabled");
      const parts: string[] = [];
      if (exhausted.length > 0) {
        parts.push(
          `teto atingido: ${exhausted
            .map((s) => `${channelLabel(s.channel)} (${s.reason ?? "sem saldo"})`)
            .join(", ")}`,
        );
      }
      if (disabled.length > 0) {
        parts.push(`desativado pelo operador: ${disabled.map((s) => channelLabel(s.channel)).join(", ")}`);
      }
      alerts.push({
        id: "budget_exhausted",
        level: "critical",
        title: `${halted.length} canal(is) sem orçamento — disparos adiados`,
        detail: `${parts.join(" · ")}. O motor de cadência reagenda os alvos a cada hora; ajuste os tetos em Orçamento por canal para retomar.`,
      });
    }

    const nearLimit = b.filter((s) => s.status === "warning");
    if (nearLimit.length > 0) {
      alerts.push({
        id: "budget_warning",
        level: "warning",
        title: `${nearLimit.length} canal(is) acima de ${Math.round(80)}% do teto`,
        detail: nearLimit
          .map(
            (s) =>
              `${channelLabel(s.channel)}: ${fmt(s.usageRate ?? 0)} do teto diário ` +
              `(R$ ${s.spentToday.toFixed(2)} de R$ ${s.dailyLimit.toFixed(2)})`,
          )
          .join(" · "),
      });
    }
  }

  const order: Record<AlertLevel, number> = { critical: 0, warning: 1 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}