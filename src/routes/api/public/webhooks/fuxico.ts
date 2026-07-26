import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyHmac } from "@/lib/hmac.server";

/**
 * Webhook do FUXICO (tracking de e-mail).
 * Envelope: { event, timestamp, data, metadata: { source: "fuxico" } }
 * Assinatura: header `X-Webhook-Signature: sha256=<hex>` (HMAC-SHA256 do corpo).
 */

const Schema = z.object({
  event: z.string().min(1),
  timestamp: z.string().optional(),
  data: z.record(z.unknown()).default({}),
  metadata: z.record(z.unknown()).optional(),
});

const EVENT_MAP: Record<string, "opened" | "clicked" | "hard_bounce" | "complaint" | "unsubscribe"> = {
  "email.opened": "opened",
  "email.open": "opened",
  opened: "opened",
  open: "opened",
  "email.clicked": "clicked",
  "link.clicked": "clicked",
  clicked: "clicked",
  click: "clicked",
  "email.bounced": "hard_bounce",
  bounced: "hard_bounce",
  bounce: "hard_bounce",
  "email.complaint": "complaint",
  complaint: "complaint",
  "email.unsubscribed": "unsubscribe",
  unsubscribe: "unsubscribe",
};

export const Route = createFileRoute("/api/public/webhooks/fuxico")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.FUXICO_WEBHOOK_SECRET;
        const raw = await request.text();
        const signature =
          request.headers.get("x-webhook-signature") ?? request.headers.get("x-signature");
        if (!verifyHmac(raw, signature, secret)) {
          return new Response("invalid signature", { status: 401 });
        }

        let json: unknown;
        try {
          json = JSON.parse(raw || "{}");
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const parsed = Schema.safeParse(json);
        if (!parsed.success) return new Response("invalid payload", { status: 400 });

        const eventType = EVENT_MAP[parsed.data.event.toLowerCase()];
        const payload = parsed.data.data as Record<string, unknown>;
        const trackingId =
          (payload.tracking_id as string | undefined) ?? (payload.trackingId as string | undefined) ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Registro bruto sempre — auditoria e signal scoring.
        await supabaseAdmin.from("sales_machine_events").insert({
          source: "fuxico" as never,
          event_type: parsed.data.event,
          external_id: trackingId ? `${parsed.data.event}:${trackingId}:${parsed.data.timestamp ?? ""}` : null,
          payload: { ...payload, tracking_id: trackingId } as never,
        });

        if (!eventType) return Response.json({ ok: true, ignored: parsed.data.event });

        // Resolve touchpoint / entidade pelo tracking id.
        let touchpointId: string | null = null;
        let entityId: string | null = null;
        if (trackingId) {
          const { data: tp } = await supabaseAdmin
            .from("contact_touchpoints")
            .select("id, entity_id")
            .eq("fuxico_tracking_id", trackingId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          touchpointId = tp?.id ?? null;
          entityId = tp?.entity_id ?? null;
        }
        if (!entityId && typeof payload.recipient_email === "string") {
          const { data: em } = await supabaseAdmin
            .from("entity_map")
            .select("id")
            .eq("metadata->>email", payload.recipient_email)
            .maybeSingle();
          entityId = em?.id ?? null;
        }

        const externalId = `fuxico:${trackingId ?? "na"}:${eventType}:${parsed.data.timestamp ?? new Date().toISOString()}`;
        const { error: insErr } = await supabaseAdmin.from("email_deliverability_events").insert({
          touchpoint_id: touchpointId,
          entity_id: entityId,
          event_type: eventType,
          provider: "fuxico",
          external_id: externalId,
          raw: payload as never,
        });
        // Índice único em external_id: reentregas duplicadas caem aqui e são ignoradas.
        if (insErr && insErr.code !== "23505") {
          console.error("[webhooks/fuxico] insert event", insErr);
        }

        // Supressão: bounce/complaint/unsubscribe desativam o canal e-mail.
        if (entityId && (eventType === "hard_bounce" || eventType === "complaint" || eventType === "unsubscribe")) {
          const { data: em } = await supabaseAdmin
            .from("entity_map")
            .select("metadata")
            .eq("id", entityId)
            .maybeSingle();
          const meta = (em?.metadata as Record<string, unknown>) ?? {};
          await supabaseAdmin
            .from("entity_map")
            .update({
              metadata: {
                ...meta,
                hard_bounce: true,
                hard_bounce_at: new Date().toISOString(),
                hard_bounce_reason: eventType,
              } as never,
            })
            .eq("id", entityId);

          await supabaseAdmin.from("consent_ledger").insert({
            entity_id: entityId,
            channel: "email" as never,
            status: "opt_out",
            source: eventType === "unsubscribe" ? "unsubscribe_link" : "bounce",
            reason: `${eventType} from fuxico`,
            evidence: { tracking_id: trackingId } as never,
          });
        }

        return Response.json({ ok: true, event_type: eventType });
      },
    },
  },
});