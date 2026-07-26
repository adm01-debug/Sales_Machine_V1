import { createFileRoute } from "@tanstack/react-router";
import {
  decideScheduledReallocation,
  policyFromEnv,
} from "@/lib/budget-reallocation-schedule";

/**
 * Realocação automática de teto entre canais — chamada por pg_cron
 * (sugestão: a cada 30 minutos).
 *
 * Recalcula o plano no instante da execução, aplica a política de segurança
 * (cooldown, valor mínimo e teto percentual) e só então grava. `dry_run: true`
 * no corpo devolve a decisão sem alterar nada.
 */
export const Route = createFileRoute("/api/public/hooks/budget-reallocate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || apikey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        let dryRun = false;
        try {
          const body = (await request.json()) as { dry_run?: boolean } | null;
          dryRun = body?.dry_run === true;
        } catch {
          // Corpo vazio é o caso normal do pg_cron.
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { previewReallocation, applyReallocation, listReallocationHistory } =
          await import("@/lib/budget-reallocation.server");

        const now = new Date();
        try {
          const plan = await previewReallocation(supabaseAdmin as never, now);
          const [last] = await listReallocationHistory(supabaseAdmin as never, 1);
          const decision = decideScheduledReallocation(
            {
              movedTotal: plan.movedTotal,
              totalBefore: plan.totalBefore,
              channelsChanged: plan.changes.length,
              lastAppliedAt: last?.appliedAt ?? null,
              now,
            },
            policyFromEnv(process.env as Record<string, string | undefined>),
          );

          if (!decision.shouldApply || dryRun) {
            return Response.json({
              ok: true,
              applied: 0,
              dry_run: dryRun,
              decision,
              moved_total: plan.movedTotal,
            });
          }

          const result = await applyReallocation(supabaseAdmin as never, now, null);
          return Response.json({
            ok: true,
            applied: result.applied,
            dry_run: false,
            decision,
            moved_total: result.plan.movedTotal,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[budget-reallocate]", err);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
