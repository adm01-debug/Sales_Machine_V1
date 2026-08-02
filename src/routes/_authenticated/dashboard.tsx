import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMarketingOverview } from "@/lib/marketing.functions";
import { listRecentEvents } from "@/lib/orchestrator.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Visão Geral · Sales Machine" },
      {
        name: "description",
        content:
          "Painel de marketing multicanal: alcance das audiências, engajamento por canal e desempenho das campanhas.",
      },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const fetchOverview = useServerFn(getMarketingOverview);
  const fetchEvents = useServerFn(listRecentEvents);
  const overview = useQuery({ queryKey: ["mkt", "overview"], queryFn: () => fetchOverview() });
  const events = useQuery({ queryKey: ["sm", "events"], queryFn: () => fetchEvents() });

  const data = overview.data;
  const channels = Object.entries(data?.by_channel ?? {});
  const sent = channels.reduce((a, [, c]) => a + c.sent, 0);
  const replies = channels.reduce((a, [, c]) => a + c.replies, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="surface-hero flex flex-wrap items-end justify-between gap-4 rounded-2xl p-6">
        <div>
          <p className="text-xxs font-semibold uppercase tracking-[0.18em] text-primary">
            Campaign Intelligence Engine
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Visão Geral</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Marketing multicanal alimentado por LUX · SINGU · FATOR X
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/audiences">
            <Button variant="outline" size="sm">Audiências</Button>
          </Link>
          <Link to="/campaigns">
            <Button variant="premium" size="sm">Campanhas</Button>
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Alcance nas audiências"
          value={data?.reach ?? 0}
          hint={`${data?.audience_count ?? 0} audiências ativas`}
          loading={overview.isLoading}
          accent="cyan"
        />
        <MetricCard
          label="Campanhas em execução"
          value={data?.running ?? 0}
          hint={`${data?.campaign_count ?? 0} no total`}
          loading={overview.isLoading}
          accent="purple"
        />
        <MetricCard
          label="Mensagens enviadas (30d)"
          value={sent}
          loading={overview.isLoading}
          accent="amber"
        />
        <MetricCard
          label="Respostas recebidas (30d)"
          value={replies}
          hint={sent > 0 ? `${((replies / sent) * 100).toFixed(1)}% de resposta` : undefined}
          loading={overview.isLoading}
          accent="lime"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Desempenho por canal</CardTitle>
            <CardDescription>Envios e respostas dos últimos 30 dias.</CardDescription>
          </CardHeader>
          <CardContent>
            {channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem atividade registrada ainda.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {channels.map(([channel, v]) => (
                  <li
                    key={channel}
                    className="flex items-center justify-between border-b border-border py-1 last:border-0"
                  >
                    <Badge variant="cyan">{channel}</Badge>
                    <span className="text-muted-foreground">
                      {v.sent} enviadas · {v.replies} respostas
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Principais campanhas</CardTitle>
            <CardDescription>Ordenadas por volume de envios materializados.</CardDescription>
          </CardHeader>
          <CardContent>
            {(data?.campaigns ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma campanha de marketing criada ainda.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(data?.campaigns ?? []).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between border-b border-border py-1 last:border-0"
                  >
                    <Link to="/campaigns/$id" params={{ id: c.id }} className="hover:underline">
                      {c.name}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{c.sends} envios</span>
                      <Badge variant="purple">{c.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Sinais recentes dos sistemas integrados</CardTitle>
          <CardDescription>Eventos recebidos de LUX, SINGU e FATOR X.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (events.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum evento ainda. Configure os webhooks nos sistemas externos.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(events.data ?? []).slice(0, 10).map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between border-b border-border py-1 last:border-0"
                >
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{e.source}</Badge>
                    <span className="font-mono text-xs">{e.event_type}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.received_at).toLocaleString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
