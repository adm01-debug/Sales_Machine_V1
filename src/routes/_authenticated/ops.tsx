import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getPipelineHealth,
  getDeliverabilityStats,
  getAlertNotifications,
  getComplianceStats,
} from "@/lib/ops.functions";
import { getTrackingIntegrityReport } from "@/lib/deliverability.functions";
import { buildOpsAlerts } from "@/lib/ops-alerts";
import { AlertHistory } from "@/components/ops/alert-history";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ops")({
  head: () => ({
    meta: [
      { title: "Operações · SALES MACHINE" },
      { name: "description", content: "Painel de saúde do pipeline de prospecção multicanal." },
    ],
  }),
  component: OpsPage,
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8">Não encontrado.</div>,
});

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** Faixa de alertas priorizada: crítico primeiro, silencioso quando tudo está bem. */
function AlertsBanner({ alerts }: { alerts: ReturnType<typeof buildOpsAlerts> }) {
  if (!alerts.length) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-primary">
        ✅ Nenhum alerta ativo — pipeline, entregabilidade e rastreio dentro dos limites.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a) => (
        <li
          key={a.id}
          className={cn(
            "rounded-lg border p-4",
            a.level === "critical"
              ? "border-destructive/40 bg-destructive/5"
              : "border-amber-500/40 bg-amber-500/5",
          )}
        >
          <p
            className={cn(
              "text-sm font-medium",
              a.level === "critical" ? "text-destructive" : "text-amber-600 dark:text-amber-400",
            )}
          >
            {a.level === "critical" ? "🔴" : "🟡"} {a.title}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function OpsPage() {
  const fetchHealth = useServerFn(getPipelineHealth);
  const fetchDeliv = useServerFn(getDeliverabilityStats);
  const health = useQuery({ queryKey: ["ops", "health"], queryFn: () => fetchHealth(), refetchInterval: 30_000 });
  const deliv = useQuery({ queryKey: ["ops", "deliv"], queryFn: () => fetchDeliv(), refetchInterval: 60_000 });
  const fetchTracking = useServerFn(getTrackingIntegrityReport);
  const fetchCompliance = useServerFn(getComplianceStats);
  const compliance = useQuery({
    queryKey: ["ops", "compliance"],
    queryFn: () => fetchCompliance(),
    refetchInterval: 120_000,
  });
  const tracking = useQuery({
    queryKey: ["ops", "tracking"],
    queryFn: () => fetchTracking({ data: { days: 7 } }),
    refetchInterval: 300_000,
  });

  const alerts = buildOpsAlerts({
    health: health.data ?? null,
    deliverability: deliv.data
      ? {
          opened: deliv.data.opened ?? 0,
          clicked: deliv.data.clicked ?? 0,
          hard_bounce: deliv.data.hard_bounce ?? 0,
          complaint: deliv.data.complaint ?? 0,
        }
      : null,
    tracking: tracking.data
      ? {
          sends: tracking.data.sends,
          coverageRate: tracking.data.coverageRate,
          collisions: tracking.data.checks.find((c) => c.id === "collisions")?.count ?? 0,
          redeliveries: tracking.data.checks.find((c) => c.id === "redeliveries")?.count ?? 0,
        }
      : null,
    compliance: compliance.data
      ? {
          blockedByConsent: compliance.data.blockedByConsent,
          deliveryAttempts: tracking.data?.sends ?? health.data?.sent_24h ?? 0,
        }
      : null,
  });

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Painel de Operações</h1>
          <p className="text-sm text-muted-foreground">Saúde do pipeline em tempo real.</p>
        </div>
        <Link to="/dashboard" className="text-sm text-primary hover:underline">← Dashboard</Link>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Alertas</h2>
        <AlertsBanner alerts={alerts} />
      </section>

      <AlertHistory />

      {health.isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : health.data ? (
        <>
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Estados do pipeline</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Na fila" value={health.data.queued} />
              <Stat label="Executando" value={health.data.running} />
              <Stat label="Respondidos" value={health.data.replied} />
              <Stat label="Pausados" value={health.data.paused} />
              <Stat label="Concluídos" value={health.data.completed} />
              <Stat label="Parados" value={health.data.stopped} />
              <Stat label="Perdidos" value={health.data.lost} />
              <Stat label="Dead-letter" value={health.data.dead_letter} hint="requer atenção" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Últimas 24h</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat label="Mensagens enviadas" value={health.data.sent_24h} />
              <Stat label="Respostas recebidas" value={health.data.replies_24h} />
              <Stat label="Opt-outs (7d)" value={health.data.opt_outs_7d} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Deliverability de e-mail (7d)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Aberturas" value={deliv.data?.opened ?? 0} />
              <Stat label="Cliques" value={deliv.data?.clicked ?? 0} />
              <Stat label="Hard bounces" value={deliv.data?.hard_bounce ?? 0} />
              <Stat label="Reclamações" value={deliv.data?.complaint ?? 0} />
              <Stat
                label="Cobertura de rastreio"
                value={tracking.data ? `${tracking.data.coverageRate}%` : "—"}
                hint="meta ≥ 90%"
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Compliance e consentimento (7d)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat
                label="Bloqueios por consentimento"
                value={compliance.data?.blockedByConsent ?? 0}
                hint="alvos interrompidos antes do envio"
              />
              <Stat label="Novos opt-ins" value={compliance.data?.optIns7d ?? 0} />
              <Stat label="Novos opt-outs" value={compliance.data?.optOuts7d ?? 0} />
              <Stat
                label="Canal com mais opt-outs"
                value={
                  Object.entries(compliance.data?.optOutsByChannel ?? {}).sort(
                    (a, b) => b[1] - a[1],
                  )[0]?.[0] ?? "—"
                }
                hint="revisar criativo e frequência"
              />
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            Atualizado em {new Date(health.data.refreshed_at).toLocaleTimeString("pt-BR")}
          </p>
        </>
      ) : null}
    </div>
  );
}