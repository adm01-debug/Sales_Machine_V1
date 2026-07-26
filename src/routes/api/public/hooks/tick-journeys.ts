import { createFileRoute } from "@tanstack/react-router";
import {
  decideJourneyAction,
  type JourneyEdge,
  type JourneyNode,
} from "@/lib/journey-engine";

/**
 * Worker de jornadas (Automação 360) — chamado por pg_cron a cada minuto.
 *
 * Para cada inscrição vencida:
 *  1. Trava a linha (`locked_until`) para não duplicar entre ticks
 *  2. Carrega o grafo da jornada e coleta os fatos (consentimento, orçamento)
 *  3. Delega a decisão ao motor puro `@/lib/journey-engine`
 *  4. Executa o efeito: avançar, esperar, adiar, enviar, gate humano ou sair
 *
 * Regra inviolável: `check_consent` é avaliado ANTES de qualquer despacho e
 * falha do RPC adia (nunca envia às cegas).
 */

const BATCH_SIZE = 25;
/** Nós atravessados por tick numa mesma inscrição (protege contra grafo patológico). */
const MAX_HOPS = 20;
const LOCK_MS = 5 * 60_000;

export const Route = createFileRoute("/api/public/hooks/tick-journeys")({
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
        const db = supabaseAdmin as never as {
          from: (t: string) => any;
          rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
        const nowIso = new Date().toISOString();

        const { data: due, error } = await db
          .from("journey_enrollments")
          .select("id, journey_id, entity_id, current_node_id, state, attempts, context")
          .in("state", ["active", "waiting"])
          .lte("next_run_at", nowIso)
          .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
          .order("next_run_at", { ascending: true })
          .limit(BATCH_SIZE);
        if (error) {
          console.error("[tick-journeys] fetch due", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        if (!due || due.length === 0) return Response.json({ ok: true, processed: 0 });

        const { loadBlockedChannels } = await import("@/lib/budget.server");
        const budgetBlocked = await loadBlockedChannels(supabaseAdmin as never);

        const stats = {
          processed: 0,
          sent: 0,
          waiting: 0,
          deferred: 0,
          exited: 0,
          goals: 0,
          failed: 0,
          queued_approval: 0,
        };

        const log = async (
          enrollmentId: string,
          nodeId: string | null,
          action: string,
          detail: Record<string, unknown>,
        ) => {
          await db
            .from("journey_enrollment_events")
            .insert({ enrollment_id: enrollmentId, node_id: nodeId, action, detail });
        };

        for (const enrollment of due) {
          const lockUntil = new Date(Date.now() + LOCK_MS).toISOString();
          const { data: locked } = await db
            .from("journey_enrollments")
            .update({ locked_until: lockUntil, state: "active" })
            .eq("id", enrollment.id)
            .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
            .select("id")
            .maybeSingle();
          if (!locked) continue;

          const { data: journey } = await db
            .from("journeys")
            .select(
              "id, name, status, requires_human_approval, send_window_start, send_window_end",
            )
            .eq("id", enrollment.journey_id)
            .maybeSingle();

          // Jornada pausada/arquivada: solta o lock e espera reativação.
          if (!journey || journey.status !== "active") {
            await db
              .from("journey_enrollments")
              .update({
                locked_until: null,
                state: "waiting",
                last_error: "jornada não está ativa",
                next_run_at: new Date(Date.now() + 3_600_000).toISOString(),
              })
              .eq("id", enrollment.id);
            continue;
          }

          const [{ data: nodeRows }, { data: edgeRows }] = await Promise.all([
            db.from("journey_nodes").select("id, kind, label, config").eq("journey_id", journey.id),
            db
              .from("journey_edges")
              .select("from_node_id, to_node_id, branch, ordinal")
              .eq("journey_id", journey.id),
          ]);

          const nodes: JourneyNode[] = (nodeRows ?? []).map((n: any) => ({
            id: n.id,
            kind: n.kind,
            label: n.label ?? undefined,
            config: (n.config ?? {}) as Record<string, unknown>,
          }));
          const edges: JourneyEdge[] = (edgeRows ?? []).map((e: any) => ({
            from_node_id: e.from_node_id,
            to_node_id: e.to_node_id,
            branch: e.branch,
            ordinal: e.ordinal ?? 0,
          }));
          const byId = new Map(nodes.map((n) => [n.id, n]));

          let currentId: string | null =
            enrollment.current_node_id ?? nodes.find((n) => n.kind === "trigger")?.id ?? null;
          if (!currentId) {
            stats.failed++;
            await db
              .from("journey_enrollments")
              .update({
                state: "failed",
                locked_until: null,
                finished_at: nowIso,
                last_error: "jornada sem gatilho de entrada",
              })
              .eq("id", enrollment.id);
            continue;
          }

          const { data: entity } = await db
            .from("entity_map")
            .select("id, display_name, singu_id, metadata")
            .eq("id", enrollment.entity_id)
            .maybeSingle();
          if (!entity) {
            stats.failed++;
            await db
              .from("journey_enrollments")
              .update({
                state: "failed",
                locked_until: null,
                finished_at: nowIso,
                last_error: "contato não encontrado",
              })
              .eq("id", enrollment.id);
            continue;
          }

          const profile = {
            display_name: entity.display_name,
            ...((entity.metadata as Record<string, unknown> | null) ?? {}),
            context: (enrollment.context ?? {}) as Record<string, unknown>,
          } as Record<string, unknown>;

          let hops = 0;
          let settled = false;

          while (!settled && hops < MAX_HOPS) {
            hops++;
            const node = byId.get(currentId!);
            if (!node) {
              stats.failed++;
              await db
                .from("journey_enrollments")
                .update({
                  state: "failed",
                  locked_until: null,
                  finished_at: new Date().toISOString(),
                  last_error: "etapa atual não existe mais no fluxo",
                })
                .eq("id", enrollment.id);
              settled = true;
              break;
            }

            // Consentimento só é consultado em etapa de envio (economia de RPC).
            let consentAllowed: boolean | null = null;
            const channel =
              node.kind === "send" && typeof node.config.channel === "string"
                ? node.config.channel.trim().toLowerCase()
                : "";
            if (channel) {
              // Falha do RPC (erro PostgREST ou exceção de transporte) jamais
              // pode virar envio às cegas: adia e tenta de novo em 15 min.
              let consent: unknown = null;
              let consentErr: { message: string } | null = null;
              try {
                const res = await db.rpc("check_consent", {
                  _entity_id: enrollment.entity_id,
                  _channel: channel,
                });
                consent = res.data;
                consentErr = res.error;
              } catch (err) {
                consentErr = { message: err instanceof Error ? err.message : String(err) };
              }
              if (consentErr) {
                stats.deferred++;
                await db
                  .from("journey_enrollments")
                  .update({
                    state: "waiting",
                    locked_until: null,
                    next_run_at: new Date(Date.now() + 15 * 60_000).toISOString(),
                    last_error: `check_consent indisponível: ${consentErr.message}`,
                  })
                  .eq("id", enrollment.id);
                settled = true;
                break;
              }
              consentAllowed = typeof consent === "boolean" ? consent : null;
            }

            const decision = decideJourneyAction({
              node,
              edges,
              profile,
              consentAllowed,
              budgetBlocked: channel ? budgetBlocked.has(channel) : false,
              budgetReason: "teto de orçamento atingido",
              requiresHumanApproval: journey.requires_human_approval === true,
              seed: enrollment.id,
              sendWindowStart: journey.send_window_start ?? 0,
              sendWindowEnd: journey.send_window_end ?? 24,
              now: Date.now(),
            });

            if (decision.action === "advance") {
              await log(enrollment.id, node.id, "advance", { branch: decision.branch });
              currentId = decision.toNodeId;
              await db
                .from("journey_enrollments")
                .update({ current_node_id: currentId })
                .eq("id", enrollment.id);
              continue;
            }

            if (decision.action === "wait") {
              stats.waiting++;
              await log(enrollment.id, node.id, "wait", { resume_at: decision.resumeAt });
              await db
                .from("journey_enrollments")
                .update({
                  current_node_id: decision.toNodeId,
                  state: "waiting",
                  locked_until: null,
                  next_run_at: decision.resumeAt,
                  last_error: null,
                })
                .eq("id", enrollment.id);
              settled = true;
              break;
            }

            if (decision.action === "defer") {
              stats.deferred++;
              await log(enrollment.id, node.id, "defer", { reason: decision.reason });
              await db
                .from("journey_enrollments")
                .update({
                  state: "waiting",
                  locked_until: null,
                  next_run_at: decision.resumeAt,
                  last_error: decision.reason,
                })
                .eq("id", enrollment.id);
              settled = true;
              break;
            }

            if (decision.action === "goal_reached" || decision.action === "exit") {
              if (decision.action === "goal_reached") stats.goals++;
              else stats.exited++;
              await log(enrollment.id, node.id, decision.action, { reason: decision.reason });
              await db
                .from("journey_enrollments")
                .update({
                  state: decision.action === "goal_reached" ? "completed" : "exited",
                  locked_until: null,
                  finished_at: new Date().toISOString(),
                  last_error: decision.reason,
                })
                .eq("id", enrollment.id);
              settled = true;
              break;
            }

            if (decision.action === "fail") {
              stats.failed++;
              await log(enrollment.id, node.id, "fail", { reason: decision.reason });
              await db
                .from("journey_enrollments")
                .update({
                  state: "failed",
                  locked_until: null,
                  finished_at: new Date().toISOString(),
                  last_error: decision.reason,
                })
                .eq("id", enrollment.id);
              settled = true;
              break;
            }

            // --- envio / gate humano ---------------------------------------
            const { resolveJourneyMessage, dispatchJourneyMessage } = await import(
              "@/lib/journey-dispatch.server"
            );
            const contact = {
              id: entity.id,
              display_name: entity.display_name ?? null,
              singu_id: entity.singu_id ?? null,
              metadata: (entity.metadata as Record<string, unknown> | null) ?? null,
            };
            const message = await resolveJourneyMessage(db, decision.config, contact);
            if (!message) {
              stats.failed++;
              await log(enrollment.id, node.id, "fail", { reason: "etapa sem conteúdo" });
              await db
                .from("journey_enrollments")
                .update({
                  state: "failed",
                  locked_until: null,
                  finished_at: new Date().toISOString(),
                  last_error: "etapa de envio sem conteúdo (body ou template_id)",
                })
                .eq("id", enrollment.id);
              settled = true;
              break;
            }

            const isApproval = decision.action === "approval_gate";
            const { data: tp } = await db
              .from("contact_touchpoints")
              .insert({
                entity_id: entity.id,
                channel: decision.channel,
                direction: "outbound",
                status: isApproval ? "pending_approval" : "queued",
                payload: {
                  message: message.body,
                  subject: message.subject,
                  journey_id: journey.id,
                  journey_node_id: node.id,
                  enrollment_id: enrollment.id,
                },
              })
              .select("id")
              .maybeSingle();

            if (isApproval) {
              stats.queued_approval++;
              await log(enrollment.id, node.id, "approval_gate", { channel: decision.channel });
              // O envio real ocorre na aprovação; a inscrição segue no mesmo nó
              // e é reavaliada em 1h caso o operador ainda não tenha decidido.
              await db
                .from("journey_enrollments")
                .update({
                  state: "waiting",
                  locked_until: null,
                  next_run_at: new Date(Date.now() + 3_600_000).toISOString(),
                  last_error: "aguardando aprovação humana",
                })
                .eq("id", enrollment.id);
              settled = true;
              break;
            }

            let result;
            try {
              result = await dispatchJourneyMessage({
                channel: decision.channel,
                contact,
                message,
                touchpointId: tp?.id ?? null,
                journeyId: journey.id,
              });
            } catch (err) {
              result = {
                status: "failed" as const,
                error: err instanceof Error ? err.message : String(err),
              };
            }

            if (tp?.id) {
              await db
                .from("contact_touchpoints")
                .update({ status: result.status, error: result.error })
                .eq("id", tp.id);
            }

            if (result.status === "failed") {
              const attempts = (enrollment.attempts ?? 0) + 1;
              stats.failed++;
              await log(enrollment.id, node.id, "send_failed", { error: result.error });
              // Falha de envio nunca encerra a jornada: reprograma com backoff.
              await db
                .from("journey_enrollments")
                .update({
                  state: attempts >= 5 ? "failed" : "waiting",
                  attempts,
                  locked_until: null,
                  finished_at: attempts >= 5 ? new Date().toISOString() : null,
                  next_run_at: new Date(Date.now() + attempts * 15 * 60_000).toISOString(),
                  last_error: result.error,
                })
                .eq("id", enrollment.id);
              settled = true;
              break;
            }

            stats.sent++;
            await log(enrollment.id, node.id, "sent", {
              channel: decision.channel,
              status: result.status,
            });

            if (!decision.nextNodeId) {
              await db
                .from("journey_enrollments")
                .update({
                  state: "completed",
                  locked_until: null,
                  finished_at: new Date().toISOString(),
                  last_error: null,
                })
                .eq("id", enrollment.id);
              settled = true;
              break;
            }

            currentId = decision.nextNodeId;
            await db
              .from("journey_enrollments")
              .update({
                current_node_id: currentId,
                attempts: 0,
                locked_until: null,
                state: "active",
                next_run_at: new Date().toISOString(),
                last_error: null,
              })
              .eq("id", enrollment.id);
            settled = true;
          }

          if (!settled) {
            // Excedeu o limite de saltos: solta o lock e retoma no próximo tick.
            await db
              .from("journey_enrollments")
              .update({
                current_node_id: currentId,
                locked_until: null,
                state: "active",
                next_run_at: new Date(Date.now() + 60_000).toISOString(),
                last_error: "limite de etapas por ciclo atingido",
              })
              .eq("id", enrollment.id);
          }

          stats.processed++;
        }

        return Response.json({ ok: true, ...stats });
      },
    },
  },
});