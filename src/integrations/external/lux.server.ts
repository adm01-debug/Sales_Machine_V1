import { getExternalConfig, assertConfigured } from "./config.server";

/**
 * Thin typed wrapper around the LUX (PROMO LUX - V2) edge functions.
 * All calls are server-only — never import this from client-reachable code.
 */

async function luxFetch(path: string, init: RequestInit = {}) {
  assertConfigured("lux");
  const { baseUrl, serviceKey } = getExternalConfig("lux");
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (serviceKey) headers.set("authorization", `Bearer ${serviceKey}`);
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[LUX ${res.status}] ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

export const luxClient = {
  /** GET public-api resource=companies with optional ICP filter. */
  listCompanies: (params: { icp_id?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams({ resource: "companies" });
    if (params.icp_id) qs.set("icp_id", params.icp_id);
    if (params.limit) qs.set("limit", String(params.limit));
    return luxFetch(`/functions/v1/public-api?${qs.toString()}`, {
      method: "GET",
    });
  },

  /** Ask LUX to search decision-makers for a company. */
  searchDecisors: (input: { company_id: string; roles?: string[] }) =>
    luxFetch("/functions/v1/oracle-search-decisors", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** Enrich a specific contact via Lusha through LUX. */
  enrichContact: (input: { contact_id?: string; email?: string; linkedin_url?: string }) =>
    luxFetch("/functions/v1/oracle-enrich-contact", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};