import { getExternalConfig, assertConfigured } from "./config.server";

/**
 * Thin typed wrapper around FATOR X (Nexus Agents Studio) runtime.
 * Invokes trained agents that will drive prospect conversations.
 */

async function fatorxFetch(path: string, init: RequestInit = {}) {
  assertConfigured("fatorx");
  const { baseUrl, serviceKey } = getExternalConfig("fatorx");
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (serviceKey) headers.set("authorization", `Bearer ${serviceKey}`);
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[FATORX ${res.status}] ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

export const fatorxClient = {
  /** Invoke a trained agent through the FATOR X workflow runner. */
  runAgent: (input: {
    agent_id?: string;
    thread_id: string;
    input: string;
    context?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) => {
    const { defaultAgentId } = getExternalConfig("fatorx");
    const agent_id = input.agent_id ?? defaultAgentId;
    if (!agent_id) throw new Error("FATORX_AGENT_ID_DEFAULT not set");
    return fatorxFetch("/functions/v1/agent-workflow-runner", {
      method: "POST",
      body: JSON.stringify({ ...input, agent_id }),
    });
  },

  quickTest: (input: { agent_id?: string; message: string }) =>
    fatorxFetch("/functions/v1/quick-agent-test", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  cerebroQuery: (input: { thread_id: string; query: string }) =>
    fatorxFetch("/functions/v1/cerebro-query", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};