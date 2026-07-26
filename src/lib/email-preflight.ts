/**
 * Pré-voo de entregabilidade de e-mail (Fase 3 — Melhoria 026).
 *
 * Módulo puro e determinístico: recebe assunto + blocos e devolve uma lista de
 * achados classificados e um score 0–100. É usado no Compositor antes de salvar
 * e pode ser reaproveitado por workers/validações de campanha.
 *
 * As heurísticas seguem práticas consolidadas de deliverability:
 * clipping do Gmail (>102KB), proporção texto/imagem, presença de link de
 * descadastro, assunto em CAIXA ALTA, gatilhos de spam e encurtadores.
 */

import {
  renderEmailHtml,
  renderEmailText,
  safeUrl,
  type EmailBlock,
} from "./email-blocks";
import { parseVariables } from "./template-vars";

export type PreflightSeverity = "error" | "warning" | "info";

export interface PreflightFinding {
  /** Identificador estável da regra (útil para testes e telemetria). */
  code: string;
  severity: PreflightSeverity;
  message: string;
  /** Ação recomendada, em linguagem de operador. */
  hint?: string;
}

export interface PreflightReport {
  findings: PreflightFinding[];
  score: number;
  htmlBytes: number;
  textChars: number;
  imageCount: number;
  linkCount: number;
}

/** Limite a partir do qual o Gmail corta o corpo com "[Mensagem aparada]". */
export const GMAIL_CLIP_BYTES = 102_400;

/** Gatilhos clássicos de filtro de spam em PT-BR/EN. */
export const SPAM_TRIGGERS = [
  "grátis",
  "gratis",
  "100% grátis",
  "clique aqui",
  "promoção imperdível",
  "ganhe dinheiro",
  "renda extra",
  "urgente",
  "última chance",
  "sem custo",
  "risco zero",
  "free money",
  "act now",
  "viagra",
];

const SHORTENER_HOSTS = ["bit.ly", "tinyurl.com", "goo.gl", "t.co", "is.gd", "ow.ly", "cutt.ly"];

const UNSUBSCRIBE_RE =
  /(descadastr|desinscrev|cancelar inscri|sair da lista|unsubscribe|\{\{\s*unsubscribe\s*\}\})/i;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function collectUrls(blocks: EmailBlock[]): string[] {
  const urls: string[] = [];
  for (const block of blocks) {
    if (block.type === "button") {
      const url = safeUrl(block.url);
      if (url) urls.push(url);
    }
    if (block.type === "image") {
      const href = safeUrl(block.href);
      if (href) urls.push(href);
    }
    if (block.type === "text" || block.type === "heading") {
      for (const match of block.text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) urls.push(match[0]);
    }
  }
  return urls;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function upperRatio(value: string): number {
  const letters = value.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 8) return 0;
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, "").length;
  return upper / letters.length;
}

const SEVERITY_PENALTY: Record<PreflightSeverity, number> = {
  error: 25,
  warning: 10,
  info: 3,
};

