import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { buildTrackingIntegrityReport } from "@/lib/tracking-integrity";

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
    const domain = data.domain
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    const [spfAns, dmarcAns, dkimAns] = await Promise.all([
      dohQuery(domain, "TXT"),
      dohQuery(`_dmarc.${domain}`, "TXT"),
      dohQuery(`default._domainkey.${domain}`, "TXT"),
    ]);

    const spfRecord = spfAns
      .map((a) => a.data.replace(/"/g, ""))
      .find((v) => v.startsWith("v=spf1"));
    const dmarcRecord = dmarcAns
      .map((a) => a.data.replace(/"/g, ""))
      .find((v) => v.startsWith("v=DMARC1"));
    const dkimRecord =
      dkimAns.map((a) => a.data.replace(/"/g, "")).find((v) => v.includes("v=DKIM1")) ?? null;

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

/**
 * Dispara um evento FUXICO assinado contra o próprio webhook público e
 * confirma se a linha correspondente foi gravada em
 * `email_deliverability_events`. Serve como teste de ponta a ponta da
 * assinatura HMAC + persistência, sem depender do FUXICO real.
 */
export const sendTestFuxicoWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        event: z.enum(["email.opened", "email.clicked"]),
        trackingId: z.string().trim().min(1).max(200),
        recipientEmail: z.string().trim().email().max(255).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const secret = process.env.FUXICO_WEBHOOK_SECRET;
    if (!secret) {
      return {
        ok: false as const,
        step: "config" as const,
        message:
          "FUXICO_WEBHOOK_SECRET não configurado — não é possível assinar o evento de teste.",
        status: null as number | null,
        persisted: false,
        externalId: null as string | null,
      };
    }

    const origin = new URL(getRequest().url).origin;
    const timestamp = new Date().toISOString();
    const body = JSON.stringify({
      event: data.event,
      timestamp,
      data: {
        tracking_id: data.trackingId,
        recipient_email: data.recipientEmail || undefined,
        test: true,
      },
      metadata: { source: "fuxico", test: true },
    });

    const { signPayload } = await import("@/lib/hmac.server");
    const res = await fetch(`${origin}/api/public/webhooks/fuxico`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": signPayload(body, secret),
      },
      body,
    });
    const text = (await res.text()).slice(0, 300);

    if (!res.ok) {
      return {
        ok: false as const,
        step: "webhook" as const,
        message: `Webhook respondeu ${res.status}: ${text}`,
        status: res.status,
        persisted: false,
        externalId: null as string | null,
      };
    }

    const eventType = data.event === "email.opened" ? "opened" : "clicked";
    const externalId = `fuxico:${data.trackingId}:${eventType}:${timestamp}`;
    const { data: row } = await context.supabase
      .from("email_deliverability_events")
      .select("id, event_type, created_at")
      .eq("external_id", externalId)
      .maybeSingle();

    return {
      ok: !!row,
      step: "verify" as const,
      message: row
        ? `Evento "${eventType}" gravado com sucesso em email_deliverability_events.`
        : "Webhook aceitou o evento (200), mas a linha não foi encontrada — verifique se o tracking id existe.",
      status: res.status,
      persisted: !!row,
      externalId,
    };
  });
/** Uma linha do relatório agregado por campanha. */
export interface CampaignDeliverabilityRow {
  campaignId: string | null;
  campaignName: string;
  sends: number;
  opened: number;
  clicked: number;
  hardBounce: number;
  complaint: number;
  unsubscribe: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

/**
 * Relatório de entregabilidade agregado por campanha.
 * Fonte: `email_deliverability_events` (provider FUXICO) ligado a
 * `contact_touchpoints.campaign_id`. Agregação feita em memória para permitir
 * juntar campanhas de marketing e de orquestração no mesmo relatório.
 */
export const getCampaignDeliverabilityReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const supabase = context.supabase;

    // 1) Touchpoints de e-mail no período (base de envios + vínculo com campanha).
    const { data: touchpoints, error: tpErr } = await supabase
      .from("contact_touchpoints")
      .select("id, campaign_id, created_at")
      .eq("channel", "email")
      .eq("direction", "outbound")
      .gte("created_at", since)
      .limit(20000);
    if (tpErr) throw new Error(tpErr.message);

    const campaignByTouchpoint = new Map<string, string | null>();
    const sendsByCampaign = new Map<string | null, number>();
    for (const tp of touchpoints ?? []) {
      campaignByTouchpoint.set(tp.id, tp.campaign_id ?? null);
      sendsByCampaign.set(
        tp.campaign_id ?? null,
        (sendsByCampaign.get(tp.campaign_id ?? null) ?? 0) + 1,
      );
    }

    // 2) Eventos de entregabilidade no período.
    const { data: events, error: evErr } = await supabase
      .from("email_deliverability_events")
      .select("touchpoint_id, event_type, created_at")
      .gte("created_at", since)
      .limit(50000);
    if (evErr) throw new Error(evErr.message);

    type Counts = {
      opened: number;
      clicked: number;
      hard_bounce: number;
      complaint: number;
      unsubscribe: number;
    };
    const empty = (): Counts => ({
      opened: 0,
      clicked: 0,
      hard_bounce: 0,
      complaint: 0,
      unsubscribe: 0,
    });
    const byCampaign = new Map<string | null, Counts>();

    for (const ev of events ?? []) {
      const campaignId = ev.touchpoint_id
        ? (campaignByTouchpoint.get(ev.touchpoint_id) ?? null)
        : null;
      const bucket = byCampaign.get(campaignId) ?? empty();
      if (ev.event_type in bucket) bucket[ev.event_type as keyof Counts] += 1;
      byCampaign.set(campaignId, bucket);
    }
    for (const campaignId of sendsByCampaign.keys()) {
      if (!byCampaign.has(campaignId)) byCampaign.set(campaignId, empty());
    }

    // 3) Nomes das campanhas (marketing + orquestração).
    const ids = [...byCampaign.keys()].filter((v): v is string => !!v);
    const names = new Map<string, string>();
    if (ids.length) {
      const [mk, orch] = await Promise.all([
        supabase.from("marketing_campaigns").select("id, name").in("id", ids),
        supabase.from("campaigns_orchestration").select("id, name").in("id", ids),
      ]);
      for (const r of mk.data ?? []) names.set(r.id, r.name);
      for (const r of orch.data ?? []) if (!names.has(r.id)) names.set(r.id, r.name);
    }

    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
    const rows: CampaignDeliverabilityRow[] = [...byCampaign.entries()].map(([campaignId, c]) => {
      const sends = sendsByCampaign.get(campaignId) ?? 0;
      return {
        campaignId,
        campaignName: campaignId
          ? (names.get(campaignId) ?? "Campanha removida")
          : "Sem campanha (avulso)",
        sends,
        opened: c.opened,
        clicked: c.clicked,
        hardBounce: c.hard_bounce,
        complaint: c.complaint,
        unsubscribe: c.unsubscribe,
        openRate: pct(c.opened, sends),
        clickRate: pct(c.clicked, sends),
        bounceRate: pct(c.hard_bounce, sends),
      };
    });
    rows.sort((a, b) => b.sends - a.sends || b.opened - a.opened);

    const totals = rows.reduce(
      (acc, r) => ({
        sends: acc.sends + r.sends,
        opened: acc.opened + r.opened,
        clicked: acc.clicked + r.clicked,
        hardBounce: acc.hardBounce + r.hardBounce,
        complaint: acc.complaint + r.complaint,
        unsubscribe: acc.unsubscribe + r.unsubscribe,
      }),
      { sends: 0, opened: 0, clicked: 0, hardBounce: 0, complaint: 0, unsubscribe: 0 },
    );

    return { since, days: data.days, rows, totals };
  });

/**
 * Auditoria de integridade do rastreamento por `fuxico_tracking_id`.
 * Detecta lacunas de cobertura, colisões de código, eventos órfãos e
 * reentregas do webhook — as quatro formas de contaminar as métricas.
 */
export const getTrackingIntegrityReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const supabase = context.supabase;

    const [tp, ev] = await Promise.all([
      supabase
        .from("contact_touchpoints")
        .select("id, fuxico_tracking_id, created_at")
        .eq("channel", "email")
        .eq("direction", "outbound")
        .gte("created_at", since)
        .limit(20000),
      supabase
        .from("email_deliverability_events")
        .select("touchpoint_id, event_type, external_id, created_at")
        .gte("created_at", since)
        .limit(50000),
    ]);
    if (tp.error) throw new Error(tp.error.message);
    if (ev.error) throw new Error(ev.error.message);

    return {
      since,
      days: data.days,
      ...buildTrackingIntegrityReport(tp.data ?? [], ev.data ?? []),
    };
  });
