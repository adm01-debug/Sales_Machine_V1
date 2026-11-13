import { z } from "zod";

/**
 * Contrato puro dos formulários públicos de captação.
 * Compartilhado entre editor (cliente), página pública (SSR) e servidor,
 * para que a validação seja idêntica nos três lugares.
 */

export const LEAD_FIELD_TYPES = [
  "text",
  "email",
  "phone",
  "textarea",
  "select",
  "checkbox",
] as const;
export type LeadFieldType = (typeof LEAD_FIELD_TYPES)[number];

export const FIELD_TYPE_LABEL: Record<LeadFieldType, string> = {
  text: "Texto",
  email: "E-mail",
  phone: "Telefone",
  textarea: "Texto longo",
  select: "Lista de opções",
  checkbox: "Caixa de seleção",
};

export const leadFieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "Use apenas letras minúsculas, números e _"),
  label: z.string().min(1).max(120),
  type: z.enum(LEAD_FIELD_TYPES),
  required: z.boolean().default(false),
  placeholder: z.string().max(120).optional(),
  options: z.array(z.string().min(1).max(80)).default([]),
});
export type LeadField = z.infer<typeof leadFieldSchema>;

export const LEAD_FORM_STATUSES = ["draft", "published", "archived"] as const;
export type LeadFormStatus = (typeof LEAD_FORM_STATUSES)[number];

export const LEAD_FORM_STATUS_LABEL: Record<LeadFormStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
};

export const leadFormSchema = z.object({
  name: z.string().min(1, "Informe um nome").max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,62}$/, "Endereço inválido (use letras minúsculas, números e -)"),
  title: z.string().max(160).default(""),
  description: z.string().max(600).nullable().default(null),
  fields: z.array(leadFieldSchema).min(1, "Adicione ao menos um campo").max(20),
  submit_label: z.string().min(1).max(40).default("Enviar"),
  success_message: z.string().min(1).max(400).default("Recebemos seus dados. Obrigado!"),
  consent_text: z.string().min(1).max(600),
  double_opt_in: z.boolean().default(true),
  confirm_ttl_hours: z.number().int().min(1).max(720).default(48),
  channel: z
    .enum(["email", "whatsapp", "sms", "rcs", "mms", "linkedin", "instagram"])
    .default("email"),
  journey_id: z.string().uuid().nullable().default(null),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  status: z.enum(LEAD_FORM_STATUSES).default("draft"),
});
export type LeadFormInput = z.infer<typeof leadFormSchema>;

/** Nome do campo-armadilha: preenchido apenas por robôs. */
export const HONEYPOT_KEY = "_hp";

/** Interpreta a definição de campos vinda do banco, ignorando lixo. */
export function parseFieldsSafe(raw: unknown): LeadField[] {
  const parsed = leadFieldSchema.array().safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/, "");
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v) ? v : null;
}

/** Normaliza para E.164 assumindo Brasil quando o DDI não vem informado. */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.startsWith("55")) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

export interface SubmissionResult {
  ok: boolean;
  errors: Record<string, string>;
  values: Record<string, string | boolean>;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  companyName: string | null;
  isBot: boolean;
}

/**
 * Valida os valores enviados contra a definição do formulário.
 * Nunca lança: devolve os erros por campo para exibição na página pública.
 */
export function validateSubmission(
  fields: LeadField[],
  raw: Record<string, unknown>,
  consentGiven: boolean,
): SubmissionResult {
  const errors: Record<string, string> = {};
  const values: Record<string, string | boolean> = {};
  const isBot = typeof raw[HONEYPOT_KEY] === "string" && raw[HONEYPOT_KEY] !== "";

  for (const field of fields) {
    const input = raw[field.key];

    if (field.type === "checkbox") {
      const checked = input === true || input === "true" || input === "on";
      if (field.required && !checked) errors[field.key] = "Campo obrigatório";
      values[field.key] = checked;
      continue;
    }

    const text = typeof input === "string" ? input.trim() : "";
    if (!text) {
      if (field.required) errors[field.key] = "Campo obrigatório";
      continue;
    }
    if (text.length > 2000) {
      errors[field.key] = "Texto muito longo";
      continue;
    }
    if (field.type === "email" && !normalizeEmail(text)) {
      errors[field.key] = "E-mail inválido";
      continue;
    }
    if (field.type === "phone" && !normalizePhone(text)) {
      errors[field.key] = "Telefone inválido";
      continue;
    }
    if (field.type === "select" && field.options.length > 0 && !field.options.includes(text)) {
      errors[field.key] = "Opção inválida";
      continue;
    }
    values[field.key] = field.type === "email" ? (normalizeEmail(text) as string) : text;
  }

  if (!consentGiven) errors.__consent = "É preciso aceitar o consentimento para continuar";

  const pick = (types: LeadFieldType[], keys: string[]): string | null => {
    for (const field of fields) {
      const match = types.includes(field.type) || keys.includes(field.key);
      const value = values[field.key];
      if (match && typeof value === "string" && value) return value;
    }
    return null;
  };

  const email = pick(["email"], ["email"]);
  const phoneRaw = pick(["phone"], ["telefone", "phone", "whatsapp"]);

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    values,
    email,
    phone: phoneRaw ? normalizePhone(phoneRaw) : null,
    fullName: pick([], ["nome", "name", "full_name", "nome_completo"]),
    companyName: pick([], ["empresa", "company", "company_name"]),
    isBot,
  };
}

/** Campos padrão de um formulário novo. */
export const DEFAULT_FIELDS: LeadField[] = [
  { key: "nome", label: "Nome", type: "text", required: true, options: [] },
  { key: "email", label: "E-mail", type: "email", required: true, options: [] },
  { key: "empresa", label: "Empresa", type: "text", required: false, options: [] },
];
