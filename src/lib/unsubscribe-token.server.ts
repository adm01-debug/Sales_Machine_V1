import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Compact signed token for public unsubscribe links.
 * Format: base64url(payload).hex(hmac)
 * Payload: { e: entity_id, c: channel, x: exp_epoch }
 */

type Payload = { e: string; c: string; x: number };

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(str: string): Buffer {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, "base64");
}

function getSecret(): string {
  const s = process.env.SM_WEBHOOK_SECRET || process.env.AGENT_TOOL_TOKEN;
  if (!s) throw new Error("SM_WEBHOOK_SECRET not configured for unsubscribe tokens");
  return s;
}

export function signUnsubscribeToken(entityId: string, channel: string, ttlSeconds = 60 * 60 * 24 * 365): string {
  const payload: Payload = { e: entityId, c: channel, x: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = createHmac("sha256", getSecret()).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): { entityId: string; channel: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", getSecret()).update(body).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(b64urlDecode(body).toString("utf-8")) as Payload;
    if (!payload.e || !payload.c || typeof payload.x !== "number") return null;
    if (payload.x < Math.floor(Date.now() / 1000)) return null;
    return { entityId: payload.e, channel: payload.c };
  } catch {
    return null;
  }
}

/** Stop-word patterns per channel. Case-insensitive whole-word match. */
const STOP_WORDS = ["pare", "parar", "sair", "stop", "cancelar", "cancel", "unsubscribe", "descadastrar", "remover"];

export function detectStopWord(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase().replace(/[^\p{L}\s]/gu, " ");
  const tokens = new Set(normalized.split(/\s+/).filter(Boolean));
  return STOP_WORDS.some((w) => tokens.has(w));
}