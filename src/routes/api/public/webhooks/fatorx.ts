import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyHmac } from "@/lib/hmac.server";

const FatorxEventSchema = z.object({
  event_type: z.string().min(1),
  external_id: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
});

/** FATOR X agent runtime -> SALES MACHINE. Signals: agent.reply, agent.tool_call, agent.handoff. */
export const Route = createFileRoute("/api/public/webhooks/fatorx")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.FATORX_WEBHOOK_SECRET;
        const raw = await request.text();
        const signature = request.headers.get("x-signature");
        if (!verifyHmac(raw, signature, secret)) {
          return new Response("invalid signature", { status: 401 });
        }
        const parsed = FatorxEventSchema.safeParse(JSON.parse(raw || "{}"));
        if (!parsed.success) return new Response("invalid payload", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("sales_machine_events")
          .insert({
            source: "fatorx",
            event_type: parsed.data.event_type,
            external_id: parsed.data.external_id ?? null,
            payload: parsed.data.payload as never,
          })
          .select("id")
          .single();
        if (error) {
          console.error("[webhook fatorx] insert failed", error);
          return new Response("ingest error", { status: 500 });
        }
        return Response.json({ ok: true, event_id: data.id });
      },
    },
  },
});
