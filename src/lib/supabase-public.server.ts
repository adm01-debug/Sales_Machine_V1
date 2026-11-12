import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase com chave publicável para leituras públicas em SSR.
 * Respeita RLS como `anon` — nunca use para escrita privilegiada.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function publicDb(): any {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(process.env.SUPABASE_URL!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}
