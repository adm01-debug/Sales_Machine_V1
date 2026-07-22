import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPipelineHealth, getDeliverabilityStats } from "@/lib/ops.functions";

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

function OpsPage() {
  const fetchHealth = useServerFn(getPipelineHealth);
  const fetchDeliv = useServerFn(getDeliverabilityStats);
  const health = useQuery({ queryKey: ["ops", "health"], queryFn: () => fetchHealth(), refetchInterval: 30_000 });
  const deliv = useQuery({ queryKey: ["ops", "deliv"], queryFn: () => fetchDeliv(), refetchInterval: 60_000 });

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Painel de Operações</h1>
          <p className="text-sm text-muted-foreground">Saúde do pipeline em tempo real.</p>
        </div>
        <Link to="/dashboard" className="text-sm text-primary hover:underline">← Dashboard</Link>
      </header>

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