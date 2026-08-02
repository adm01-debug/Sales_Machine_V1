import { ComplianceAuditInput, ComplianceViolation, auditCompliance } from "./compliance-terms";

export interface CampaignDiagnosis {
  score: number;
  recommendations: Array<{
    type: "error" | "warning" | "info";
    title: string;
    description: string;
    action?: string;
  }>;
  sentiment?: {
    positive: number;
    neutral: number;
    negative: number;
    summary: string;
    top_insight: string;
    negative_rate: number;
    threshold_alert: boolean;
    positive_terms: Array<{ term: string; count: number }>;
    /** Bigramas/trigramas recorrentes nas respostas positivas. */
    positive_phrases: Array<{ phrase: string; count: number }>;
  };
}

/** Palavras vazias PT-BR ignoradas na mineração de termos. */
const STOPWORDS = new Set([
  "este","esta","esse","essa","isso","aquele","aquela","para","pela","pelo","como","mais","muito",
  "quando","onde","porque","tambem","também","estou","estamos","somos","seria","sobre","entao","então",
  "voce","você","voces","vocês","tenho","temos","fazer","poder","posso","pode","podemos","gente",
  "nosso","nossa","aqui","hoje","amanha","amanhã","depois","antes","agora","favor","bem","sim",
  "dele","dela","deles","delas","numa","numas","havia","tinha","estava","apenas","ainda","que","com",
]);

function normalizeToken(raw: string): string {
  return raw.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, "");
}

/** Extrai bigramas e trigramas significativos de um texto positivo. */
function extractPhrases(text: string, target: Map<string, number>): void {
  const tokens = text
    .split(/[\n,.;!?]+/)
    .flatMap((sentence) =>
      sentence.split(/\s+/).map(normalizeToken).filter(Boolean),
    );
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const gram = tokens.slice(i, i + n);
      // Descarta n-gramas que começam ou terminam em stopword ou palavra curta.
      const first = gram[0]!;
      const last = gram[gram.length - 1]!;
      if (STOPWORDS.has(first) || STOPWORDS.has(last)) continue;
      if (first.length < 3 || last.length < 3) continue;
      const phrase = gram.join(" ");
      target.set(phrase, (target.get(phrase) ?? 0) + 1);
    }
  }
}

/**
 * Gera um diagnóstico baseado no estado atual da campanha e seus erros.
 */
