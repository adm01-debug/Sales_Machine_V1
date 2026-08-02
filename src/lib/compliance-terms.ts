/**
 * Auditoria de conformidade por nicho (Melhoria 034).
 *
 * Motor puro e determinístico que audita um texto contra listas de termos
 * proibidos/restritos específicas do setor do cliente (saúde, financeiro,
 * jurídico, apostas, suplementos) somadas a termos customizados do workspace.
 *
 * Decisões de projeto:
 * - Normalização agressiva (NFD sem acento, leetspeak, separadores internos)
 *   para que "g4nh0 f4c.il" seja detectado como "ganho facil".
 * - Limites de palavra por `\p{L}\p{N}` para evitar falso positivo em
 *   substrings (ex.: "cura" dentro de "curadoria").
 * - Nenhum I/O: mesmo resultado no editor e no worker.
 */

export type ComplianceSeverity = "error" | "warning" | "info";

/** Nichos com listas embutidas mantidas pelo produto. */
export type ComplianceNiche =
  | "geral"
  | "saude"
  | "financeiro"
  | "juridico"
  | "apostas"
  | "suplementos";

export interface ComplianceRule {
  /** Termo ou expressão proibida/restrita (texto literal, sem regex). */
  term: string;
  severity: ComplianceSeverity;
  /** Motivo legal/regulatório exibido ao operador. */
  reason: string;
  /** Sugestão de reescrita segura. */
  suggestion?: string;
}

export interface ComplianceViolation extends ComplianceRule {
  niche: ComplianceNiche | "custom";
  /** Trecho normalizado encontrado no texto. */
  excerpt: string;
}

export interface ComplianceReport {
  violations: ComplianceViolation[];
  /** 0–100; 100 = nenhuma violação. */
  score: number;
  /** `true` quando há ao menos uma violação de severidade `error`. */
  blocked: boolean;
}

const SEVERITY_PENALTY: Record<ComplianceSeverity, number> = {
  error: 34,
  warning: 12,
  info: 4,
};

/** Listas embutidas por nicho — conservadoras e revisáveis pelo cliente. */
export const NICHE_RULES: Record<ComplianceNiche, readonly ComplianceRule[]> = {
  geral: [
    {
      term: "garantido",
      severity: "warning",
      reason: "Promessa absoluta de resultado pode configurar publicidade enganosa (CDC art. 37).",
      suggestion: "Troque por um resultado observado e mensurável.",
    },
    {
      term: "100% de resultado",
      severity: "error",
      reason: "Garantia absoluta de resultado é vedada pelo Código de Defesa do Consumidor.",
      suggestion: 'Use "resultados variam conforme o cenário".',
    },
    {
      term: "gratis para sempre",
      severity: "warning",
      reason: "Oferta perpétua sem lastro contratual gera risco de propaganda enganosa.",
    },
    {
      term: "ultima chance",
      severity: "info",
      reason: "Urgência artificial recorrente aumenta denúncia de spam.",
    },
  ],
  saude: [
    {
      term: "cura",
      severity: "error",
      reason: "Alegação de cura é vedada pela RDC 96/2008 da ANVISA.",
      suggestion: 'Prefira "auxilia no tratamento", com respaldo técnico.',
    },
    {
      term: "tratamento milagroso",
      severity: "error",
      reason: "Alegação terapêutica sem comprovação — infração sanitária.",
    },
    {
      term: "sem efeitos colaterais",
      severity: "error",
      reason: "Afirmação de segurança absoluta é proibida em publicidade de saúde.",
    },
    {
      term: "emagreca sem esforco",
      severity: "error",
      reason: "Promessa de emagrecimento sem comprovação é vedada pela ANVISA.",
    },
    {
      term: "aprovado pela anvisa",
      severity: "warning",
      reason: "A ANVISA registra produtos; não os endossa publicitariamente.",
      suggestion: 'Use "registro ANVISA nº ..." quando existir.',
    },
  ],
  financeiro: [
    {
      term: "rentabilidade garantida",
      severity: "error",
      reason: "Vedado pela Resolução CVM 20/2021 — rentabilidade passada não garante futura.",
      suggestion: 'Inclua "rentabilidade passada não é garantia de resultado futuro".',
    },
    {
      term: "lucro certo",
      severity: "error",
      reason: "Promessa de lucro pode configurar oferta irregular de valores mobiliários.",
    },
    {
      term: "investimento sem risco",
      severity: "error",
      reason: "Todo investimento possui risco — afirmação vedada pela CVM.",
    },
    {
      term: "renda passiva garantida",
      severity: "error",
      reason: "Padrão típico de pirâmide financeira; alto risco regulatório.",
    },
    {
      term: "dobre seu capital",
      severity: "warning",
      reason: "Projeção de retorno sem metodologia divulgada.",
    },
  ],
  juridico: [
    {
      term: "ganho de causa garantido",
      severity: "error",
      reason: "Vedado pelo Código de Ética da OAB (Provimento 205/2021).",
    },
    {
      term: "melhor advogado",
      severity: "error",
      reason: "Publicidade comparativa ou superlativa é vedada pela OAB.",
    },
    {
      term: "consulta gratis",
      severity: "warning",
      reason: "Captação de clientela mediante oferta é restrita pela OAB.",
    },
    {
      term: "receba seu dinheiro rapido",
      severity: "warning",
      reason: "Promessa de celeridade processual não é controlável pelo escritório.",
    },
  ],
  apostas: [
    {
      term: "aposta sem risco",
      severity: "error",
      reason: "Vedado pela Portaria SPA/MF 1.231/2024 — proibido sugerir ausência de risco.",
    },
    {
      term: "ganho facil",
      severity: "error",
      reason: "Proibido apresentar apostas como fonte de renda.",
    },
    {
      term: "metodo infalivel",
      severity: "error",
      reason: "Sugestão de infalibilidade é vedada na publicidade de apostas.",
    },
    {
      term: "bonus sem deposito",
      severity: "warning",
      reason: "Ofertas de bônus possuem restrição publicitária específica.",
    },
  ],
  suplementos: [
    {
      term: "substitui refeicao",
      severity: "error",
      reason: "Alegação vedada para suplementos alimentares (RDC 243/2018).",
    },
    {
      term: "queima gordura",
      severity: "error",
      reason: "Alegação funcional não autorizada pela ANVISA.",
    },
    {
      term: "resultado em 7 dias",
      severity: "warning",
      reason: "Prazo de resultado sem estudo clínico é publicidade enganosa.",
    },
  ],
};

