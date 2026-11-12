import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyHmac } from "@/lib/hmac.server";

const Schema = z.object({
  event_type: z.enum(["hard_bounce", "soft_bounce", "complaint", "unsubscribe"]),
  external_id: z.string().optional(),
  touchpoint_id: z.string().uuid().optional(),
  contact_id: z.string().optional(),
  provider: z.string().default("singu"),
  raw: z.record(z.unknown()).default({}),
});

/** Deliverability webhook (bounces / complaints). HMAC-signed by SINGU. */
export const Route = createFileRoute("/api/public/webhooks/singu-bounce")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SINGU_WEBHOOK_SECRET;
        const raw = await request.text();
        if (!verifyHmac(raw, request.headers.get("x-signature"), secret)) {
          return new Response("invalid signature", { status: 401 });
        }
        const parsed = Schema.safeParse(JSON.parse(raw || "{}"));
        if (!parsed.success) return new Response("invalid payload", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Resolve entity from touchpoint or contact_id
        let entityId: string | null = null;
        if (parsed.data.touchpoint_id) {
          const { data: tp } = await supabaseAdmin
            .from("contact_touchpoints")
            .select("entity_id")
            .eq("id", parsed.data.touchpoint_id)
            .maybeSingle();
          entityId = tp?.entity_id ?? null;
        }
        if (!entityId && parsed.data.contact_id) {
          const { data: em } = await supabaseAdmin
            .from("entity_map")
            .select("id")
            .eq("singu_id", parsed.data.contact_id)
            .maybeSingle();
          entityId = em?.id ?? null;
        }

        await supabaseAdmin.from("email_deliverability_events").insert({
          touchpoint_id: parsed.data.touchpoint_id ?? null,
          entity_id: entityId,
          event_type: parsed.data.event_type,
          provider: parsed.data.provider,
          external_id: parsed.data.external_id ?? null,
          raw: parsed.data.raw as never,
        });

        // Hard bounce or complaint → mark entity + write opt_out to ledger
        if (
          entityId &&
          (parsed.data.event_type === "hard_bounce" ||
            parsed.data.event_type === "complaint" ||
            parsed.data.event_type === "unsubscribe")
        ) {
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
                hard_bounce_reason: parsed.data.event_type,
              } as never,
            })
            .eq("id", entityId);

          await supabaseAdmin.from("consent_ledger").insert({
            entity_id: entityId,
            channel: "email" as never,
            status: "opt_out",
            source: parsed.data.event_type === "unsubscribe" ? "unsubscribe_link" : "bounce",
            reason: `${parsed.data.event_type} from ${parsed.data.provider}`,
            evidence: { external_id: parsed.data.external_id ?? null } as never,
          });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
