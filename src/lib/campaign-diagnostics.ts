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
    // Melhoria 045: Critérios refinados de análise de sentimento
    // Regex expandida para capturar variações, gírias e intenções implícitas em PT-BR
    const positiveWords = /obrigado|gostei|quero|interessante|agendar|marcar|bom|excelente|tenho interesse|me ligue|faz sentido|concordo|topo|bora|maravilha|show/i;
    // Captura rejeição agressiva, sarcasmo ("nao enche") e sinalizações de LGPD/Spam
    const negativeWords = /nao quero|remover|spam|pare|ruim|pessimo|desinscrever|sai fora|nao enche|inconveniente|abusivo|descadastrar|nunca mais/i;
    // Critério de Neutralidade Ativa: Dúvidas técnicas ou respostas automáticas (Out of Office)
    const neutralWords = /qual o valor|como funciona|quem e voce|ausente|ferias|retorno em breve|onde conseguiu/i;

    const termMap = new Map<string, number>();
    const phraseMap = new Map<string, number>();
    
    for (const msg of inboundMessages) {
      const content = msg.content;
      
      // Lógica de Precedência de Rótulo (Refinamento de Precisão)
      // Se contiver palavras negativas, o risco reputacional torna o rótulo negativo prioritário
      if (negativeWords.test(content)) {
        sentiment.negative++;
      }
      else if (positiveWords.test(content)) {
        sentiment.positive++;
        // Termos isolados (unigramas) relevantes
        content
          .split(/[\s,.;!?]+/)
          .map(normalizeToken)
          .filter((t) => t.length > 3 && !STOPWORDS.has(t))
          .forEach((t) => termMap.set(t, (termMap.get(t) ?? 0) + 1));
        // Frases recorrentes (bigramas/trigramas)
        extractPhrases(content, phraseMap);
      }
      else if (neutralWords.test(content)) {
        sentiment.neutral++;
      }
      else {
        // Fallback: Se não casar com nenhum critério explícito, classificar como neutro/ambíguo
        sentiment.neutral++;
      }
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
    
    // Limiares Dinâmicos de Alerta
    const NEGATIVE_THRESHOLD = 35; // Reduzido de 40 para 35 para alerta precoce
    const POSITIVE_THRESHOLD_FOR_SCALING = 60; // Novo limiar para sugestão de escala
    
    sentiment.threshold_alert = sentiment.negative_rate >= NEGATIVE_THRESHOLD;

    sentiment.summary = `Analisamos ${totalInbound} respostas. `;
    
    // Matriz de Insights Acionáveis Refinada
    if (sentiment.threshold_alert) {
      sentiment.summary += "CRÍTICO: A rejeição atingiu níveis de alerta.";
      sentiment.top_insight = "Padrão de fadiga ou intrusividade detectado no público alvo.";
      
      recommendations.push({
        type: "error",
        title: "🛡️ SHIELD: Alerta de Reputação",
        description: `Negatividade em ${sentiment.negative_rate.toFixed(1)}% (Threshold: ${NEGATIVE_THRESHOLD}%). Risco iminente de bloqueio de conta.`,
        action: "PAUSAR IMEDIATAMENTE. O copy está sendo percebido como invasivo ou irrelevante."
      });
    } else if (sentiment.positive_rate > POSITIVE_THRESHOLD_FOR_SCALING) {
      // Nota: sentiment.positive_rate seria calculado como (positive / totalInbound) * 100
      const posRate = (sentiment.positive / totalInbound) * 100;
      if (posRate >= POSITIVE_THRESHOLD_FOR_SCALING) {
        sentiment.summary += "EXCELENTE: Alta taxa de aceitação positiva.";
        sentiment.top_insight = "Sinal verde para escalonamento horizontal da campanha.";
        recommendations.push({
          type: "info",
          title: "📈 Oportunidade de Escala",
          description: `Aprovação de ${posRate.toFixed(1)}%. O script ressoa fortemente com o ICP.`,
          action: "Aumentar orçamento diário em 30% ou expandir volume de leads."
        });
      }
    }

    if (sentiment.positive > sentiment.negative && !sentiment.threshold_alert) {
      sentiment.summary += "Sentimento geral predominantemente POSITIVO.";
      sentiment.top_insight = "Os leads estão demonstrando interesse real nos benefícios apresentados.";
      
      recommendations.push({
        type: "info",
        title: "🎯 Refinamento de Copy",
        description: `Frases como "${sentiment.positive_phrases[0]?.phrase || 'proposta'}" estão gerando conversão.`,
        action: "Mantenha o tom empático e foque nos termos da nuvem no follow-up."
      });
    } else if (sentiment.negative > sentiment.positive && !sentiment.threshold_alert) {
      sentiment.summary += "Sentimento geral predominantemente NEGATIVO.";
      sentiment.top_insight = "Volume de negativas superior às positivas. Requer ajuste de abordagem.";
      
      recommendations.push({
        type: "warning",
        title: "⚠️ Ajuste de Tom Necessário",
        description: "A taxa de rejeição está crescendo. O público parece resistente à oferta direta.",
        action: "Suavize o CTA: troque 'Agende agora' por 'Podemos trocar uma ideia?'"
      });
    } else if (sentiment.neutral > (sentiment.positive + sentiment.negative)) {
      sentiment.summary += "Volume excessivo de respostas NEUTRAS.";
      sentiment.top_insight = "Falta de 'gancho' ou clareza. O lead entende, mas não se move.";
      
      recommendations.push({
        type: "info",
        title: "💡 Gatilho de Urgência",
        description: "Muitas respostas pedindo 'quem é' ou 'qual valor' indicam falha no contexto inicial.",
        action: "Insira uma prova social ou benefício quantificável nos primeiros 100 caracteres."
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
