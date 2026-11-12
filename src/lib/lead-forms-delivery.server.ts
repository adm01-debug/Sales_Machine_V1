/**
 * Entrega da confirmação de double opt-in.
 *
 * O provedor de envio (SINGU) só aceita destinatários já cadastrados como
 * contato, e um lead recém-captado ainda não existe lá. Por isso o link é
 * persistido no próprio envio e registrado como evento auditável, de onde o
 * operador (ou um worker futuro de e-mail transacional) faz a entrega.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export function buildConfirmUrl(token: string): string {
  const base = (process.env.PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  return `${base}/confirmar?token=${token}`;
}

export async function deliverConfirmation(
  db: Db,
  submissionId: string,
  token: string,
): Promise<{ delivered: boolean; url: string }> {
  const url = buildConfirmUrl(token);

  const { data: sub } = await db
    .from("lead_form_submissions")
    .select("id, email, payload, form_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) return { delivered: false, url };

  await db
    .from("lead_form_submissions")
    .update({ payload: { ...(sub.payload ?? {}), confirm_url: url } })
    .eq("id", submissionId);

  await db.from("sales_machine_events").insert({
    source: "manual",
    event_type: "lead_form.confirmation_pending",
    external_id: `lead_form_confirm:${submissionId}`,
    payload: {
      submission_id: submissionId,
      form_id: sub.form_id,
      email: sub.email,
      confirm_url: url,
    },
  });

  return { delivered: true, url };
}
