/**
 * Classificação de sentimento leve (heurística PT-BR) compartilhada entre o
 * drill-down de campanhas e a base unificada de leads.
 */
export type Sentiment = "positive" | "neutral" | "negative";

const POSITIVE_RE = /obrigad|gostei|quero|interessante|interesse|agendar|marcar|reuni|proposta|catálogo|catalogo|bom|ótim|otim|excelente|pode enviar|vamos/i;
const NEGATIVE_RE = /n[ãa]o quero|n[ãa]o tenho interesse|remover|descadastr|sair|spam|pare|parem|ruim|p[ée]ssim|desinscrever|nunca mais|incomod/i;

/** Classifica um texto livre em positivo, negativo ou neutro. */
export function classifySentiment(text: string | null | undefined): Sentiment {
  if (!text) return "neutral";
  if (NEGATIVE_RE.test(text)) return "negative";
  if (POSITIVE_RE.test(text)) return "positive";
  return "neutral";
}

export interface LeadSentimentSummary {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  /** -100 (rejeição total) a +100 (altamente receptivo). */
  net_score: number;
  dominant: Sentiment | null;
}

/** Agrega uma lista de respostas inbound de um mesmo lead. */
export function summarizeLeadSentiment(texts: Array<string | null | undefined>): LeadSentimentSummary {
  const summary: LeadSentimentSummary = {
    positive: 0, neutral: 0, negative: 0, total: 0, net_score: 0, dominant: null,
  };
  for (const t of texts) {
    summary.total++;
    summary[classifySentiment(t)]++;
  }
  if (summary.total === 0) return summary;
  summary.net_score = Math.round(((summary.positive - summary.negative) / summary.total) * 100);
  summary.dominant =
    summary.positive >= summary.negative && summary.positive > 0
      ? "positive"
      : summary.negative > 0
        ? "negative"
        : "neutral";
  return summary;
}

export type ReplyPriority = "hot" | "warm" | "cold" | "blocked" | "unknown";

/**
 * Combina sinal (LUX/eventos) com sentimento das respostas para estimar a
 * probabilidade de resposta e priorizar a fila de abordagem.
 */
export function computeReplyPriority(
  signalScore: number,
  sentiment: LeadSentimentSummary,
): { priority: ReplyPriority; probability: number; label: string } {
  // Base 0-60 vinda do signal_score (saturado em 30 pontos de sinal).
  const signalPart = Math.min(60, (Math.max(0, signalScore) / 30) * 60);
  // Ajuste -40 .. +40 vindo do sentimento das respostas reais.
  const sentimentPart = sentiment.total > 0 ? (sentiment.net_score / 100) * 40 : 0;
  const probability = Math.max(0, Math.min(100, Math.round(signalPart + sentimentPart)));

  if (sentiment.negative > 0 && sentiment.net_score <= -50) {
    return { priority: "blocked", probability, label: "Rejeitou" };
  }
  if (sentiment.total === 0 && signalScore <= 0) {
    return { priority: "unknown", probability, label: "Sem sinal" };
  }
  if (probability >= 65) return { priority: "hot", probability, label: "Alta chance" };
  if (probability >= 35) return { priority: "warm", probability, label: "Média chance" };
  return { priority: "cold", probability, label: "Baixa chance" };
}

export const PRIORITY_ORDER: Record<ReplyPriority, number> = {
  hot: 0, warm: 1, cold: 2, unknown: 3, blocked: 4,
};
