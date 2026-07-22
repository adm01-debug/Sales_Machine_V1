import { getExternalConfig, assertConfigured } from "./config.server";

/**
 * Thin typed wrapper around SINGU CRM edge functions. Server-only.
 * SINGU owns contacts, interactions and channel execution (WhatsApp via
 * evolution-api, Email via sequence-processor, SMS via send-sms-campaign).
 */

async function singuFetch(path: string, init: RequestInit = {}) {
  assertConfigured("singu");
  const { baseUrl, serviceKey } = getExternalConfig("singu");
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (serviceKey) headers.set("authorization", `Bearer ${serviceKey}`);
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[SINGU ${res.status}] ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

export type SinguChannel = "whatsapp" | "email" | "sms";

export const singuClient = {
  enrichContacts: (input: { company_id?: string; contacts: unknown[] }) =>
    singuFetch("/functions/v1/enrich-contacts", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  nextBestAction: (input: { contact_id: string }) =>
    singuFetch("/functions/v1/next-best-action", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  playbook: (input: { contact_id: string; goal?: string }) =>
    singuFetch("/functions/v1/playbook-generator", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  sendWhatsapp: (input: { contact_id: string; message: string; media_url?: string }) =>
    singuFetch("/functions/v1/evolution-api", {
      method: "POST",
      body: JSON.stringify({ action: "sendMessage", ...input }),
    }),

  sendSms: (input: { contact_id: string; message: string }) =>
    singuFetch("/functions/v1/send-sms-campaign", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** SMS com mídia (MMS). O SINGU roteia para provedores que suportam MMS. */
  sendMms: (input: { contact_id: string; message: string; media_url: string }) =>
    singuFetch("/api/mms/send", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /**
   * RCS (Rich Communication Services): mensagens ricas com cards, imagens e
   * suggested actions. `rcs_payload` segue o formato:
   * { type: "rich_card", title, description, image_url, suggestions: [...] }
   */
  sendRcs: (input: {
    contact_id: string;
    message: string;
    rcs_payload?: Record<string, unknown>;
  }) =>
    singuFetch("/api/rcs/send", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  sendEmail: (input: {
    contact_id: string;
    subject: string;
    body: string;
    in_reply_to?: string;
    references?: string[];
  }) =>
    singuFetch("/functions/v1/send-email", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  runEmailSequence: (input: { contact_id: string; sequence_id: string }) =>
    singuFetch("/functions/v1/sequence-processor", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  logInteraction: (input: {
    contact_id: string;
    type: "whatsapp" | "call" | "email" | "meeting" | "note" | "social";
    content: string;
    initiated_by?: "us" | "them";
    sentiment?: "positive" | "neutral" | "negative";
  }) =>
    singuFetch("/functions/v1/incoming-webhook", {
      method: "POST",
      body: JSON.stringify({ kind: "interaction", ...input }),
    }),
};