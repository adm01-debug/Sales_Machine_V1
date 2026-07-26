import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  HONEYPOT_KEY,
  normalizePhone,
  parseFieldsSafe,
  validateSubmission,
  type LeadField,
} from "./lead-forms";

/**
 * Regras de servidor da captação de leads. Sem dependência de framework,
 * recebe o client Supabase por parâmetro para permitir testes com mock.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const newConfirmToken = (): string => randomBytes(24).toString("hex");

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export const parseFields = (raw: unknown): LeadField[] => parseFieldsSafe(raw);

export interface SubmitOutcome {
  status: "confirmed" | "pending" | "ignored";
  message: string;
  confirmToken?: string;
  submissionId?: string;
  errors?: Record<string, string>;
}

/**
 * Grava um envio público. Robôs (honeypot) recebem a mesma resposta de sucesso
 * para não revelarem a armadilha, mas nada é persistido.
 */
export async function handleSubmission(
  db: Db,
  args: {
    slug: string;
    values: Record<string, unknown>;
    consent: boolean;
    ipHash?: string | null;
    userAgent?: string | null;
  },
): Promise<SubmitOutcome> {
  const { data: form } = await db
    .from("lead_forms")
    .select("*")
    .eq("slug", args.slug)
    .eq("status", "published")
    .maybeSingle();
  if (!form) throw new Error("Formulário não encontrado");

  const fields = parseFields(form.fields);
  const result = validateSubmission(fields, args.values, args.consent === true);

  if (result.isBot) return { status: "ignored", message: form.success_message };
  if (!result.ok) {
    return { status: "ignored", message: "Revise os campos destacados.", errors: result.errors };
  }

  // Idempotência simples: reenvio do mesmo e-mail em até 5 min não duplica.
  if (result.email) {
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: recent } = await db
      .from("lead_form_submissions")
      .select("id, status")
      .eq("form_id", form.id)
      .eq("email", result.email)
      .gte("created_at", since)
      .limit(1);
    if (Array.isArray(recent) && recent.length > 0) {
      return {
        status: form.double_opt_in ? "pending" : "confirmed",
        message: form.success_message,
        submissionId: recent[0].id,
      };
    }
  }

  const doubleOptIn = form.double_opt_in === true;
  const token = doubleOptIn ? newConfirmToken() : undefined;
  const payload = { ...result.values };
  delete (payload as Record<string, unknown>)[HONEYPOT_KEY];

  const { data: inserted, error } = await db
    .from("lead_form_submissions")
    .insert({
      form_id: form.id,
      email: result.email,
      phone: result.phone ?? normalizePhone(result.values.telefone),
      full_name: result.fullName,
      company_name: result.companyName,
      payload,
      status: "pending",
      confirm_token_hash: token ? hashToken(token) : null,
      confirm_expires_at: token
        ? new Date(Date.now() + (form.confirm_ttl_hours ?? 48) * 3_600_000).toISOString()
        : null,
      ip_hash: args.ipHash ?? null,
      user_agent: args.userAgent?.slice(0, 300) ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (!doubleOptIn) {
    await activateSubmission(db, inserted.id);
    return { status: "confirmed", message: form.success_message, submissionId: inserted.id };
  }
  return {
    status: "pending",
    message: form.success_message,
    confirmToken: token,
    submissionId: inserted.id,
  };
}

/**
 * Efetiva o lead: cria/reaproveita o contato, registra o opt-in no
 * consent_ledger e inscreve na jornada vinculada (quando houver).
 */
export async function activateSubmission(db: Db, submissionId: string): Promise<string | null> {
  const { data: sub } = await db
    .from("lead_form_submissions")
    .select("*, lead_forms(id, channel, journey_id, slug, tags)")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) throw new Error("Envio não encontrado");
  if (sub.status === "confirmed") return sub.entity_id ?? null;

  const form = sub.lead_forms ?? {};
  let entityId: string | null = sub.entity_id ?? null;

  if (!entityId && sub.email) {
    const { data: existing } = await db
      .from("entity_map")
      .select("id")
      .eq("kind", "contact")
      .eq("metadata->>email", sub.email)
      .limit(1);
    if (Array.isArray(existing) && existing.length > 0) entityId = existing[0].id;
  }

  if (!entityId) {
    const { data: created, error } = await db
      .from("entity_map")
      .insert({
        kind: "contact",
        display_name: sub.full_name ?? sub.email ?? "Lead do formulário",
        metadata: {
          email: sub.email,
          phone: sub.phone,
          company_name: sub.company_name,
          source: "lead_form",
          form_slug: form.slug ?? null,
          tags: form.tags ?? [],
        },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    entityId = created.id;
  }

  await db.from("consent_ledger").insert({
    entity_id: entityId,
    channel: form.channel ?? "email",
    status: "opt_in",
    source: "import",
    reason: `lead_form:${form.slug ?? "desconhecido"}`,
    evidence: { submission_id: submissionId, confirmed_at: new Date().toISOString() },
  });

  await db
    .from("lead_form_submissions")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirm_token_hash: null,
      entity_id: entityId,
    })
    .eq("id", submissionId);

  if (form.journey_id && entityId) {
    const { data: active } = await db
      .from("journey_enrollments")
      .select("id")
      .eq("journey_id", form.journey_id)
      .eq("entity_id", entityId)
      .in("state", ["active", "waiting"])
      .limit(1);
    if (!Array.isArray(active) || active.length === 0) {
      await db.from("journey_enrollments").insert({
        journey_id: form.journey_id,
        entity_id: entityId,
        state: "active",
        context: { source: "lead_form", submission_id: submissionId },
      });
    }
  }

  return entityId;
}

/** Confirma o double opt-in a partir do token público. */
export async function confirmByToken(
  db: Db,
  token: string,
): Promise<{ ok: boolean; reason?: "invalid" | "expired" }> {
  if (!/^[0-9a-f]{16,}$/i.test(token)) return { ok: false, reason: "invalid" };
  const { data: sub } = await db
    .from("lead_form_submissions")
    .select("id, status, confirm_expires_at, confirm_token_hash")
    .eq("confirm_token_hash", hashToken(token))
    .maybeSingle();
  if (!sub) return { ok: false, reason: "invalid" };
  if (!safeEqualHex(sub.confirm_token_hash ?? "", hashToken(token))) {
    return { ok: false, reason: "invalid" };
  }
  if (sub.confirm_expires_at && new Date(sub.confirm_expires_at).getTime() < Date.now()) {
    await db.from("lead_form_submissions").update({ status: "discarded" }).eq("id", sub.id);
    return { ok: false, reason: "expired" };
  }
  await activateSubmission(db, sub.id);
  return { ok: true };
}