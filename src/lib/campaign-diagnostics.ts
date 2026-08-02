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
    emoji_tone: { positive: 0, negative: 0, neutral: 0 } as {
      positive: number;
      negative: number;
      neutral: number;
    },
    top_emojis: [] as Array<{ emoji: string; count: number; tone: "positive" | "negative" | "neutral" }>,
  };

  if (inboundMessages.length > 0) {
    // Melhoria 047: Refinamento de critérios e limiares de análise de sentimento
    // Expansão das palavras-chave para maior cobertura de intenções e contextos brasileiros
    const positiveWords = /obrigado|gostei|quero|interessante|agendar|marcar|bom|excelente|tenho interesse|me ligue|faz sentido|concordo|topo|bora|maravilha|show|legal|perfeito|fechado|otimo|ótimo|obrigada/i;
    const negativeWords = /nao quero|remover|spam|pare|ruim|pessimo|péssimo|desinscrever|sai fora|nao enche|inconveniente|abusivo|descadastrar|nunca mais|bloquear|denunciar|chatice/i;
    // Identificação de respostas automáticas e consultas informativas para isolar ruído
    const neutralWords = /qual o valor|como funciona|quem e voce|ausente|ferias|férias|retorno em breve|onde conseguiu|duvida|dúvida|explicar/i;

    /**
     * Análise de contexto (Melhoria 048): adiamento ≠ rejeição.
     * "não agora", "depois", "mês que vem" indicam interesse futuro (NEUTRO/adiado),
     * enquanto "não quero", "não tenho interesse" são rejeição explícita (NEGATIVO).
     */
    const deferralWords =
      /n[aã]o (agora|no momento|neste momento|nesse momento|por enquanto|hoje)|agora n[aã]o|no momento n[aã]o|por enquanto n[aã]o|talvez (depois|mais para frente|futuramente)|me (chame|chama|procure|procura|retorne|retorna) (depois|em|no|na|mais tarde|mais para frente)|(volte|volta|retorne|retorna) a falar|(m[eê]s|semana|trimestre|ano) que vem|mais para frente|futuramente|deixa para (depois|o pr[oó]ximo)|estamos (avaliando|analisando)|vou (pensar|analisar|avaliar|ver)|preciso (pensar|avaliar|analisar)|sem (or[cç]amento|budget) (agora|no momento)|guardar (seu|o) contato/i;
    /** Rejeição explícita: prevalece sobre qualquer adiamento na mesma frase. */
    const hardRejectionWords =
      /n[aã]o (quero|tenho interesse|me interessa|interessa|preciso|use|utilizo)|sem interesse|n[aã]o insista|pare de (mandar|enviar)|me (tire|tira|remova|remove)|descadastr|desinscrev|nunca mais/i;

    const termMap = new Map<string, number>();
    const phraseMap = new Map<string, number>();
    const emojiMap = new Map<string, number>();
    let deferralCount = 0;
    
    for (const msg of inboundMessages) {
      const content = msg.content;

      // Melhoria 049: leitura de emojis como sinal emocional explícito.
      const emojiScore = scoreEmojis(content, emojiMap);
      if (emojiScore.positive > 0) sentiment.emoji_tone.positive += emojiScore.positive;
      if (emojiScore.negative > 0) sentiment.emoji_tone.negative += emojiScore.negative;
      if (emojiScore.neutral > 0) sentiment.emoji_tone.neutral += emojiScore.neutral;
      const emojiNet = emojiScore.positive - emojiScore.negative;
      
      // Precedência 1: rejeição explícita sempre vence (proteção reputacional).
      if (hardRejectionWords.test(content)) {
        sentiment.negative++;
      }
      // Precedência 1.5: emojis fortemente negativos (raiva/reprovação) sinalizam rejeição
      // mesmo quando o texto é curto ou ambíguo ("ok 😡", "👎").
      else if (emojiNet <= -1 && emojiScore.negative >= 1 && content.replace(EMOJI_REGEX, "").trim().length < 40) {
        sentiment.negative++;
      }
      // Precedência 2: adiamento — "não agora" é oportunidade futura, não rejeição.
      else if (deferralWords.test(content)) {
        sentiment.neutral++;
        deferralCount++;
      }
      // Precedência 3: demais marcadores negativos.
      else if (negativeWords.test(content)) {
        sentiment.negative++;
      }
      else if (positiveWords.test(content)) {
        sentiment.positive++;
        // Extração de insights para a nuvem de frases e termos
        content
          .split(/[\s,.;!?]+/)
          .map(normalizeToken)
          .filter((t) => t.length > 3 && !STOPWORDS.has(t))
          .forEach((t) => termMap.set(t, (termMap.get(t) ?? 0) + 1));
        extractPhrases(content, phraseMap);
      }
      else if (neutralWords.test(content)) {
        sentiment.neutral++;
      }
      // Mensagens sem texto relevante mas com emojis positivos ("👍", "🔥🔥") contam como aceite.
      else if (emojiNet >= 1) {
        sentiment.positive++;
        extractPhrases(content, phraseMap);
      }
      else {
        // Classificação residual como neutra/informativa
        sentiment.neutral++;
      }
    }

    sentiment.top_emojis = Array.from(emojiMap.entries())
      .map(([emoji, count]) => ({ emoji, count, tone: emojiTone(emoji) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

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
    
    // Limiares Dinâmicos de Alerta (Melhoria 046)
    const NEGATIVE_THRESHOLD_CRITICAL = 35; // Pausa automática
    const NEGATIVE_THRESHOLD_WARNING = 20;  // Ajuste de tom
    const POSITIVE_THRESHOLD_FOR_SCALING = 60; // Replanejar para cima
    
    sentiment.threshold_alert = sentiment.negative_rate >= NEGATIVE_THRESHOLD_CRITICAL;

    sentiment.summary = `Analisamos ${totalInbound} respostas. `;

    // Insight dedicado para leads adiados (contexto "não agora").
    const deferralRate = (deferralCount / totalInbound) * 100;
    if (deferralRate >= 15) {
      recommendations.push({
        type: "info",
        title: "⏳ Leads Adiados (não agora ≠ não quero)",
        description: `${deferralRate.toFixed(1)}% das respostas indicam adiamento, não rejeição. Esses contatos seguem elegíveis para novo contato.`,
        action: "AGENDAR NURTURING: mova esses leads para uma cadência de follow-up em 30-60 dias em vez de descartá-los.",
      });
    }
    
    // Matriz de Gatilhos Automáticos Refinada
    if (sentiment.negative_rate >= NEGATIVE_THRESHOLD_CRITICAL) {
      sentiment.summary += "GATILHO: Pausa automática por negatividade crítica.";
      sentiment.top_insight = "Intervenção necessária para proteger a reputação da marca.";
      
      recommendations.push({
        type: "error",
        title: "🛑 GATILHO: Pausa Automática",
        description: `Taxa de rejeição (${sentiment.negative_rate.toFixed(1)}%) superou o limite de segurança de ${NEGATIVE_THRESHOLD_CRITICAL}%.`,
        action: "PAUSAR IMEDIATAMENTE. O sistema sugere replanejar o ICP ou revisar drasticamente o copy."
      });
    } else if (sentiment.negative_rate >= NEGATIVE_THRESHOLD_WARNING) {
      sentiment.summary += "GATILHO: Ajuste de tom preventivo.";
      sentiment.top_insight = "Negatividade em crescimento. A campanha requer ajustes antes de escalar.";
      
      recommendations.push({
        type: "warning",
        title: "⚡ GATILHO: Ajuste de Rota",
        description: `Taxa de rejeição em ${sentiment.negative_rate.toFixed(1)}%. Limiar de atenção atingido.`,
        action: "AJUSTAR CTA. Suavize a abordagem para evitar o gatilho de pausa crítica."
      });
    } else {
      const posRate = (sentiment.positive / totalInbound) * 100;
      if (posRate >= POSITIVE_THRESHOLD_FOR_SCALING) {
        sentiment.summary += "GATILHO: Replanejamento para Escala.";
        sentiment.top_insight = "Sinal verde para expansão agressiva.";
        recommendations.push({
          type: "info",
          title: "🚀 GATILHO: Escalar Campanha",
          description: `Alta aceitação detectada (${posRate.toFixed(1)}%). O fit entre copy e público está validado.`,
          action: "REPLANEJAR VOLUME. Aumentar cadência de envios diários e expandir para novos segmentos similares."
        });
      }
    }

    if (sentiment.positive > sentiment.negative && !sentiment.threshold_alert) {
      sentiment.summary += "Sentimento geral predominantemente POSITIVO.";
      sentiment.top_insight = "Os leads estão demonstrando interesse real nos benefícios apresentados.";
      
      recommendations.push({
        type: "info",
        title: "🎯 Refinamento de Copy (Sucesso)",
        description: `O padrão detectado indica que o lead valoriza "${sentiment.positive_phrases[0]?.phrase || 'soluções objetivas'}".`,
        action: "ACELERAÇÃO: Reduza o tempo entre a primeira resposta e o agendamento. Reforce o CTA 'Agendar agora' no texto."
      });
    } else if (sentiment.negative > sentiment.positive && !sentiment.threshold_alert) {
      sentiment.summary += "Sentimento geral predominantemente NEGATIVO.";
      sentiment.top_insight = "Resistência à oferta detectada. Ajuste de abordagem sugerido.";
      
      recommendations.push({
        type: "warning",
        title: "⚠️ Ajuste de Copy (Objeção)",
        description: "O público está reagindo de forma defensiva ao tom imperativo ou à oferta direta.",
        action: "REDUÇÃO DE ATRITO: Troque CTAs de venda por convites de ajuda ('Posso te ajudar com X?' ou 'Você tem enfrentado Y?')."
      });
    } else if (sentiment.neutral > (sentiment.positive + sentiment.negative)) {
      sentiment.summary += "Volume excessivo de respostas NEUTRAS.";
      sentiment.top_insight = "Falta de diferenciação ou clareza na proposta de valor.";
      
      recommendations.push({
        type: "info",
        title: "💡 Ajuste de Copy (Engajamento)",
        description: "As respostas pedindo contexto extra indicam que o texto inicial é vago.",
        action: "INJEÇÃO DE CONTEXTO: Inclua um benefício quantificável (ex: 'Reduzimos X em 30%') antes do CTA para gerar curiosidade."
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
