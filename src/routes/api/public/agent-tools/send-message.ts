import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { safeEqualString } from "@/lib/hmac.server";
import { singuClient } from "@/integrations/external/singu.server";

/**
 * Tool endpoint that FATOR X agents call to actually deliver messages
 * through SINGU (whatsapp/sms/email). Authenticated with AGENT_TOOL_TOKEN
 * bearer. Records a touchpoint locally for cadence bookkeeping.
 */
const Schema = z.object({
  entity_id: z.string().uuid(),
  channel: z.enum(["whatsapp", "sms", "email", "linkedin", "instagram"]),
  message: z.string().min(1),
  campaign_id: z.string().uuid().optional(),
  fatorx_thread_id: z.string().optional(),
  sequence_id: z.string().optional(),
});

export const Route = createFileRoute("/api/public/agent-tools/send-message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.AGENT_TOOL_TOKEN;
        const auth = request.headers.get("authorization") ?? "";
        const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token || !bearer || !safeEqualString(bearer, token)) {
          return new Response("unauthorized", { status: 401 });
        }
        const body = await request.json().catch(() => ({}));
        const parsed = Schema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
        }
        const input = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const isStubChannel = input.channel === "linkedin" || input.channel === "instagram";
        // Resolve entity (singu mapping only required for singu-backed channels)
        const { data: entity, error: entityErr } = await supabaseAdmin
          .from("entity_map")
          .select("id, singu_id")
          .eq("id", input.entity_id)
          .maybeSingle();
        if (entityErr || !entity) {
          return Response.json({ ok: false, error: "entity not found" }, { status: 404 });
        }
        if (!isStubChannel && !entity.singu_id) {
          return Response.json(
            { ok: false, error: "entity not mapped to singu contact" },
            { status: 422 },
          );
        }

        // Insert touchpoint as queued for auditability, then dispatch.
        const { data: tp } = await supabaseAdmin
          .from("contact_touchpoints")
          .insert({
            entity_id: entity.id,
            campaign_id: input.campaign_id ?? null,
            channel: input.channel,
            direction: "outbound",
            status: isStubChannel ? "pending_provider" : "queued",
            fatorx_thread_id: input.fatorx_thread_id ?? null,
            payload: { message: input.message },
          })
          .select("id")
          .single();

        // LinkedIn/Instagram: stub. Touchpoint stays as pending_provider until a real provider is wired.
        if (isStubChannel) {
          return Response.json({
            ok: true,
            touchpoint_id: tp?.id,
            status: "pending_provider",
            note: `Channel "${input.channel}" is a stub in v1. Configure a provider (Unipile/Phantombuster/etc) to activate delivery.`,
          });
        }

        try {
          const singuContactId = entity.singu_id as string;
          if (input.channel === "whatsapp") {
            await singuClient.sendWhatsapp({ contact_id: singuContactId, message: input.message });
          } else if (input.channel === "sms") {
            await singuClient.sendSms({ contact_id: singuContactId, message: input.message });
          } else if (input.channel === "email") {
            if (!input.sequence_id) throw new Error("sequence_id required for email channel");
            await singuClient.runEmailSequence({
              contact_id: singuContactId,
              sequence_id: input.sequence_id,
            });
          }
          if (tp) {
            await supabaseAdmin
              .from("contact_touchpoints")
              .update({ status: "sent" })
              .eq("id", tp.id);
          }
          return Response.json({ ok: true, touchpoint_id: tp?.id });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (tp) {
            await supabaseAdmin
              .from("contact_touchpoints")
              .update({ status: "failed", error: message })
              .eq("id", tp.id);
          }
          return Response.json({ ok: false, error: message }, { status: 502 });
        }
      },
    },
  },
});