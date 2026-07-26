import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listAudiences, saveAudience, refreshAudience } from "@/lib/audiences.functions";
import { defaultAudienceRules } from "@/lib/audience-rules";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/audiences")({
  head: () => ({
    meta: [
      { title: "Audiências · Sales Machine" },
      {
        name: "description",
        content:
          "Crie segmentos dinâmicos sobre os dados integrados de LUX, SINGU e FATOR X para alimentar campanhas.",
      },
    ],
  }),
  component: AudiencesPage,
});

function AudiencesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchAudiences = useServerFn(listAudiences);
  const save = useServerFn(saveAudience);
  const refresh = useServerFn(refreshAudience);
  const [name, setName] = useState("");

  const audiences = useQuery({ queryKey: ["mkt", "audiences"], queryFn: () => fetchAudiences() });

  const createMutation = useMutation({
    mutationFn: () => save({ data: { name: name.trim(), rules: defaultAudienceRules } }),
    onSuccess: (res) => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["mkt", "audiences"] });
      navigate({ to: "/audiences/$id", params: { id: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshMutation = useMutation({
    mutationFn: (id: string) => refresh({ data: { id } }),
    onSuccess: (res) => {
      toast.success(`Audiência atualizada: ${res.member_count} membros`);
      queryClient.invalidateQueries({ queryKey: ["mkt", "audiences"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Audiências</h1>
        <p className="text-sm text-muted-foreground">
          Segmentos dinâmicos construídos sobre a base unificada de contatos e contas.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova audiência</CardTitle>
          <CardDescription>Comece pelo nome e refine os filtros na tela seguinte.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            placeholder="ex.: Indústrias com alto sinal"
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Criando…" : "Criar"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audiências ativas</CardTitle>
        </CardHeader>
        <CardContent>
          {audiences.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (audiences.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma audiência criada ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(audiences.data ?? []).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Link to="/audiences/$id" params={{ id: a.id }} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {a.last_refreshed_at
                        ? `Atualizada em ${new Date(a.last_refreshed_at).toLocaleString("pt-BR")}`
                        : "Nunca materializada"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{a.member_count} membros</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => refreshMutation.mutate(a.id)}
                      disabled={refreshMutation.isPending}
                    >
                      Atualizar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