export function diagnoseCampaign(
  campaign: { name: string; channel?: string; objective?: string },
  errors: Array<{ message: string; count: number }>,
  stages: Array<{ stage: string; value: number }>,
  inboundMessages: Array<{ content: string }>
): CampaignDiagnosis {
  const recommendations: CampaignDiagnosis["recommendations"] = [];
  
  // 1. Análise de Sentimento (FATOR X - Simulado/Mock via análise de termos)
  const sentiment = {
    positive: 0,
    neutral: 0,
    negative: 0,
    summary: "",
    top_insight: "",
    negative_rate: 0,
    threshold_alert: false,
    positive_terms: [] as Array<{ term: string; count: number }>,
    positive_phrases: [] as Array<{ phrase: string; count: number }>,
  };

  if (inboundMessages.length > 0) {
    const positiveWords = /obrigado|gostei|quero|interessante|agendar|marcar|bom|excelente/i;
    const negativeWords = /nao quero|remover|spam|pare|ruim|pessimo|desinscrever/i;

    const termMap = new Map<string, number>();
    const phraseMap = new Map<string, number>();
    for (const msg of inboundMessages) {
      if (positiveWords.test(msg.content)) {
        sentiment.positive++;
        // Termos isolados (unigramas) relevantes
        msg.content
          .split(/[\s,.;!?]+/)
          .map(normalizeToken)
          .filter((t) => t.length > 3 && !STOPWORDS.has(t))
          .forEach((t) => termMap.set(t, (termMap.get(t) ?? 0) + 1));
        // Frases recorrentes (bigramas/trigramas)
        extractPhrases(msg.content, phraseMap);
      }
      else if (negativeWords.test(msg.content)) sentiment.negative++;
      else sentiment.neutral++;
    }

    sentiment.positive_terms = Array.from(termMap.entries())
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    sentiment.positive_phrases = Array.from(phraseMap.entries())
      .filter(([, count]) => count > 1)
      .map(([phrase, count]) => ({ phrase, count }))
      .sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length)
      .slice(0, 8);

    const totalInbound = inboundMessages.length;
    sentiment.negative_rate = (sentiment.negative / totalInbound) * 100;
    
    // Gatilho Automático: Limite configurável (default 40% conforme sugestão)
    const NEGATIVE_THRESHOLD = 40;
    sentiment.threshold_alert = sentiment.negative_rate >= NEGATIVE_THRESHOLD;

    sentiment.summary = `Analisamos ${totalInbound} respostas. `;
    if (sentiment.positive > sentiment.negative) {
      sentiment.summary += "O sentimento geral é predominante POSITIVO.";
      sentiment.top_insight = "Os leads estão reagindo bem à sua proposta de valor.";
      
      // Recomendação acionável para padrão positivo
      recommendations.push({
        type: "info",
        title: "🚀 Otimização de Performance",
        description: `Detectamos alta aceitação das frases "${sentiment.positive_phrases[0]?.phrase || 'proposta'}". O público valoriza clareza e agilidade.`,
        action: "Incorpore os termos da nuvem no CTA para acelerar o agendamento."
      });
    } else if (sentiment.negative > sentiment.positive) {
      sentiment.summary += "O sentimento geral é predominante NEGATIVO.";
      sentiment.top_insight = sentiment.threshold_alert 
        ? "CRÍTICO: Taxa de negatividade excedeu o limite de segurança." 
        : "Alta taxa de rejeição. Considere suavizar o tom da abordagem.";
      
      recommendations.push({
        type: sentiment.threshold_alert ? "error" : "warning",
        title: sentiment.threshold_alert ? "🛡️ SEGURANÇA: Bloqueio de Sentimento" : "⚠️ Alerta: Rejeição Elevada",
        description: sentiment.threshold_alert 
          ? `Taxa de negatividade em ${sentiment.negative_rate.toFixed(1)}% (Limite: ${NEGATIVE_THRESHOLD}%). Padrão de rejeição por intrusividade detectado.`
          : "FATOR X detectou volume incomum de sentimentos negativos. O CTA pode estar muito agressivo.",
        action: sentiment.threshold_alert 
          ? "PAUSAR IMEDIATAMENTE. Remova termos imperativos e foque em 'ajuda/consulta' no CTA." 
          : "Altere o CTA para uma pergunta aberta em vez de solicitação direta de reunião."
      });
    } else {
      sentiment.summary += "O sentimento geral é NEUTRO.";
      sentiment.top_insight = "As respostas são puramente informativas ou de descadastro padrão.";

      recommendations.push({
        type: "info",
        title: "💡 Ajuste de Engajamento",
        description: "As respostas neutras indicam que o texto não está gerando curiosidade ou urgência.",
        action: "Adicione um 'gancho' de benefício imediato antes do CTA para forçar uma decisão."
      });
    }
  }

  
  // 1. Diagnóstico de Erros Técnicos
  const connectionErrors = errors.filter(e => 
    /auth|token|invalid_key|permission|unauthorized/i.test(e.message)
  );
  
  if (connectionErrors.length > 0) {
    recommendations.push({
      type: "error",
      title: "Falha de Conexão/Autenticação",
      description: `Detectamos ${connectionErrors.length} tipos de erros relacionados a credenciais. Isso impede o envio de mensagens.`,
      action: "Verifique as chaves de API nas configurações do canal."
    });
  }

  const rateLimitErrors = errors.filter(e => 
    /rate.limit|too.many|quota|throttled/i.test(e.message)
  );
  
  if (rateLimitErrors.length > 0) {
    recommendations.push({
      type: "warning",
      title: "Limite de Frequência Excedido",
      description: "O canal está limitando a velocidade de envio. Isso pode causar atrasos na cadência.",
      action: "Aumente o intervalo entre envios ou use mais contas/números."
    });
  }

  // 2. Diagnóstico de Conteúdo (Simulado via Compliance se tivéssemos o texto, mas aqui usamos o nome/objetivo)
  // Nota: Em um cenário real, auditaríamos o template da variante.
  const contentAudit = auditCompliance({ text: campaign.name + " " + (campaign.objective ?? "") });
  for (const v of contentAudit.violations) {
    recommendations.push({
      type: v.severity,
      title: `Risco de Conformidade: "${v.excerpt}"`,
      description: v.reason,
      action: v.suggestion
    });
  }

  // 3. Diagnóstico de Funil
  const deadLetters = stages.find(s => s.stage === "Dead Letter")?.value ?? 0;
  const total = stages.reduce((acc, s) => acc + s.value, 0);
  
  if (total > 0 && (deadLetters / total) > 0.1) {
    recommendations.push({
      type: "error",
      title: "Alta Taxa de Abandono (Dead Letter)",
      description: `${((deadLetters / total) * 100).toFixed(1)}% dos envios falharam permanentemente sem sucesso após retentativas.`,
      action: "Revise a qualidade da sua lista de contatos ou a validade dos e-mails/números."
    });
  }

  const delivered = stages.find(s => s.stage === "Entregue")?.value ?? 0;
  const sent = stages.find(s => s.stage === "Enviado")?.value ?? 0;

  if (sent > 50 && (delivered / sent) < 0.7) {
    recommendations.push({
      type: "warning",
      title: "Baixa Entregabilidade",
      description: "Muitas mensagens são enviadas mas não marcadas como entregues. Possível bloqueio ou números inválidos.",
      action: "Verifique o status do seu remetente no painel do provedor."
    });
  }

  // Cálculo de Score básico
  let score = 100;
  score -= recommendations.filter(r => r.type === "error").length * 20;
  score -= recommendations.filter(r => r.type === "warning").length * 10;
  score -= recommendations.filter(r => r.type === "info").length * 5;

  return {
    score: Math.max(0, score),
    recommendations,
    sentiment: inboundMessages.length > 0 ? sentiment : undefined
  };
}
