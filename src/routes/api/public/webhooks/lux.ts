import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyHmac } from "@/lib/hmac.server";

const LuxEventSchema = z.object({
  event_type: z.string().min(1),
  external_id: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
});

/**
 * LUX -> SALES MACHINE webhook.
 * LUX signs each request with HMAC-SHA256(body, LUX_WEBHOOK_SECRET)
 * and sends the digest in `x-signature` (either raw hex or `sha256=<hex>`).
 */
export const Route = createFileRoute("/api/public/webhooks/lux")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.LUX_WEBHOOK_SECRET;
        const raw = await request.text();
        const signature = request.headers.get("x-signature");
        if (!verifyHmac(raw, signature, secret)) {
          return new Response("invalid signature", { status: 401 });
        }
        const parsed = LuxEventSchema.safeParse(JSON.parse(raw || "{}"));
        if (!parsed.success) {
          return new Response("invalid payload", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("sales_machine_events")
          .insert({
            source: "lux",
            event_type: parsed.data.event_type,
            external_id: parsed.data.external_id ?? null,
            payload: parsed.data.payload as never,
          })
          .select("id")
          .single();
        if (error) {
          console.error("[webhook lux] insert failed", error);
          return new Response("ingest error", { status: 500 });
        }
        return Response.json({ ok: true, event_id: data.id });
      },
    },
  },
});