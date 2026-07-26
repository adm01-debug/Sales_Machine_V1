import { createFileRoute } from "@tanstack/react-router";
import { buildOpsAlerts } from "@/lib/ops-alerts";
import { buildTrackingIntegrityReport } from "@/lib/tracking-integrity";
import { planAlertDispatch, buildNotificationPayload } from "@/lib/alert-dispatch";

/**
 * Varredura de alertas operacionais — chamada por pg_cron (sugestão: a cada 15 minutos).
 *
 * Avalia as mesmas regras exibidas em /ops e notifica ativamente um webhook
 * externo (OPS_ALERT_WEBHOOK_URL) quando um alerta abre, persiste além do
 * cooldown ou é resolvido. O estado fica em `ops_alert_notifications`, de modo
 * que reexecuções da varredura são idempotentes.
 */
export const Route = createFileRoute("/api/public/hooks/alert-sweep")({
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
        const now = new Date();
        const nowIso = now.toISOString();
        const since7d = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();

        // 1. Saúde do pipeline (materialized view atualizada na hora).
        await supabaseAdmin.rpc("refresh_pipeline_health" as never);
        const { data: health } = await supabaseAdmin
          .from("v_pipeline_health" as never)
          .select("*")
          .maybeSingle();

        // 2. Entregabilidade dos últimos 7 dias.
        const { data: events } = await supabaseAdmin
          .from("email_deliverability_events")
          .select("event_type, created_at, external_id, touchpoint_id")
          .gte("created_at", since7d);
        const counts: Record<string, number> = {};
        for (const row of events ?? []) {
          counts[row.event_type] = (counts[row.event_type] ?? 0) + 1;
        }

        // 3. Integridade do rastreio (cobertura, colisões, reentregas).
        const { data: touchpoints } = await supabaseAdmin
          .from("contact_touchpoints")
          .select("id, channel, direction, fuxico_tracking_id, created_at")
          .eq("direction", "outbound")
          .gte("created_at", since7d);
        const tracking = buildTrackingIntegrityReport(
          (touchpoints ?? []) as unknown as RawTouchpoint[],
          (events ?? []) as unknown as RawDeliveryEvent[],
        );
        const checkCount = (id: string) =>
          tracking.checks.find((c) => c.id === id)?.count ?? 0;

        const active = buildOpsAlerts({
          health: (health ?? null) as never,
          deliverability: {
            opened: counts.opened ?? 0,
            clicked: counts.clicked ?? 0,
            hard_bounce: counts.hard_bounce ?? 0,
            complaint: counts.complaint ?? 0,
          },
          tracking: {
            sends: tracking.sends,
            coverageRate: tracking.coverageRate,
            collisions: checkCount("collisions"),
            redeliveries: checkCount("redeliveries"),
          },
        });

        // 4. Diferencial contra o estado persistido.
        const { data: storedRows, error: storedErr } = await supabaseAdmin
          .from("ops_alert_notifications")
          .select("id, alert_id, level, last_notified_at, occurrences")
          .is("resolved_at", null);
        if (storedErr) {
          console.error("[alert-sweep] estado", storedErr);
          return Response.json({ ok: false, error: storedErr.message }, { status: 500 });
        }

        const plan = planAlertDispatch(active, storedRows ?? [], now);

        // 5. Persiste o novo estado (sempre, mesmo se o webhook falhar).
        if (plan.toNotify.length > 0) {
          const { error } = await supabaseAdmin.from("ops_alert_notifications").insert(
            plan.toNotify.map((a) => ({
              alert_id: a.id,
              level: a.level,
              title: a.title,
              detail: a.detail,
              first_notified_at: nowIso,
              last_notified_at: nowIso,
              occurrences: 1,
            })),
          );
          if (error) console.error("[alert-sweep] insert", error);
        }
        for (const { alert, stored } of plan.toRemind) {
          await supabaseAdmin
            .from("ops_alert_notifications")
            .update({
              level: alert.level,
              title: alert.title,
              detail: alert.detail,
              last_notified_at: nowIso,
              occurrences: stored.occurrences + 1,
            })
            .eq("id", stored.id);
        }
        for (const { stored } of plan.toTouch) {
          await supabaseAdmin
            .from("ops_alert_notifications")
            .update({ occurrences: stored.occurrences + 1 })
            .eq("id", stored.id);
        }
        if (plan.toResolve.length > 0) {
          await supabaseAdmin
            .from("ops_alert_notifications")
            .update({ resolved_at: nowIso })
            .in(
              "id",
              plan.toResolve.map((r) => r.id),
            );
        }

        // 6. Notificação ativa (opcional — só se o webhook estiver configurado).
        const payload = buildNotificationPayload(plan, now);
        let notified = false;
        let notify_error: string | null = null;
        const webhookUrl = process.env.OPS_ALERT_WEBHOOK_URL;
        if (payload && webhookUrl) {
          try {
            const body = JSON.stringify(payload);
            const headers: Record<string, string> = { "content-type": "application/json" };
            const secret = process.env.OPS_ALERT_WEBHOOK_SECRET;
            if (secret) {
              const { signPayload } = await import("@/lib/hmac.server");
              headers["x-signature"] = `sha256=${signPayload(body, secret)}`;
            }
            const res = await fetch(webhookUrl, { method: "POST", headers, body });
            notified = res.ok;
            if (!res.ok) notify_error = `webhook respondeu ${res.status}`;
          } catch (err) {
            notify_error = err instanceof Error ? err.message : String(err);
            console.error("[alert-sweep] webhook", err);
          }
        }

        return Response.json({
          ok: true,
          active: active.length,
          opened: plan.toNotify.length,
          reminded: plan.toRemind.length,
          resolved: plan.toResolve.length,
          notified,
          notify_error,
        });
      },
    },
  },
});