/** Executa todas as heurísticas e devolve o relatório consolidado. */
export function preflightEmail(input: {
  subject: string;
  blocks: EmailBlock[];
}): PreflightReport {
  const { blocks } = input;
  const subject = (input.subject ?? "").trim();
  const findings: PreflightFinding[] = [];

  const html = renderEmailHtml(blocks, { subject });
  const text = renderEmailText(blocks);
  // Só heading/text contam como "texto real" — legendas de imagem não valem.
  const realText = blocks
    .filter((b): b is Extract<EmailBlock, { type: "heading" | "text" }> =>
      b.type === "heading" || b.type === "text",
    )
    .map((b) => b.text.trim())
    .join("\n\n")
    .trim();
  const htmlBytes = byteLength(html);
  const textChars = realText.length;
  const imageCount = blocks.filter((b) => b.type === "image").length;
  const urls = collectUrls(blocks);

  // --- Assunto ---
  if (!subject) {
    findings.push({
      code: "subject_missing",
      severity: "error",
      message: "Assunto vazio.",
      hint: "E-mails sem assunto são penalizados por praticamente todos os provedores.",
    });
  } else {
    if (subject.length > 78) {
      findings.push({
        code: "subject_too_long",
        severity: "warning",
        message: `Assunto com ${subject.length} caracteres.`,
        hint: "Mantenha até 78 caracteres para não truncar no mobile.",
      });
    }
    if (upperRatio(subject) > 0.6) {
      findings.push({
        code: "subject_uppercase",
        severity: "warning",
        message: "Assunto majoritariamente em CAIXA ALTA.",
        hint: "Caixa alta é um gatilho clássico de filtro de spam.",
      });
    }
    if ((subject.match(/[!?]/g) ?? []).length >= 3) {
      findings.push({
        code: "subject_punctuation",
        severity: "warning",
        message: "Excesso de pontuação no assunto (! ou ?).",
        hint: "Use no máximo um ponto de exclamação.",
      });
    }
  }

  // --- Conteúdo ---
  if (blocks.length === 0) {
    findings.push({
      code: "no_blocks",
      severity: "error",
      message: "Nenhum bloco de conteúdo.",
      hint: "Adicione ao menos um bloco de texto.",
    });
  }

  if (htmlBytes > GMAIL_CLIP_BYTES) {
    findings.push({
      code: "gmail_clipping",
      severity: "error",
      message: `HTML com ${(htmlBytes / 1024).toFixed(0)}KB excede o limite do Gmail (100KB).`,
      hint: "Reduza o número de blocos ou encurte os textos.",
    });
  } else if (htmlBytes > GMAIL_CLIP_BYTES * 0.8) {
    findings.push({
      code: "gmail_clipping_near",
      severity: "warning",
      message: "HTML próximo do limite de 100KB do Gmail.",
      hint: "Acima de 102KB o Gmail corta o final da mensagem.",
    });
  }

  if (blocks.length > 0 && textChars < 120) {
    findings.push({
      code: "low_text",
      severity: imageCount > 0 && textChars === 0 ? "error" : "warning",
      message: `Apenas ${textChars} caracteres de texto real.`,
      hint: "E-mails só com imagem caem em spam. Escreva ao menos um parágrafo.",
    });
  }

  if (imageCount > 0 && textChars > 0 && textChars / imageCount < 80) {
    findings.push({
      code: "image_heavy",
      severity: "warning",
      message: "Proporção texto/imagem baixa.",
      hint: "Equilibre imagens com texto — mire em pelo menos 60% de texto.",
    });
  }

  const haystack = `${subject}\n${text}`.toLowerCase();
  const hits = SPAM_TRIGGERS.filter((t) => haystack.includes(t));
  if (hits.length > 0) {
    findings.push({
      code: "spam_words",
      severity: hits.length >= 3 ? "error" : "warning",
      message: `Gatilhos de spam encontrados: ${hits.slice(0, 5).join(", ")}.`,
      hint: "Reescreva com linguagem consultiva em vez de promocional agressiva.",
    });
  }

  // --- Links ---
  if (urls.length === 0) {
    findings.push({
      code: "no_links",
      severity: "info",
      message: "Nenhum link no e-mail.",
      hint: "Sem CTA clicável não há como medir conversão.",
    });
  }
  const shorteners = urls.filter((u) => SHORTENER_HOSTS.includes(hostOf(u)));
  if (shorteners.length > 0) {
    findings.push({
      code: "shortener",
      severity: "warning",
      message: "Uso de encurtador de URL.",
      hint: "Encurtadores públicos degradam a reputação; use domínio próprio.",
    });
  }
  if (urls.length > 12) {
    findings.push({
      code: "too_many_links",
      severity: "warning",
      message: `${urls.length} links no corpo.`,
      hint: "Muitos links aumentam a pontuação de spam. Foque em um CTA.",
    });
  }

  // --- Compliance ---
  if (!UNSUBSCRIBE_RE.test(`${text}\n${html}`)) {
    findings.push({
      code: "no_unsubscribe",
      severity: "error",
      message: "Sem link ou menção de descadastro.",
      hint: "LGPD e provedores exigem opt-out visível em e-mail de marketing.",
    });
  }

  // --- Personalização ---
  const vars = parseVariables(`${subject}\n${text}`);
  if (vars.length === 0) {
    findings.push({
      code: "no_personalization",
      severity: "info",
      message: "Nenhuma variável de personalização.",
      hint: "Use {{primeiro_nome}} ou {{empresa}} para elevar a taxa de resposta.",
    });
  }
  const noFallback = vars.filter((v) => v.key && !v.fallback);
  if (noFallback.length > 0) {
    findings.push({
      code: "var_without_fallback",
      severity: "info",
      message: `Variáveis sem fallback: ${noFallback.map((v) => v.raw).join(", ")}.`,
      hint: "Use {{empresa|sua empresa}} para evitar lacunas quando o dado faltar.",
    });
  }

  const penalty = findings.reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return { findings, score, htmlBytes, textChars, imageCount, linkCount: urls.length };
}

/** Rótulo curto do score, usado na UI. */
export function scoreLabel(score: number): "excelente" | "bom" | "atenção" | "crítico" {
  if (score >= 90) return "excelente";
  if (score >= 70) return "bom";
  if (score >= 45) return "atenção";
  return "crítico";
}

/**
 * Executa o pré-voo aceitando blocos OU corpo em texto puro.
 *
 * Campanhas antigas guardam apenas `body`; o motor de heurísticas trabalha com
 * blocos, então convertemos o texto em um bloco único antes de analisar.
 */
export function preflightEmailContent(input: {
  subject: string;
  blocks?: EmailBlock[] | null;
  body?: string | null;
}): PreflightReport {
  const blocks: EmailBlock[] =
    input.blocks && input.blocks.length > 0
      ? input.blocks
      : (input.body ?? "").trim()
        ? [{ id: "body", type: "text", text: (input.body ?? "").trim() }]
        : [];
  return preflightEmail({ subject: input.subject ?? "", blocks });
}

/** Achados que devem impedir o salvamento/lançamento. */
export function blockingFindings(report: PreflightReport): PreflightFinding[] {
  return report.findings.filter((f) => f.severity === "error");
}