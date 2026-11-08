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
  channel: z.enum(["whatsapp", "sms", "mms", "rcs", "email", "linkedin", "instagram"]),
  message: z.string().min(1),
  campaign_id: z.string().uuid().optional(),
  fatorx_thread_id: z.string().optional(),
  sequence_id: z.string().optional(),
  media_url: z.string().url().optional(),
  rcs_payload: z.record(z.string(), z.unknown()).optional(),
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
        if (input.channel === "mms" && !input.media_url) {
          return Response.json({ ok: false, error: "media_url é obrigatório para MMS" }, { status: 400 });
        }

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

        // Consentimento (LGPD) — bloqueia opt-outs por canal antes de qualquer envio, mesmo stub.
        // Falha do RPC não pode virar envio silencioso a quem deu opt-out (fail-closed, mesmo
        // padrão dos ticks).
        const { data: allowed, error: consentErr } = await supabaseAdmin.rpc("check_consent", {
          _entity_id: entity.id,
          _channel: input.channel as never,
        });
        if (consentErr) {
          return Response.json(
            { ok: false, error: `check_consent indisponível: ${consentErr.message}` },
            { status: 503 },
          );
        }
        if (allowed === false) {
          return Response.json(
            { ok: false, error: "opt-out registrado para o canal" },
            { status: 409 },
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
            payload: {
              message: input.message,
              media_url: input.media_url ?? null,
              rcs_payload: (input.rcs_payload ?? null) as never,
            } as never,
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
          } else if (input.channel === "mms") {
            await singuClient.sendMms({
              contact_id: singuContactId,
              message: input.message,
              media_url: input.media_url as string,
            });
          } else if (input.channel === "rcs") {
            await singuClient.sendRcs({
              contact_id: singuContactId,
              message: input.message,
              rcs_payload: input.rcs_payload,
            });
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