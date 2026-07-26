import { getExternalConfig, assertConfigured } from "./config.server";

/**
 * Thin typed wrapper around FUXICO (tracking de e-mail). Server-only.
 * FUXICO é o sistema oficial de rastreio: pixel de abertura, links
 * rastreados, histórico de acessos e eventos de bounce.
 */

async function fuxicoFetch(path: string, init: RequestInit = {}) {
  assertConfigured("fuxico");
  const { baseUrl, serviceKey } = getExternalConfig("fuxico");
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (serviceKey) headers.set("authorization", `Bearer ${serviceKey}`);
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[FUXICO ${res.status}] ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

export interface FuxicoTracking {
  trackingId: string;
  pixelUrl: string;
  pixelHtml: string;
  wrappedLinks: Array<{ original: string; wrapped: string; linkId: string }>;
}

export const fuxicoClient = {
  /** Indica se o FUXICO está configurado neste ambiente. */
  isConfigured: (): boolean => !!getExternalConfig("fuxico").baseUrl,

  /** Cria um rastreio e devolve pixel + links reescritos. */
  createTracking: async (input: {
    recipientEmail: string;
    subject?: string;
    senderEmail?: string;
    links?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<FuxicoTracking> => {
    const res = (await fuxicoFetch("/functions/v1/create-tracking", {
      method: "POST",
      body: JSON.stringify(input),
    })) as FuxicoTracking | null;
    if (!res?.trackingId) throw new Error("FUXICO create-tracking sem trackingId");
    return { ...res, wrappedLinks: res.wrappedLinks ?? [] };
  },

  getStats: (params: { limit?: number; status?: "all" | "opened" | "clicked" | "bounced" } = {}) => {
    const qs = new URLSearchParams();
    qs.set("limit", String(params.limit ?? 50));
    qs.set("status", params.status ?? "all");
    return fuxicoFetch(`/functions/v1/get-tracking-stats?${qs.toString()}`, { method: "GET" });
  },

  getHistory: (input: { trackingId: string }) =>
    fuxicoFetch(`/functions/v1/get-tracking-history?t=${encodeURIComponent(input.trackingId)}`, {
      method: "GET",
    }),
};