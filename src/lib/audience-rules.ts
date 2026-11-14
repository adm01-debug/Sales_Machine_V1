/**
 * Regras de audiência — schema compartilhado entre UI e servidor.
 *
 * As regras nunca contêm SQL. São um objeto declarativo que o servidor
 * traduz para filtros parametrizados sobre `v_contact_profiles`.
 */
import { z } from "zod";

export const CHANNELS = [
  "whatsapp",
  "email",
  "sms",
  "rcs",
  "mms",
  "linkedin",
  "instagram",
] as const;

export type Channel = (typeof CHANNELS)[number];

export const audienceRulesSchema = z.object({
  /** company | person — vazio significa todos. */
  kinds: z.array(z.enum(["company", "person"])).default([]),
  /** Busca textual no nome de exibição. */
  search: z.string().max(120).default(""),
  /** Setores (metadata.industry) — vazio significa todos. */
  industries: z.array(z.string().min(1)).default([]),
  /** Score mínimo de sinal (decaimento exponencial já aplicado na view). */
  min_signal_score: z.number().min(0).max(1000).default(0),
  /** Exige consentimento válido no canal informado. */
  require_consent_channel: z.enum(CHANNELS).optional(),
  /** Só quem teve algum toque nos últimos N dias (0 = ignora). */
  engaged_within_days: z.number().int().min(0).max(365).default(0),
  /** Exclui quem recebeu contato nas últimas N horas (0 = ignora). */
  exclude_contacted_hours: z.number().int().min(0).max(2160).default(0),
  /** Exclui quem nunca foi contatado (útil para reativação). */
  only_previously_contacted: z.boolean().default(false),
  /** Teto de membros materializados. */
  limit: z.number().int().min(1).max(5000).default(1000),
});

export type AudienceRules = z.infer<typeof audienceRulesSchema>;

export const defaultAudienceRules: AudienceRules = audienceRulesSchema.parse({});

export function parseRules(raw: unknown): AudienceRules {
  const result = audienceRulesSchema.safeParse(raw ?? {});
  return result.success ? result.data : defaultAudienceRules;
}
