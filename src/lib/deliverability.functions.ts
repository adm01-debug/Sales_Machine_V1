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

/**
 * Status detalhado de cada segredo do FUXICO (nunca devolve valores),
 * com validação de formato da URL.
 */
export const getFuxicoConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const url = process.env.FUXICO_URL ?? "";
    let urlValid = false;
    try {
      urlValid = !!url && new URL(url).protocol === "https:";
    } catch {
      urlValid = false;
    }
    return {
      url: { set: !!url, valid: urlValid, preview: url ? url.replace(/\/$/, "") : null },
      serviceKey: { set: !!process.env.FUXICO_SERVICE_KEY },
      webhookSecret: { set: !!process.env.FUXICO_WEBHOOK_SECRET },
    };
  });

/** Faz uma chamada real ao FUXICO para validar URL + service key. */
export const testFuxicoConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    if (!process.env.FUXICO_URL) {
      return { ok: false as const, message: "FUXICO_URL não configurada." };
    }
    try {
      const { fuxicoClient } = await import("@/integrations/external/fuxico.server");
      const stats = (await fuxicoClient.getStats({ limit: 1 })) as unknown;
      return {
        ok: true as const,
        message: "Conexão estabelecida com o FUXICO.",
        sample: stats ? "resposta recebida" : "resposta vazia",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha desconhecida";
      return { ok: false as const, message: message.slice(0, 300) };
    }
  });

/**
 * Teste ponta a ponta do rastreio FUXICO.
 *
 * Monta um e-mail de exemplo com dois links, passa pelo mesmo pipeline usado
 * nos disparos reais (`withFuxicoTracking`) e devolve um diagnóstico do que foi
 * injetado: trackingId, pixel de abertura e links reescritos.
 * Com `send: true` e um `contactId`, dispara de fato via SINGU.
 */
export const runFuxicoEmailTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        contactId: z.string().trim().uuid().optional().or(z.literal("")),
        send: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const subject = "SALES MACHINE · teste de rastreio";
    const sampleLinks = [
      "https://example.com/catalogo",
      "https://example.com/agendar-apresentacao",
    ];
    const sourceBody = `<html><body><p>Olá! Este é um e-mail de teste do rastreio.</p>
<p><a href="${sampleLinks[0]}">Ver catálogo</a></p>
<p><a href="${sampleLinks[1]}">Agendar apresentação</a></p>
</body></html>`;

    const { withFuxicoTracking } = await import("@/lib/email-tracking.server");
    const tracked = await withFuxicoTracking({
      body: sourceBody,
      recipientEmail: data.email,
      subject,
      metadata: { test: true },
    });

    const pixelInjected = /<img[^>]+src=/i.test(tracked.body.replace(sourceBody, ""));
    const rewritten = sampleLinks.filter((l) => !tracked.body.includes(`href="${l}"`));

    let sent: { ok: boolean; message: string } | null = null;
    if (data.send) {
      if (!data.contactId) {
        sent = { ok: false, message: "Informe o ID do contato para disparar de verdade." };
      } else {
        try {
          const { singuClient } = await import("@/integrations/external/singu.server");
          await singuClient.sendEmail({
            contact_id: data.contactId,
            subject,
            body: tracked.body,
          });
          sent = { ok: true, message: "E-mail enviado via SINGU." };
        } catch (err) {
          sent = {
            ok: false,
            message: (err instanceof Error ? err.message : "Falha no envio").slice(0, 300),
          };
        }
      }
    }

    return {
      trackingId: tracked.trackingId,
      pixelInjected,
      linksRewritten: rewritten.length,
      linksTotal: sampleLinks.length,
      bodyPreview: tracked.body.slice(0, 1500),
      sent,
      fallback: tracked.trackingId === null,
    };
  });