/** Substituições típicas de ofuscação (leetspeak) usadas para burlar filtros. */
const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "@": "a",
  $: "s",
};

/**
 * Normaliza para comparação: remove acentos, resolve leetspeak, elimina
 * separadores internos e colapsa espaços.
 */
export function normalizeForCompliance(value: string): string {
  const deaccented = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const deleeted = deaccented.replace(/[01345@$]/g, (c) => LEET_MAP[c] ?? c);
  return deleeted
    .replace(/(?<=[a-z])[.\-_*|/\\]+(?=[a-z])/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function matcherFor(term: string): RegExp {
  const normalized = normalizeForCompliance(term);
  const pattern = escapeRegExp(normalized).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "u");
}

export interface ComplianceAuditInput {
  text: string;
  /** Nichos ativos do cliente. Padrão: apenas `geral`. */
  niches?: readonly ComplianceNiche[];
  /** Termos proibidos cadastrados pelo próprio cliente. */
  customRules?: readonly ComplianceRule[];
}

/** Audita o texto contra as listas do nicho e os termos customizados. */
export function auditCompliance(input: ComplianceAuditInput): ComplianceReport {
  const text = (input.text ?? "").trim();
  if (!text) return { violations: [], score: 100, blocked: false };

  const haystack = normalizeForCompliance(text);
  const violations: ComplianceViolation[] = [];
  const seen = new Set<string>();

  const niches: readonly ComplianceNiche[] = input.niches?.length ? input.niches : ["geral"];
  const scoped: Array<{ niche: ComplianceNiche | "custom"; rule: ComplianceRule }> = [];
  for (const niche of niches) {
    for (const rule of NICHE_RULES[niche] ?? []) scoped.push({ niche, rule });
  }
  for (const rule of input.customRules ?? []) {
    if (rule.term?.trim()) scoped.push({ niche: "custom", rule });
  }

  for (const { niche, rule } of scoped) {
    const key = normalizeForCompliance(rule.term);
    if (!key || seen.has(key)) continue;
    const match = matcherFor(rule.term).exec(haystack);
    if (!match) continue;
    seen.add(key);
    violations.push({ ...rule, niche, excerpt: match[0] });
  }

  const order: Record<ComplianceSeverity, number> = { error: 0, warning: 1, info: 2 };
  violations.sort((a, b) => order[a.severity] - order[b.severity]);

  const penalty = violations.reduce((sum, v) => sum + SEVERITY_PENALTY[v.severity], 0);
  return {
    violations,
    score: Math.max(0, 100 - penalty),
    blocked: violations.some((v) => v.severity === "error"),
  };
}

/** Rótulo curto para exibição do nicho. */
export const NICHE_LABELS: Record<ComplianceNiche | "custom", string> = {
  geral: "Geral / CDC",
  saude: "Saúde / ANVISA",
  financeiro: "Financeiro / CVM",
  juridico: "Jurídico / OAB",
  apostas: "Apostas / SPA-MF",
  suplementos: "Suplementos / ANVISA",
  custom: "Lista do cliente",
};