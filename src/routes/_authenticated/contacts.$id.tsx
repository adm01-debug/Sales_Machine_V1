import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getContactProfile } from "@/lib/profile360.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";

export const Route = createFileRoute("/_authenticated/contacts/$id")({
  head: () => ({
    meta: [
      { title: "Ficha 360 · Sales Machine" },
      {
        name: "description",
        content: "Histórico completo de interações, consentimento e campanhas de um contato.",
      },
    ],
  }),
  component: ContactDetailPage,
});

function ContactDetailPage() {
  const { id } = Route.useParams();
  const fetchProfile = useServerFn(getContactProfile);
  const query = useQuery({
    queryKey: ["mkt", "profile", id],
    queryFn: () => fetchProfile({ data: { entity_id: id } }),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Carregando ficha…</p>;
  if (query.error)
    return <p className="text-sm text-destructive">{(query.error as Error).message}</p>;

  const d = query.data!;
  const p = d.profile as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <Link to="/contacts" className="text-xs text-muted-foreground hover:underline">
          ← Base unificada
        </Link>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {(p.display_name as string) ?? "Contato"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {(p.kind as string) === "company" ? "Conta" : "Decisor"} · id {id.slice(0, 8)}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Score de sinal" value={Number(p.signal_score ?? 0).toFixed(1)} />
        <MetricCard label="Interações" value={Number(p.touchpoint_count ?? 0)} />
        <MetricCard label="Respostas" value={Number(p.inbound_count ?? 0)} />
        <MetricCard label="Audiências" value={d.audiences.length} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Linha do tempo</CardTitle>
            <CardDescription>Últimas 25 interações registradas.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.touchpoints.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem interações registradas.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.touchpoints.map((t) => (
                  <li key={t.id} className="border-b border-border pb-2 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <Badge variant="outline">{t.channel}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {t.direction === "inbound" ? "recebida" : "enviada"}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {t.error ? <p className="mt-1 text-xs text-destructive">{t.error}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Consentimento</CardTitle>
              <CardDescription>Registro LGPD por canal.</CardDescription>
            </CardHeader>
            <CardContent>
              {d.consent.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sem registro explícito — vale o consentimento presumido do canal.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {d.consent.map((c, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <Badge variant="outline">{c.channel}</Badge>
                      <span
                        className={
                          c.status === "opt_in"
                            ? "text-xs text-muted-foreground"
                            : "text-xs text-destructive"
                        }
                      >
                        {c.status} · {new Date(c.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campanhas</CardTitle>
              <CardDescription>Envios de marketing direcionados a este contato.</CardDescription>
            </CardHeader>
            <CardContent>
              {d.campaign_sends.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum envio de campanha ainda.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {d.campaign_sends.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {(s.marketing_campaigns as { name?: string } | null)?.name ?? "—"}
                      </span>
                      <Badge variant="secondary">{s.state}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tracking de e-mail</CardTitle>
              <CardDescription>Aberturas, cliques e bounces (FUXICO).</CardDescription>
            </CardHeader>
            <CardContent>
              {d.tracking_events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem eventos de rastreio ainda.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {d.tracking_events.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <Badge variant="outline">{e.event_type}</Badge>
                        <span className="text-xs text-muted-foreground">{e.provider}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleString("pt-BR")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
