/**
 * Pré-voo de qualidade para canais de mensagem curta (Melhoria 031).
 *
 * Complementa `email-preflight` cobrindo WhatsApp, SMS, RCS, MMS, LinkedIn e
 * Instagram. Módulo puro e determinístico: mesmas regras no editor e no
 * servidor. Todas as heurísticas são conservadoras — o objetivo é reduzir
 * bloqueio de número/perfil e custo desnecessário, não impedir o envio.
 */

import type { Channel } from "./audience-rules";
import { findSpamTriggers } from "./email-preflight";
import { analyzeSms } from "./sms-segments";
import { parseVariables } from "./template-vars";

export type MessageSeverity = "error" | "warning" | "info";

export interface MessageFinding {
  code: string;
  severity: MessageSeverity;
  message: string;
  hint?: string;
}

export interface MessagePreflightReport {
  findings: MessageFinding[];
  score: number;
  chars: number;
  linkCount: number;
  emojiCount: number;
  /** Segmentos calculados apenas para SMS; `null` nos demais canais. */
  smsSegments: number | null;
}

/** Canais tratados por este pré-voo (tudo que não é e-mail). */
export const SHORT_MESSAGE_CHANNELS: readonly Channel[] = [
  "whatsapp",
  "sms",
  "rcs",
  "mms",
  "linkedin",
  "instagram",
];

const SHORTENER_HOSTS = ["bit.ly", "tinyurl.com", "goo.gl", "t.co", "is.gd", "ow.ly", "cutt.ly"];

/** Canais em que o opt-out textual é exigido por regulação/plataforma. */
const OPTOUT_REQUIRED: readonly Channel[] = ["sms", "whatsapp"];

const OPTOUT_RE = /(sair|descadastr|cancelar|parar|opt[- ]?out|não quero|nao quero)/i;

/** Máximo de links tolerado por canal antes de virar sinal de spam. */
const MAX_LINKS: Record<Channel, number> = {
  sms: 1,
  whatsapp: 2,
  rcs: 2,
  mms: 2,
  linkedin: 2,
  instagram: 1,
  email: 12,
};

const SEVERITY_PENALTY: Record<MessageSeverity, number> = { error: 25, warning: 10, info: 3 };

const URL_RE = /(https?:\/\/[^\s<>"')]+)/gi;
// Faixas de emoji/pictogramas — suficiente para medir excesso, sem exatidão Unicode.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function upperRatio(value: string): number {
  const letters = value.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 12) return 0;
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, "").length;
  return upper / letters.length;
}

/** Executa as heurísticas do canal e devolve o relatório consolidado. */
export function preflightMessage(input: {
  channel: Channel;
  body: string;
  mediaUrl?: string | null;
}): MessagePreflightReport {
  const channel = input.channel;
  const body = (input.body ?? "").trim();
  const findings: MessageFinding[] = [];
  const urls = body.match(URL_RE) ?? [];
  const emojiCount = (body.match(EMOJI_RE) ?? []).length;
  const smsSegments = channel === "sms" ? analyzeSms(body).segments : null;

  if (!body) {
    findings.push({
      code: "empty_body",
      severity: "error",
      message: "A mensagem está vazia.",
      hint: "Escreva o corpo antes de validar a qualidade.",
    });
    return { findings, score: 0, chars: 0, linkCount: 0, emojiCount: 0, smsSegments };
  }

  // --- Reputação / spam ---
  const hits = findSpamTriggers(body);
  if (hits.length > 0) {
    findings.push({
      code: "spam_words",
      severity: hits.length >= 3 ? "error" : "warning",
      message: `Gatilhos de spam encontrados: ${hits.slice(0, 5).join(", ")}.`,
      hint: "Mensagens promocionais agressivas aumentam denúncia e bloqueio do número.",
    });
  }

  if (upperRatio(body) > 0.6) {
    findings.push({
      code: "all_caps",
      severity: "warning",
      message: "Mensagem majoritariamente em CAIXA ALTA.",
      hint: "Escreva como um humano escreveria — caixa alta soa como spam.",
    });
  }

  // --- Links ---
  const shorteners = urls.filter((u) => SHORTENER_HOSTS.includes(hostOf(u)));
  if (shorteners.length > 0) {
    findings.push({
      code: "shortener",
      severity: "warning",
      message: "Uso de encurtador de URL público.",
      hint: "Operadoras e o WhatsApp penalizam encurtadores; use domínio próprio.",
    });
  }
  if (urls.some((u) => u.toLowerCase().startsWith("http://"))) {
    findings.push({
      code: "insecure_link",
      severity: "warning",
      message: "Link sem HTTPS.",
      hint: "Links http:// são marcados como inseguros e reduzem o clique.",
    });
  }
  const maxLinks = MAX_LINKS[channel];
  if (urls.length > maxLinks) {
    findings.push({
      code: "too_many_links",
      severity: "warning",
      message: `${urls.length} links na mensagem (máximo recomendado: ${maxLinks}).`,
      hint: "Concentre em um único CTA para não parecer disparo em massa.",
    });
  }

  // --- Custo e formato ---
  if (smsSegments !== null && smsSegments > 3) {
    findings.push({
      code: "sms_segments",
      severity: "warning",
      message: `SMS com ${smsSegments} segmentos (${analyzeSms(body).encoding}) — custo multiplicado por ${smsSegments}.`,
      hint: "Reduza o texto ou mova o detalhe para uma página de destino.",
    });
  }
  if (channel === "sms" && analyzeSms(body).encoding === "UCS-2") {
    findings.push({
      code: "sms_unicode",
      severity: "warning",
      message: "SMS em UCS-2 por causa de emoji ou caractere especial.",
      hint: "UCS-2 reduz o segmento de 160 para 70 caracteres e encarece o disparo.",
    });
  }
  if (emojiCount > 5) {
    findings.push({
      code: "emoji_heavy",
      severity: "warning",
      message: `${emojiCount} emojis na mensagem.`,
      hint: "Excesso de emoji é sinal clássico de disparo automatizado.",
    });
  }
  if ((channel === "mms" || channel === "rcs") && !input.mediaUrl) {
    findings.push({
      code: "no_media",
      severity: "info",
      message: "Nenhuma mídia anexada.",
      hint: "O diferencial de MMS/RCS é o conteúdo visual.",
    });
  }

  // --- Compliance ---
  if (OPTOUT_REQUIRED.includes(channel) && !OPTOUT_RE.test(body)) {
    findings.push({
      code: "no_optout",
      severity: "warning",
      message: "Sem instrução de saída (opt-out).",
      hint: 'Inclua algo como "responda SAIR para não receber mais".',
    });
  }

  // --- Personalização ---
  if (parseVariables(body).length === 0) {
    findings.push({
      code: "no_personalization",
      severity: "info",
      message: "Nenhuma variável de personalização.",
      hint: "Use {{primeiro_nome|olá}} para elevar a taxa de resposta.",
    });
  }

  const penalty = findings.reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
  return {
    findings,
    score: Math.max(0, Math.min(100, 100 - penalty)),
    chars: body.length,
    linkCount: urls.length,
    emojiCount,
    smsSegments,
  };
}

/** Achados que devem impedir o lançamento. */
export function blockingMessageFindings(report: MessagePreflightReport): MessageFinding[] {
  return report.findings.filter((f) => f.severity === "error");
}