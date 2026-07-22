import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyHmac } from "@/lib/hmac.server";
import { detectStopWord } from "@/lib/unsubscribe-token.server";

const SinguEventSchema = z.object({
  event_type: z.string().min(1),
  external_id: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
});

/** SINGU CRM -> SALES MACHINE. Signals: interaction, reply, opt-out, meeting booked. */
export const Route = createFileRoute("/api/public/webhooks/singu")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SINGU_WEBHOOK_SECRET;
        const raw = await request.text();
        const signature = request.headers.get("x-signature");
        if (!verifyHmac(raw, signature, secret)) {
          return new Response("invalid signature", { status: 401 });
        }
        const parsed = SinguEventSchema.safeParse(JSON.parse(raw || "{}"));
        if (!parsed.success) return new Response("invalid payload", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("sales_machine_events")
          .insert({
            source: "singu",
            event_type: parsed.data.event_type,
            external_id: parsed.data.external_id ?? null,
            payload: parsed.data.payload as never,
          })
          .select("id")
          .single();
        if (error) {
          console.error("[webhook singu] insert failed", error);
          return new Response("ingest error", { status: 500 });
        }
        // Detect inbound stop-words → write opt-out to consent_ledger
        try {
          const p = parsed.data.payload as Record<string, unknown>;
          const direction = String(p.direction ?? p.dir ?? "");
          const text = String(p.message ?? p.text ?? p.body ?? "");
          const channelRaw = String(p.channel ?? "");
          const contactId = p.contact_id ?? p.singu_contact_id ?? null;
          if ((direction === "inbound" || parsed.data.event_type === "reply") && detectStopWord(text) && contactId) {
            const { data: em } = await supabaseAdmin
              .from("entity_map")
              .select("id")
              .eq("singu_id", String(contactId))
              .maybeSingle();
            const allowed = ["whatsapp", "email", "sms", "linkedin", "instagram", "rcs", "mms"];
            const channel = allowed.includes(channelRaw) ? channelRaw : "whatsapp";
            if (em?.id) {
              await supabaseAdmin.from("consent_ledger").insert({
                entity_id: em.id,
                channel: channel as never,
                status: "opt_out",
                source: "stop_word",
                reason: `stop-word detected in inbound ${channel}`,
                evidence: { event_id: data.id, text: text.slice(0, 200) } as never,
              });
            }
          }
        } catch (e) {
          console.error("[webhook singu] stop-word handling failed", e);
        }
        return Response.json({ ok: true, event_id: data.id });
      },
    },
  },
});