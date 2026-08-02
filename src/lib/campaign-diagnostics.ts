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
  };
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
    top_insight: ""
  };

  if (inboundMessages.length > 0) {
    const positiveWords = /obrigado|gostei|quero|interessante|agendar|marcar|bom|excelente/i;
    const negativeWords = /nao quero|remover|spam|pare|ruim|pessimo|desinscrever/i;

    for (const msg of inboundMessages) {
      if (positiveWords.test(msg.content)) sentiment.positive++;
      else if (negativeWords.test(msg.content)) sentiment.negative++;
      else sentiment.neutral++;
    }

    const totalInbound = inboundMessages.length;
    sentiment.summary = `Analisamos ${totalInbound} respostas. `;
    if (sentiment.positive > sentiment.negative) {
      sentiment.summary += "O sentimento geral é predominante POSITIVO.";
      sentiment.top_insight = "Os leads estão reagindo bem à sua proposta de valor.";
    } else if (sentiment.negative > sentiment.positive) {
      sentiment.summary += "O sentimento geral é predominante NEGATIVO.";
      sentiment.top_insight = "Alta taxa de rejeição. Considere suavizar o tom da abordagem.";
      recommendations.push({
        type: "warning",
        title: "Rejeição de Conteúdo",
        description: "Detectamos sentimentos negativos nas respostas recentes via FATOR X.",
        action: "Revise o template da mensagem para ser menos invasivo."
      });
    } else {
      sentiment.summary += "O sentimento geral é NEUTRO.";
      sentiment.top_insight = "As respostas são puramente informativas ou de descadastro padrão.";
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
