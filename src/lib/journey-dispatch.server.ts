/**
 * Despacho de mensagens de jornada — camada server-only.
 *
 * Isola o efeito colateral (SINGU / adapters sociais / tracking FUXICO) do
 * motor puro `journey-engine.ts` e do worker `tick-journeys`.
 */

import { renderForContact } from "@/lib/template-vars";
import type { TableClient } from "./table-client";

export interface JourneyContact {
  id: string;
  display_name: string | null;
  singu_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface JourneyMessage {
  subject: string | null;
  body: string;
  media_url: string | null;
  rcs_payload: Record<string, unknown> | null;
}

type AnyClient = TableClient;

const SOCIAL = new Set(["linkedin", "instagram"]);
export const isSocialJourneyChannel = (channel: string): boolean => SOCIAL.has(channel);

/**
 * Resolve o conteúdo da etapa `send`: usa `config.body` quando existe, senão
 * carrega o `message_templates` referenciado. Devolve `null` quando não há
 * conteúdo utilizável (o worker marca a inscrição como falha).
 */
export async function resolveJourneyMessage(
  client: AnyClient,
  config: Record<string, unknown>,
  contact: JourneyContact,
): Promise<JourneyMessage | null> {
  let subject = typeof config.subject === "string" ? config.subject : null;
  let body = typeof config.body === "string" ? config.body.trim() : "";
  let mediaUrl = typeof config.media_url === "string" ? config.media_url : null;
  let rcsPayload =
    config.rcs_payload && typeof config.rcs_payload === "object"
      ? (config.rcs_payload as Record<string, unknown>)
      : null;

  const templateId = typeof config.template_id === "string" ? config.template_id.trim() : "";
  if (!body && templateId) {
    const { data: tpl } = await client
      .from("message_templates")
      .select("subject, body, media_url, rcs_payload, email_blocks")
      .eq("id", templateId)
      .maybeSingle();
    if (tpl) {
      subject = subject ?? (tpl.subject as string | null);
      body = String(tpl.body ?? "").trim();
      // Template de e-mail com design em blocos: envia o HTML gerado.
      if (tpl.email_blocks) {
        const { parseBlocks, renderEmailHtml } = await import("@/lib/email-blocks");
        const blocks = parseBlocks(tpl.email_blocks);
        if (blocks.length > 0) {
          body = renderEmailHtml(blocks, { subject: subject ?? undefined });
        }
      }
      mediaUrl = mediaUrl ?? (tpl.media_url as string | null);
      rcsPayload = rcsPayload ?? (tpl.rcs_payload as Record<string, unknown> | null) ?? null;
    }
  }

  if (!body) return null;

  const contactVars = { display_name: contact.display_name, metadata: contact.metadata };
  return {
    subject: subject ? renderForContact(subject, contactVars) : null,
    body: renderForContact(body, contactVars),
    media_url: mediaUrl,
    rcs_payload: rcsPayload,
  };
}

export interface DispatchResult {
  status: "sent" | "failed" | "skipped";
  error: string | null;
  provider?: string;
}

/** Executa o envio real no canal pedido. Lança apenas erros inesperados. */
export async function dispatchJourneyMessage(input: {
  channel: string;
  contact: JourneyContact;
  message: JourneyMessage;
  touchpointId: string | null;
  journeyId: string;
}): Promise<DispatchResult> {
  const { channel, contact, message } = input;

  if (isSocialJourneyChannel(channel)) {
    const { getSocialSender } = await import("@/integrations/social/types");
    const sender = getSocialSender(channel as "linkedin" | "instagram");
    const res = await sender.send(channel as "linkedin" | "instagram", {
      entity_id: contact.id,
      message: message.body,
    });
    return {
      status: res.status === "sent" ? "sent" : "failed",
      error: res.error ?? null,
      provider: res.provider,
    };
  }

  if (!contact.singu_id) {
    return { status: "skipped", error: "contato sem identificador no canal de envio" };
  }

  const { singuClient } = await import("@/integrations/external/singu.server");

  if (channel === "whatsapp") {
    await singuClient.sendWhatsapp({ contact_id: contact.singu_id, message: message.body });
  } else if (channel === "sms") {
    await singuClient.sendSms({ contact_id: contact.singu_id, message: message.body });
  } else if (channel === "mms") {
    if (!message.media_url) return { status: "failed", error: "etapa MMS sem media_url" };
    await singuClient.sendMms({
      contact_id: contact.singu_id,
      message: message.body,
      media_url: message.media_url,
    });
  } else if (channel === "rcs") {
    await singuClient.sendRcs({
      contact_id: contact.singu_id,
      message: message.body,
      rcs_payload: message.rcs_payload ?? undefined,
    });
  } else if (channel === "email") {
    const { withFuxicoTracking } = await import("@/lib/email-tracking.server");
    const recipientEmail = (contact.metadata?.email as string | undefined) ?? null;
    const subject = (message.subject ?? "Mensagem").slice(0, 120);
    const tracked = await withFuxicoTracking({
      body: message.body,
      recipientEmail,
      subject,
      metadata: {
        journey_id: input.journeyId,
        entity_id: contact.id,
        touchpoint_id: input.touchpointId,
      },
    });
    await singuClient.sendEmail({ contact_id: contact.singu_id, subject, body: tracked.body });
  } else {
    return { status: "failed", error: `canal não suportado: ${channel}` };
  }

  return { status: "sent", error: null };
}
