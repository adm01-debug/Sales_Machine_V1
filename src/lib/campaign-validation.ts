/**
 * Regras de validação de criativos de campanha.
 *
 * Módulo isomórfico: roda no editor (feedback imediato) e no servidor
 * (`saveMarketingCampaign` / `launchMarketingCampaign`), que é a autoridade.
 */
import type { Channel } from "@/lib/audience-rules";
import { analyzeSms } from "@/lib/sms-segments";
import { parseVariables, unknownVariables } from "@/lib/template-vars";

export interface ValidationIssue {
  /** `error` bloqueia o lançamento; `warning` apenas alerta. */
  level: "error" | "warning";
  /** Rótulo da variante afetada, quando aplicável. */
  scope: string;
  message: string;
}

export interface VariantForValidation {
  label: string;
  subject?: string | null;
  body: string;
  media_url?: string | null;
  rcs_payload?: Record<string, unknown> | null;
  split_percent: number;
  /** Canal do template de origem, quando a variante veio da Biblioteca. */
  source_channel?: Channel | null;
}

export interface CampaignForValidation {
  name: string;
  channel: Channel;
  audience_id?: string | null;
  audience_size?: number | null;
  variants: VariantForValidation[];
}

/** Limite prático de caracteres por canal. */
export const CHANNEL_BODY_LIMIT: Record<Channel, number> = {
  whatsapp: 4096,
  email: 4000,
  sms: 1000,
  rcs: 2000,
  mms: 1600,
  linkedin: 1900,
  instagram: 1000,
};

export function validateCampaign(input: CampaignForValidation): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { channel, variants } = input;

  if (!input.name.trim()) {
    issues.push({ level: "error", scope: "Campanha", message: "Dê um nome à campanha." });
  }

  if (!input.audience_id) {
    issues.push({
      level: "error",
      scope: "Audiência",
      message: "Selecione uma audiência antes de lançar.",
    });
  } else if (input.audience_size === 0) {
    issues.push({
      level: "error",
      scope: "Audiência",
      message: "A audiência selecionada está vazia — atualize os membros.",
    });
  }

  if (variants.length === 0) {
    issues.push({ level: "error", scope: "Variantes", message: "Crie ao menos uma variante." });
    return issues;
  }

  const totalSplit = variants.reduce((acc, v) => acc + (v.split_percent || 0), 0);
  if (totalSplit !== 100) {
    issues.push({
      level: "error",
      scope: "Variantes",
      message: `A distribuição soma ${totalSplit}% — precisa somar exatamente 100%.`,
    });
  }

  const labels = new Set<string>();
  for (const variant of variants) {
    const scope = `Variante ${variant.label}`;

    if (labels.has(variant.label)) {
      issues.push({ level: "error", scope, message: "Rótulo de variante duplicado." });
    }
    labels.add(variant.label);

    const body = variant.body?.trim() ?? "";
    if (!body) {
      issues.push({ level: "error", scope, message: "O corpo da mensagem está vazio." });
      continue;
    }

    const limit = CHANNEL_BODY_LIMIT[channel];
    if (body.length > limit) {
      issues.push({
        level: "error",
        scope,
        message: `Corpo com ${body.length} caracteres excede o limite de ${limit} do canal ${channel}.`,
      });
    }

    if (channel === "email" && !variant.subject?.trim()) {
      issues.push({ level: "error", scope, message: "Campanhas de e-mail exigem assunto." });
    }
    if (channel !== "email" && variant.subject?.trim()) {
      issues.push({
        level: "warning",
        scope,
        message: "O assunto é ignorado fora do canal e-mail.",
      });
    }

    if (channel === "mms" && !variant.media_url) {
      issues.push({ level: "error", scope, message: "MMS exige uma mídia anexada." });
    }

    if (channel === "rcs") {
      const card = variant.rcs_payload as
        | { title?: string; description?: string; suggestions?: unknown[] }
        | null
        | undefined;
      if (!card || (!card.title?.trim() && !card.description?.trim())) {
        issues.push({
          level: "error",
          scope,
          message: "RCS exige um rich card com título ou descrição.",
        });
      } else if (Array.isArray(card.suggestions) && card.suggestions.length > 4) {
        issues.push({ level: "error", scope, message: "RCS aceita no máximo 4 ações sugeridas." });
      }
    }

    if (channel === "sms") {
      const seg = analyzeSms(body);
      if (seg.segments > 3) {
        issues.push({
          level: "warning",
          scope,
          message: `SMS com ${seg.segments} segmentos (${seg.encoding}) — custo multiplicado por ${seg.segments}.`,
        });
      }
    }

    const unknown = unknownVariables(`${variant.subject ?? ""}\n${body}`);
    for (const name of unknown) {
      issues.push({
        level: "error",
        scope,
        message: `Variável desconhecida {{${name}}} — remova ou use uma do catálogo.`,
      });
    }

    // Uma variável repetida no mesmo criativo gera um único aviso.
    const noFallback = new Set<string>();
    for (const parsed of parseVariables(`${variant.subject ?? ""}\n${body}`)) {
      if (parsed.key && !parsed.fallback) noFallback.add(parsed.key);
    }
    for (const key of noFallback) {
      issues.push({
        level: "warning",
        scope,
        message: `{{${key}}} não tem texto padrão — contatos sem esse dado receberão a mensagem com lacuna.`,
      });
    }

    if (variant.source_channel && variant.source_channel !== channel) {
      issues.push({
        level: "warning",
        scope,
        message: `Criativo veio de um template de ${variant.source_channel}, mas a campanha é ${channel}.`,
      });
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}