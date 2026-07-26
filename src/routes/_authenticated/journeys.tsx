import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Workflow } from "lucide-react";
import { createJourney, listJourneys, setJourneyStatus } from "@/lib/journeys.functions";
import { STATUS_LABEL, type JourneyStatus } from "@/lib/journey-graph";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/journeys")({
  head: () => ({
    meta: [
      { title: "Jornadas automatizadas · Sales Machine" },
      {
        name: "description",
        content:
          "Monte fluxos multicanal com gatilhos, esperas, condições e testes A/B sobre os dados integrados do ecossistema.",
      },
      { property: "og:title", content: "Jornadas automatizadas · Sales Machine" },
      {
        property: "og:description",
        content: "Automação 360: gatilhos, condições, testes A/B e envio multicanal com guardrails.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JourneysPage,
});

const statusVariant = (status: string) =>
  status === "active" ? "default" : status === "paused" ? "secondary" : "outline";

function JourneysPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchJourneys = useServerFn(listJourneys);
  const create = useServerFn(createJourney);
  const setStatus = useServerFn(setJourneyStatus);
  const [name, setName] = useState("");

  const journeys = useQuery({ queryKey: ["mkt", "journeys"], queryFn: () => fetchJourneys() });

  const createMutation = useMutation({
    mutationFn: () => create({ data: { name: name.trim() } }),
    onSuccess: (res) => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["mkt", "journeys"] });
      navigate({ to: "/journeys/$id", params: { id: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: JourneyStatus }) => setStatus({ data: input }),
    onSuccess: (res) => {
      toast.success(`Jornada ${STATUS_LABEL[res.status as JourneyStatus].toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ["mkt", "journeys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Jornadas automatizadas</h1>
        <p className="text-sm text-muted-foreground">
          Fluxos que reagem a eventos do LUX, SINGU, FATOR X e FUXICO e conduzem o contato passo a
          passo — sempre respeitando consentimento, janela de envio e orçamento.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova jornada</CardTitle>
          <CardDescription>
            Começa como rascunho com gatilho e saída prontos para você editar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Reengajar quem abriu a proposta"
            aria-label="Nome da nova jornada"
          />
          <Button
            onClick={() => createMutation.mutate()}
            disabled={name.trim().length < 2 || createMutation.isPending}
          >
            Criar jornada
          </Button>
        </CardContent>
      </Card>

      {journeys.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : journeys.error ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Não foi possível carregar as jornadas: {(journeys.error as Error).message}
          </CardContent>
        </Card>
      ) : (journeys.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Workflow className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Nenhuma jornada ainda. Crie a primeira acima.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {(journeys.data ?? []).map((j) => (
            <Card key={j.id}>
              <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="truncate text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => navigate({ to: "/journeys/$id", params: { id: j.id } })}
                    >
                      {j.name}
                    </button>
                    <Badge variant={statusVariant(j.status)}>
                      {STATUS_LABEL[j.status as JourneyStatus] ?? j.status}
                    </Badge>
                    {j.requires_human_approval ? (
                      <Badge variant="outline">Aprovação humana</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {j.active_count} em andamento · {j.total_count} inscrições · janela{" "}
                    {j.send_window_start}h–{j.send_window_end}h · teto {j.entry_daily_cap}/dia
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {j.status === "active" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => statusMutation.mutate({ id: j.id, status: "paused" })}
                      disabled={statusMutation.isPending}
                    >
                      Pausar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => statusMutation.mutate({ id: j.id, status: "active" })}
                      disabled={statusMutation.isPending}
                    >
                      Ativar
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate({ to: "/journeys/$id", params: { id: j.id } })}
                  >
                    Editar fluxo
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}