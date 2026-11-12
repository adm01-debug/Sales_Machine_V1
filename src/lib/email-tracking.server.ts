/**
 * Injeção de tracking FUXICO em corpos de e-mail.
 *
 * Degradação segura: se o FUXICO não estiver configurado ou falhar, o corpo
 * original é devolvido intacto e o envio segue com o pixel interno atual.
 * Nunca lança — tracking jamais deve bloquear um disparo.
 */

const HREF_RE = /href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;

function extractLinks(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(HREF_RE)) {
    const url = m[1];
    // Não reescrever links de descadastro/tracking interno.
    if (/\/api\/public\/(unsubscribe|track)\b/.test(url)) continue;
    found.add(url);
  }
  return [...found].slice(0, 25);
}

export interface TrackedBody {
  body: string;
  trackingId: string | null;
}

export async function withFuxicoTracking(input: {
  body: string;
  recipientEmail: string | null;
  subject?: string;
  senderEmail?: string;
  metadata?: Record<string, unknown>;
}): Promise<TrackedBody> {
  const { body, recipientEmail } = input;
  if (!recipientEmail) return { body, trackingId: null };

  try {
    const { fuxicoClient } = await import("@/integrations/external/fuxico.server");
    if (!fuxicoClient.isConfigured()) return { body, trackingId: null };

    const links = extractLinks(body);
    const tracking = await fuxicoClient.createTracking({
      recipientEmail,
      subject: input.subject,
      senderEmail: input.senderEmail,
      links,
      metadata: { source: "sales_machine", ...input.metadata },
    });

    let out = body;
    for (const link of tracking.wrappedLinks) {
      out = out.split(link.original).join(link.wrapped);
    }
    out = /<\/body>/i.test(out)
      ? out.replace(/<\/body>/i, `${tracking.pixelHtml}</body>`)
      : `${out}${tracking.pixelHtml}`;

    return { body: out, trackingId: tracking.trackingId };
  } catch (err) {
    console.error("[fuxico] tracking indisponível, seguindo sem rastreio", err);
    return { body, trackingId: null };
  }
}
