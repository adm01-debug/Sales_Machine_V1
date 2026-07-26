import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type DohAnswer = { name: string; type: number; TTL: number; data: string };

async function dohQuery(name: string, type: string): Promise<DohAnswer[]> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as { Answer?: DohAnswer[] };
  return json.Answer ?? [];
}

export const checkEmailDns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ domain: z.string().min(3).max(253) }).parse(d))
  .handler(async ({ data }) => {
    const domain = data.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const [spfAns, dmarcAns, dkimAns] = await Promise.all([
      dohQuery(domain, "TXT"),
      dohQuery(`_dmarc.${domain}`, "TXT"),
      dohQuery(`default._domainkey.${domain}`, "TXT"),
    ]);

    const spfRecord = spfAns.map((a) => a.data.replace(/"/g, "")).find((v) => v.startsWith("v=spf1"));
    const dmarcRecord = dmarcAns.map((a) => a.data.replace(/"/g, "")).find((v) => v.startsWith("v=DMARC1"));
    const dkimRecord = dkimAns.map((a) => a.data.replace(/"/g, "")).find((v) => v.includes("v=DKIM1")) ?? null;

    return {
      domain,
      spf: {
        found: !!spfRecord,
        value: spfRecord ?? null,
        strict: !!spfRecord && (spfRecord.includes("-all") || spfRecord.includes("~all")),
      },
      dmarc: {
        found: !!dmarcRecord,
        value: dmarcRecord ?? null,
        policy: dmarcRecord?.match(/p=(\w+)/)?.[1] ?? null,
      },
      dkim: {
        found: !!dkimRecord,
        value: dkimRecord,
        selector_checked: "default",
        note: "Selector 'default' verificado. Provedores podem usar outros seletores (google, s1, mail).",
      },
    };
  });

/**
 * Status da integração FUXICO (tracking de e-mail) + agregados dos últimos 30 dias.
 * Não expõe segredos: apenas se está configurado e a URL de webhook a cadastrar.
 */
export const getFuxicoStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const configured = !!process.env.FUXICO_URL;
    const webhookSecretSet = !!process.env.FUXICO_WEBHOOK_SECRET;

    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data, error } = await context.supabase
      .from("email_deliverability_events")
      .select("event_type")
      .eq("provider", "fuxico")
      .gte("created_at", since)
      .limit(5000);
    if (error) {
      return {
        configured,
        webhookSecretSet,
        counts: { opened: 0, clicked: 0, hard_bounce: 0, complaint: 0, unsubscribe: 0 },
        error: error.message,
      };
    }

    const counts = { opened: 0, clicked: 0, hard_bounce: 0, complaint: 0, unsubscribe: 0 };
    for (const row of data ?? []) {
      const key = row.event_type as keyof typeof counts;
      if (key in counts) counts[key] += 1;
    }
    return { configured, webhookSecretSet, counts, error: null as string | null };
  });