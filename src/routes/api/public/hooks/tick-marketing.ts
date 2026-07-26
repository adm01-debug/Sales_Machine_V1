import { createFileRoute } from "@tanstack/react-router";

/**
 * Marketing worker — chamado por pg_cron a cada 5 minutos.
 *
 * Processa a fila `campaign_sends` de campanhas 1:N:
 *  1. Seleciona envios `queued` vencidos de campanhas em execução
 *  2. Respeita `daily_cap` por campanha
 *  3. Checa consentimento no canal (LGPD) antes de qualquer disparo
 *  4. Renderiza a variante e despacha via SINGU / adapter social
 *  5. Registra touchpoint e atualiza o estado do envio
 */

const BATCH_SIZE = 50;
const BACKOFF_MINUTES = [5, 30, 120, 480];

function nextRetryAt(attempts: number): string {
  const idx = Math.min(attempts, BACKOFF_MINUTES.length - 1);
  return new Date(Date.now() + BACKOFF_MINUTES[idx] * 60_000).toISOString();
}

/** Substitui placeholders simples do tipo {{nome}} pelo nome de exibição. */
function renderBody(body: string, displayName: string | null): string {
  return body
    .replace(/\{\{\s*nome\s*\}\}/gi, displayName ?? "")
    .replace(/\{\{\s*name\s*\}\}/gi, displayName ?? "")
    .trim();
}

