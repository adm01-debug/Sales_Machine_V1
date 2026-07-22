import { createFileRoute } from "@tanstack/react-router";

/**
 * Cadence worker — chamado por pg_cron a cada minuto.
 *
 * Faz, em um único tick, para cada target elegível:
 *  1. Trava linha via `locked_until` (idempotência entre ticks concorrentes)
 *  2. Verifica cooldown de conta (anti-carpet-bombing)
 *  3. Se canal = email, respeita `compute_daily_cap`
 *  4. Pede mensagem ao FATOR X
 *  5. Se `requires_human_approval` da campanha, cria touchpoint `pending_approval`
 *  6. Senão: adapter social (LI/IG) OU singu (whatsapp/sms), com retry/backoff
 *  7. Avança step ou marca dead_letter/completed
 */

const BACKOFF_MINUTES = [1, 5, 30, 120, 480];

function nextRetryAt(attempts: number): string {
  const idx = Math.min(attempts, BACKOFF_MINUTES.length - 1);
  return new Date(Date.now() + BACKOFF_MINUTES[idx] * 60_000).toISOString();
}

export const Route = createFileRoute("/api/public/hooks/tick-cadence")({
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

        const { data: due, error } = await supabaseAdmin
          .from("campaign_targets")
          .select("id, entity_id, campaign_id, current_step, attempts, max_attempts, locked_until")
          .in("state", ["queued", "running"])
          .lte("next_run_at", nowIso)
          .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
          .order("next_run_at", { ascending: true })
          .limit(10);
        if (error) {
          console.error("[tick-cadence] fetch due", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        if (!due || due.length === 0) {
          return Response.json({ ok: true, processed: 0 });
        }

        let processed = 0;
        let skipped_cooldown = 0;
        let dead_lettered = 0;
        let queued_approval = 0;

        for (const target of due) {
          // Lock por 5min para evitar dupla execução
          const lockUntil = new Date(Date.now() + 5 * 60_000).toISOString();
          const { data: locked } = await supabaseAdmin
            .from("campaign_targets")
            .update({ locked_until: lockUntil, state: "running" })
            .eq("id", target.id)
            .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
            .select("id")
            .maybeSingle();
          if (!locked) continue;

          const { data: campaign } = await supabaseAdmin
            .from("campaigns_orchestration")
            .select("id, name, channels, fatorx_agent_id, cadence_rule_id, requires_human_approval, account_cooldown_hours")
            .eq("id", target.campaign_id)
            .maybeSingle();
          if (!campaign) continue;

          const { data: rule } = campaign.cadence_rule_id
            ? await supabaseAdmin
                .from("cadence_rules")
                .select("steps")
                .eq("id", campaign.cadence_rule_id)
                .maybeSingle()
            : { data: null };

          const steps = (rule?.steps as Array<{ channel: string; delay_days: number }> | null) ?? [
            { channel: "whatsapp", delay_days: 0 },
            { channel: "email", delay_days: 2 },
          ];

          const step = steps[target.current_step];
          if (!step) {
            await supabaseAdmin
              .from("campaign_targets")
              .update({ state: "completed", locked_until: null })
              .eq("id", target.id);
            continue;
          }

          // Cooldown de conta (item 5)
          const cooldownHours = campaign.account_cooldown_hours ?? 48;
          const { data: hasRecent } = await supabaseAdmin.rpc("has_recent_account_touchpoint", {
            _entity_id: target.entity_id,
            _hours: cooldownHours,
          });
          if (hasRecent === true) {
            skipped_cooldown++;
            await supabaseAdmin
              .from("campaign_targets")
              .update({
                next_run_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
                locked_until: null,
                state: "queued",
                last_error: `account cooldown ${cooldownHours}h`,
              })
              .eq("id", target.id);
            continue;
          }

          // Ask FATOR X for the actual message for this step.
          const { fatorxClient } = await import("@/integrations/external/fatorx.server");
          const { data: entity } = await supabaseAdmin
            .from("entity_map")
            .select("id, display_name, fatorx_thread_id")
            .eq("id", target.entity_id)
            .maybeSingle();
          if (!entity) continue;
          const threadId = entity.fatorx_thread_id ?? `sm_${entity.id}`;

          let messageText = `Olá ${entity.display_name}, gostaria de conversar rapidamente.`;
          try {
            const agentRes = await fatorxClient.runAgent({
              agent_id: campaign.fatorx_agent_id ?? undefined,
              thread_id: threadId,
              input: `Passo ${target.current_step + 1}/${steps.length} da cadência "${campaign.name}" para "${entity.display_name}". Canal: ${step.channel}. Gere UMA mensagem curta, natural, adequada ao canal.`,
              metadata: { campaign_id: campaign.id, entity_id: entity.id, step: target.current_step },
            });
            const extracted =
              (agentRes as { message?: string; output?: string; text?: string } | null)?.message ??
              (agentRes as { message?: string; output?: string; text?: string } | null)?.output ??
              (agentRes as { message?: string; output?: string; text?: string } | null)?.text;
            if (extracted && typeof extracted === "string") messageText = extracted;
            if (!entity.fatorx_thread_id) {
              await supabaseAdmin.from("entity_map").update({ fatorx_thread_id: threadId }).eq("id", entity.id);
            }
          } catch (err) {
            console.error("[tick-cadence] fatorx failed", err);
          }

          // Approval gate (item 4)
          const isSocial = step.channel === "linkedin" || step.channel === "instagram";
          if (campaign.requires_human_approval) {
            await supabaseAdmin.from("contact_touchpoints").insert({
              entity_id: entity.id,
              campaign_id: campaign.id,
              channel: step.channel as never,
              direction: "outbound",
              status: "pending_approval",
              fatorx_thread_id: threadId,
              payload: { message: messageText, current_step: target.current_step } as never,
            });
            queued_approval++;
            // avança step normalmente; envio real ocorre no approve
            await advanceTarget(supabaseAdmin, target.id, target.current_step, steps);
            continue;
          }

          // Email cap (item 6)
          if (step.channel === "email") {
            const senderId = campaign.fatorx_agent_id ?? "default";
            const { data: capData } = await supabaseAdmin.rpc("compute_daily_cap", { _sender_id: senderId });
            const cap = typeof capData === "number" ? capData : 50;
            const today = new Date().toISOString().slice(0, 10);
            const { data: health } = await supabaseAdmin
              .from("sender_health")
              .select("sent")
              .eq("sender_id", senderId)
              .eq("day", today)
              .maybeSingle();
            if ((health?.sent ?? 0) >= cap) {
              await supabaseAdmin
                .from("campaign_targets")
                .update({
                  next_run_at: new Date(Date.now() + 3600_000).toISOString(),
                  locked_until: null,
                  state: "queued",
                  last_error: `email cap ${cap} atingido`,
                })
                .eq("id", target.id);
              continue;
            }
          }

          const { data: tp } = await supabaseAdmin
            .from("contact_touchpoints")
            .insert({
              entity_id: entity.id,
              campaign_id: campaign.id,
              channel: step.channel as never,
              direction: "outbound",
              status: "queued",
              fatorx_thread_id: threadId,
              payload: { message: messageText, current_step: target.current_step } as never,
            })
            .select("id")
            .single();

          // Envio real
          if (isSocial) {
            const { getSocialSender } = await import("@/integrations/social/types");
            const sender = getSocialSender(step.channel as "linkedin" | "instagram");
            const res = await sender.send(step.channel as "linkedin" | "instagram", {
              entity_id: entity.id,
              message: messageText,
            });
            if (tp) {
              await supabaseAdmin
                .from("contact_touchpoints")
                .update({
                  status: res.status,
                  error: res.error ?? null,
                  payload: { message: messageText, current_step: target.current_step, provider: res.provider } as never,
                })
                .eq("id", tp.id);
            }
          } else {
            try {
              const { data: ent2 } = await supabaseAdmin
                .from("entity_map")
                .select("singu_id")
                .eq("id", entity.id)
                .maybeSingle();
              if (ent2?.singu_id) {
                const { singuClient } = await import("@/integrations/external/singu.server");
                const payloadExtras = ((): { media_url?: string; rcs_payload?: Record<string, unknown> } => {
                  const raw = (step as unknown as { media_url?: string; rcs_payload?: Record<string, unknown> });
                  return {
                    media_url: raw.media_url,
                    rcs_payload: raw.rcs_payload,
                  };
                })();
                if (step.channel === "whatsapp") {
                  await singuClient.sendWhatsapp({ contact_id: ent2.singu_id, message: messageText });
                } else if (step.channel === "sms") {
                  await singuClient.sendSms({ contact_id: ent2.singu_id, message: messageText });
                } else if (step.channel === "mms") {
                  const mediaUrl = payloadExtras.media_url;
                  if (!mediaUrl) throw new Error("MMS step sem media_url");
                  await singuClient.sendMms({
                    contact_id: ent2.singu_id,
                    message: messageText,
                    media_url: mediaUrl,
                  });
                } else if (step.channel === "rcs") {
                  try {
                    await singuClient.sendRcs({
                      contact_id: ent2.singu_id,
                      message: messageText,
                      rcs_payload: payloadExtras.rcs_payload,
                    });
                  } catch (rcsErr) {
                    const emsg = rcsErr instanceof Error ? rcsErr.message : String(rcsErr);
                    // Fallback automático: se provedor RCS falhar por não suportado,
                    // reenvia como SMS reusando o mesmo texto.
                    if (/not[_ ]?support|unavailable|404|405/i.test(emsg)) {
                      await singuClient.sendSms({ contact_id: ent2.singu_id, message: messageText });
                      if (tp) {
                        await supabaseAdmin
                          .from("contact_touchpoints")
                          .update({
                            status: "sent",
                            error: `RCS fallback→SMS: ${emsg.slice(0, 200)}`,
                          })
                          .eq("id", tp.id);
                      }
                    } else {
                      throw rcsErr;
                    }
                  }
                } else if (step.channel === "email") {
                  // QA-013 fix (F10): canal email era no-op; agora dispara via SINGU.
                  const subject = `Contato de ${campaign.name}`.slice(0, 120);
                  await singuClient.sendEmail({
                    contact_id: ent2.singu_id,
                    subject,
                    body: messageText,
                  });
                }
                if (tp) {
                  await supabaseAdmin
                    .from("contact_touchpoints")
                    .update({ status: "sent" })
                    .eq("id", tp.id);
                }
                // Email health increment
                if (step.channel === "email") {
                  const senderId = campaign.fatorx_agent_id ?? "default";
                  const today = new Date().toISOString().slice(0, 10);
                  const { data: existing } = await supabaseAdmin
                    .from("sender_health")
                    .select("sent")
                    .eq("sender_id", senderId)
                    .eq("day", today)
                    .maybeSingle();
                  await supabaseAdmin
                    .from("sender_health")
                    .upsert(
                      { sender_id: senderId, day: today, sent: (existing?.sent ?? 0) + 1 },
                      { onConflict: "sender_id,day" },
                    );
                }
              }
            } catch (err) {
              const emsg = err instanceof Error ? err.message : String(err);
              // Retry/backoff (item 3)
              const attempts = (target.attempts ?? 0) + 1;
              const maxAttempts = target.max_attempts ?? 5;
              if (attempts >= maxAttempts) {
                dead_lettered++;
                if (tp) await supabaseAdmin.from("contact_touchpoints").update({ status: "dead_letter", error: emsg }).eq("id", tp.id);
                await supabaseAdmin
                  .from("campaign_targets")
                  .update({ state: "dead_letter", locked_until: null, attempts, last_error: emsg })
                  .eq("id", target.id);
                continue;
              }
              if (tp) await supabaseAdmin.from("contact_touchpoints").update({ status: "failed", error: emsg, attempts, next_retry_at: nextRetryAt(attempts) }).eq("id", tp.id);
              await supabaseAdmin
                .from("campaign_targets")
                .update({
                  attempts,
                  next_run_at: nextRetryAt(attempts),
                  locked_until: null,
                  state: "queued",
                  last_error: emsg,
                })
                .eq("id", target.id);
              continue;
            }
          }

          await advanceTarget(supabaseAdmin, target.id, target.current_step, steps);
          processed++;
        }

        return Response.json({ ok: true, processed, skipped_cooldown, dead_lettered, queued_approval });
      },
    },
  },
});

async function advanceTarget(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  targetId: string,
  currentStep: number,
  steps: Array<{ channel: string; delay_days: number }>,
): Promise<void> {
  const nextIdx = currentStep + 1;
  const nextStep = steps[nextIdx];
  if (nextStep) {
    const nextRunAt = new Date(Date.now() + (nextStep.delay_days ?? 1) * 86400_000).toISOString();
    await admin
      .from("campaign_targets")
      .update({ current_step: nextIdx, next_run_at: nextRunAt, locked_until: null, state: "queued", attempts: 0 })
      .eq("id", targetId);
  } else {
    await admin
      .from("campaign_targets")
      .update({ state: "completed", locked_until: null })
      .eq("id", targetId);
  }
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}