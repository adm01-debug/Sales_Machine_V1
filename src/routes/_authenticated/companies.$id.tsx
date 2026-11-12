import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCompanyDossier } from "@/lib/orchestrator.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const searchSchema = z.object({ name: z.string().optional() });

export const Route = createFileRoute("/_authenticated/companies/$id")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Dossiê da empresa · Sales Machine" },
      { name: "description", content: "Visão unificada LUX + SINGU + FATOR X para uma empresa." },
    ],
  }),
  component: DossierPage,
});

function DossierPage() {
  const { id } = Route.useParams();
  const { name } = useSearch({ from: "/_authenticated/companies/$id" });
  const fetchDossier = useServerFn(getCompanyDossier);
  const q = useQuery({
    queryKey: ["sm", "dossier", id],
    queryFn: () => fetchDossier({ data: { lux_company_id: id, display_name: name } }),
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{name ?? id}</h1>
            <p className="text-sm text-muted-foreground">
              Dossiê unificado — LUX · SINGU · FATOR X
            </p>
          </div>
          <Link to="/companies">
            <Button variant="outline" size="sm">
              Voltar
            </Button>
          </Link>
        </header>

        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Compilando dossiê…</p>
        ) : q.error ? (
          <p className="text-sm text-destructive">Erro: {(q.error as Error).message}</p>
        ) : q.data ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Identidade Sales Machine</CardTitle>
                <CardDescription>Mapeamento cross-system</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Entity ID:</span>{" "}
                  <code className="text-xs">{q.data.entity?.id}</code>
                </p>
                <p>
                  <span className="text-muted-foreground">SINGU contact:</span>{" "}
                  {q.data.entity?.singu_id ?? <Badge variant="outline">não vinculado</Badge>}
                </p>
                <p>
                  <span className="text-muted-foreground">FATOR X thread:</span>{" "}
                  {q.data.entity?.fatorx_thread_id ?? <Badge variant="outline">sem thread</Badge>}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Decisores (LUX)</CardTitle>
                <CardDescription>Resposta bruta do oracle-search-decisors</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(q.data.decisors, null, 2)}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Next Best Action (SINGU)</CardTitle>
                <CardDescription>Recomendação comportamental</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(q.data.singu, null, 2)}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sugestão do agente (FATOR X)</CardTitle>
                <CardDescription>Rascunho multicanal</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(q.data.agent_suggestion, null, 2)}
                </pre>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Últimos touchpoints</CardTitle>
                <CardDescription>Histórico local (Sales Machine)</CardDescription>
              </CardHeader>
              <CardContent>
                {q.data.recent_touchpoints.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum contato registrado ainda.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {q.data.recent_touchpoints.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between border-b py-1 last:border-0"
                      >
                        <span className="flex items-center gap-2">
                          <Badge variant="outline">{t.channel}</Badge>
                          <span className="text-xs text-muted-foreground">{t.direction}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge>{t.status}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(t.created_at).toLocaleString("pt-BR")}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