export const Route = createFileRoute("/api/public/hooks/tick-marketing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || apikey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nowIso = new Date().toISOString();
        const today = nowIso.slice(0, 10);

        // Campanhas elegíveis: em execução, ou agendadas cuja janela já abriu.
        const { data: campaigns, error: campErr } = await supabaseAdmin
          .from("marketing_campaigns")
          .select("id, name, channel, status, daily_cap, requires_human_approval, scheduled_at")
          .in("status", ["running", "scheduled"]);
        if (campErr) {
          console.error("[tick-marketing] campaigns", campErr);
          return Response.json({ ok: false, error: campErr.message }, { status: 500 });
        }

        const active = (campaigns ?? []).filter(
          (c) => c.status === "running" || (c.scheduled_at ?? nowIso) <= nowIso,
        );
        if (active.length === 0) return Response.json({ ok: true, processed: 0 });

        let processed = 0;
        let skipped_consent = 0;
        let capped = 0;
        let failed = 0;
        let queued_approval = 0;

        for (const campaign of active) {
          if (campaign.status === "scheduled") {
            await supabaseAdmin
              .from("marketing_campaigns")
              .update({ status: "running" })
              .eq("id", campaign.id);
          }

          // Cap diário: quantos já saíram hoje nesta campanha
          const { count: sentToday } = await supabaseAdmin
            .from("campaign_sends")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaign.id)
            .eq("state", "sent")
            .gte("sent_at", `${today}T00:00:00.000Z`);

          const remaining = (campaign.daily_cap ?? 500) - (sentToday ?? 0);
          if (remaining <= 0) {
            capped++;
            continue;
          }

          const { data: sends } = await supabaseAdmin
            .from("campaign_sends")
            .select("id, entity_id, variant_id, attempts")
            .eq("campaign_id", campaign.id)
            .eq("state", "queued")
            .lte("next_run_at", nowIso)
            .order("next_run_at", { ascending: true })
            .limit(Math.min(remaining, BATCH_SIZE));

          if (!sends || sends.length === 0) {
            // Nada pendente: se não sobrou nenhum envio na fila, encerra a campanha.
            const { count: pending } = await supabaseAdmin
              .from("campaign_sends")
              .select("id", { count: "exact", head: true })
              .eq("campaign_id", campaign.id)
              .eq("state", "queued");
            if ((pending ?? 0) === 0 && campaign.status === "running") {
              await supabaseAdmin
                .from("marketing_campaigns")
                .update({ status: "completed", completed_at: nowIso })
                .eq("id", campaign.id);
            }
            continue;
          }

          const variantIds = [...new Set(sends.map((s) => s.variant_id).filter(Boolean))] as string[];
          const { data: variantRows } = await supabaseAdmin
            .from("campaign_variants")
            .select("id, label, subject, body, media_url, rcs_payload")
            .in("id", variantIds.length > 0 ? variantIds : ["00000000-0000-0000-0000-000000000000"]);
          const variants = new Map((variantRows ?? []).map((v) => [v.id, v]));

          for (const send of sends) {
            // Trava otimista: só processa se ainda estiver `queued`.
            const { data: claimed } = await supabaseAdmin
              .from("campaign_sends")
              .update({ state: "sending" })
              .eq("id", send.id)
              .eq("state", "queued")
              .select("id")
              .maybeSingle();
            if (!claimed) continue;

            const variant = send.variant_id ? variants.get(send.variant_id) : undefined;
            if (!variant) {
              await supabaseAdmin
                .from("campaign_sends")
                .update({ state: "failed", last_error: "variante não encontrada" })
                .eq("id", send.id);
              failed++;
              continue;
            }

            // Consentimento (LGPD) — bloqueia opt-outs por canal.
            const { data: allowed } = await supabaseAdmin.rpc("check_consent", {
              _entity_id: send.entity_id,
              _channel: campaign.channel as never,
            });
            if (allowed === false) {
              skipped_consent++;
              await supabaseAdmin
                .from("campaign_sends")
                .update({ state: "skipped", last_error: "opt-out registrado para o canal" })
                .eq("id", send.id);
              continue;
            }

            const { data: entity } = await supabaseAdmin
              .from("entity_map")
              .select("id, display_name, singu_id, metadata")
              .eq("id", send.entity_id)
              .maybeSingle();
            if (!entity) {
              await supabaseAdmin
                .from("campaign_sends")
                .update({ state: "failed", last_error: "contato não encontrado" })
                .eq("id", send.id);
              failed++;
              continue;
            }

            const messageText = renderBody(variant.body, entity.display_name);
            const isSocial = campaign.channel === "linkedin" || campaign.channel === "instagram";

            // Gate humano: registra touchpoint pendente e não dispara.
            if (campaign.requires_human_approval) {
              await supabaseAdmin.from("contact_touchpoints").insert({
                entity_id: entity.id,
                channel: campaign.channel as never,
                direction: "outbound",
                status: "pending_approval",
                payload: {
                  message: messageText,
                  marketing_campaign_id: campaign.id,
                  variant: variant.label,
                } as never,
              });
              await supabaseAdmin
                .from("campaign_sends")
                .update({ state: "pending_approval" })
                .eq("id", send.id);
              queued_approval++;
              continue;
            }

            const { data: tp } = await supabaseAdmin
              .from("contact_touchpoints")
              .insert({
                entity_id: entity.id,
                channel: campaign.channel as never,
                direction: "outbound",
                status: "queued",
                payload: {
                  message: messageText,
                  marketing_campaign_id: campaign.id,
                  variant: variant.label,
                } as never,
              })
              .select("id")
              .single();

            try {
              if (isSocial) {
                const { getSocialSender } = await import("@/integrations/social/types");
                const sender = getSocialSender(campaign.channel as "linkedin" | "instagram");
                const res = await sender.send(campaign.channel as "linkedin" | "instagram", {
                  entity_id: entity.id,
                  message: messageText,
                });
                if (res.status === "failed") throw new Error(res.error ?? "falha no adapter social");
                if (tp) {
                  await supabaseAdmin
                    .from("contact_touchpoints")
                    .update({ status: res.status })
                    .eq("id", tp.id);
                }
              } else {
                if (!entity.singu_id) throw new Error("contato sem vínculo SINGU");
                const meta = (entity.metadata as Record<string, unknown>) ?? {};
                if (campaign.channel === "email" && meta.hard_bounce === true) {
                  throw new Error("email hard_bounce — canal desativado para este contato");
                }
                const { singuClient } = await import("@/integrations/external/singu.server");
                if (campaign.channel === "whatsapp") {
                  await singuClient.sendWhatsapp({ contact_id: entity.singu_id, message: messageText });
                } else if (campaign.channel === "sms") {
                  await singuClient.sendSms({ contact_id: entity.singu_id, message: messageText });
                } else if (campaign.channel === "mms") {
                  if (!variant.media_url) throw new Error("variante MMS sem media_url");
                  await singuClient.sendMms({
                    contact_id: entity.singu_id,
                    message: messageText,
                    media_url: variant.media_url,
                  });
                } else if (campaign.channel === "rcs") {
                  try {
                    await singuClient.sendRcs({
                      contact_id: entity.singu_id,
                      message: messageText,
                      rcs_payload: (variant.rcs_payload ?? undefined) as
                        | Record<string, unknown>
                        | undefined,
                    });
                  } catch (rcsErr) {
                    const emsg = rcsErr instanceof Error ? rcsErr.message : String(rcsErr);
                    if (/not[_ ]?support|unavailable|404|405/i.test(emsg)) {
                      await singuClient.sendSms({ contact_id: entity.singu_id, message: messageText });
                    } else {
                      throw rcsErr;
                    }
                  }
                } else if (campaign.channel === "email") {
                  const subject = (variant.subject ?? campaign.name).slice(0, 120);
                  const { withFuxicoTracking } = await import("@/lib/email-tracking.server");
                  const recipientEmail = (meta.email as string | undefined) ?? null;
                  const tracked = await withFuxicoTracking({
                    body: messageText,
                    recipientEmail,
                    subject,
                    metadata: {
                      marketing_campaign_id: campaign.id,
                      entity_id: entity.id,
                      variant: variant.label,
                      touchpoint_id: tp?.id ?? null,
                    },
                  });
                  if (tp && tracked.trackingId) {
                    await supabaseAdmin
                      .from("contact_touchpoints")
                      .update({ fuxico_tracking_id: tracked.trackingId })
                      .eq("id", tp.id);
                  }
                  await singuClient.sendEmail({
                    contact_id: entity.singu_id,
                    subject,
                    body: tracked.body,
                  });
                }
                if (tp) {
                  await supabaseAdmin
                    .from("contact_touchpoints")
                    .update({ status: "sent" })
                    .eq("id", tp.id);
                }
              }

              await supabaseAdmin
                .from("campaign_sends")
                .update({ state: "sent", sent_at: new Date().toISOString(), last_error: null })
                .eq("id", send.id);
              processed++;
            } catch (err) {
              const emsg = err instanceof Error ? err.message : String(err);
              const attempts = (send.attempts ?? 0) + 1;
              const giveUp = attempts >= 4;
              if (tp) {
                await supabaseAdmin
                  .from("contact_touchpoints")
                  .update({ status: giveUp ? "dead_letter" : "failed", error: emsg })
                  .eq("id", tp.id);
              }
              await supabaseAdmin
                .from("campaign_sends")
                .update({
                  state: giveUp ? "failed" : "queued",
                  attempts,
                  next_run_at: nextRetryAt(attempts),
                  last_error: emsg.slice(0, 500),
                })
                .eq("id", send.id);
              failed++;
            }
          }
        }

        return Response.json({
          ok: true,
          processed,
          skipped_consent,
          capped,
          failed,
          queued_approval,
        });
      },
    },
  },
});
