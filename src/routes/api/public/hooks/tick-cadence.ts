import { createFileRoute } from "@tanstack/react-router";

/**
 * Cadence worker — called by pg_cron every minute.
 * Reads `campaign_targets` due for a step, resolves the next channel from the
 * campaign's `cadence_rule.steps` array, and dispatches via the agent-tool
 * endpoint (which handles SINGU + stubs uniformly).
 *
 * Auth: Supabase `apikey` header (bypasses public route to keep infra simple).
 */
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

        // Pull a small batch of due targets to avoid long-running invocations.
        const { data: due, error } = await supabaseAdmin
          .from("campaign_targets")
          .select("id, entity_id, campaign_id, step_index")
          .eq("status", "queued")
          .lte("next_run_at", nowIso)
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
        for (const target of due) {
          const { data: campaign } = await supabaseAdmin
            .from("campaigns_orchestration")
            .select("id, name, channels, fatorx_agent_id, cadence_rule_id")
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

          const step = steps[target.step_index];
          if (!step) {
            await supabaseAdmin
              .from("campaign_targets")
              .update({ status: "completed" })
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
              input: `Passo ${target.step_index + 1}/${steps.length} da cadência "${campaign.name}" para "${entity.display_name}". Canal: ${step.channel}. Gere UMA mensagem curta, natural, adequada ao canal.`,
              metadata: { campaign_id: campaign.id, entity_id: entity.id, step: target.step_index },
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

          // Dispatch via singu (or stub for LI/IG). Record touchpoint inline.
          const isStub = step.channel === "linkedin" || step.channel === "instagram";
          const { data: tp } = await supabaseAdmin
            .from("contact_touchpoints")
            .insert({
              entity_id: entity.id,
              campaign_id: campaign.id,
              channel: step.channel as never,
              direction: "outbound",
              status: isStub ? "pending_provider" : "queued",
              fatorx_thread_id: threadId,
              payload: { message: messageText, step_index: target.step_index } as never,
            })
            .select("id")
            .single();

          if (!isStub) {
            try {
              const { data: ent2 } = await supabaseAdmin
                .from("entity_map")
                .select("singu_id")
                .eq("id", entity.id)
                .maybeSingle();
              if (ent2?.singu_id) {
                const { singuClient } = await import("@/integrations/external/singu.server");
                if (step.channel === "whatsapp") {
                  await singuClient.sendWhatsapp({ contact_id: ent2.singu_id, message: messageText });
                } else if (step.channel === "sms") {
                  await singuClient.sendSms({ contact_id: ent2.singu_id, message: messageText });
                }
                // email: sequence_processor needs a sequence_id — leave queued for a manual link.
                if (tp && step.channel !== "email") {
                  await supabaseAdmin
                    .from("contact_touchpoints")
                    .update({ status: "sent" })
                    .eq("id", tp.id);
                }
              }
            } catch (err) {
              const emsg = err instanceof Error ? err.message : String(err);
              if (tp) {
                await supabaseAdmin
                  .from("contact_touchpoints")
                  .update({ status: "failed", error: emsg })
                  .eq("id", tp.id);
              }
            }
          }

          // Advance the target
          const nextIdx = target.step_index + 1;
          const nextStep = steps[nextIdx];
          if (nextStep) {
            const nextRunAt = new Date(Date.now() + (nextStep.delay_days ?? 1) * 86400_000).toISOString();
            await supabaseAdmin
              .from("campaign_targets")
              .update({ step_index: nextIdx, next_run_at: nextRunAt, last_run_at: nowIso })
              .eq("id", target.id);
          } else {
            await supabaseAdmin
              .from("campaign_targets")
              .update({ status: "completed", last_run_at: nowIso })
              .eq("id", target.id);
          }
          processed++;
        }

        return Response.json({ ok: true, processed });
      },
    },
  },
});