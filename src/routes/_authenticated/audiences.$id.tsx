import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getAudience,
  previewAudience,
  refreshAudience,
  saveAudience,
} from "@/lib/audiences.functions";
import { defaultAudienceRules, type AudienceRules } from "@/lib/audience-rules";
import { AudienceRuleBuilder } from "@/components/audience-rule-builder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/audiences/$id")({
  head: () => ({
    meta: [
      { title: "Editar audiência · Sales Machine" },
      {
        name: "description",
        content: "Ajuste os filtros do segmento e veja a contagem de contatos em tempo real.",
      },
    ],
  }),
  component: AudienceDetailPage,
});

function AudienceDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchAudience = useServerFn(getAudience);
  const preview = useServerFn(previewAudience);
  const save = useServerFn(saveAudience);
  const refresh = useServerFn(refreshAudience);

  const [name, setName] = useState("");
  const [rules, setRules] = useState<AudienceRules>(defaultAudienceRules);

  const audience = useQuery({
    queryKey: ["mkt", "audience", id],
    queryFn: () => fetchAudience({ data: { id } }),
  });

  useEffect(() => {
    if (audience.data) {
      setName(audience.data.audience.name);
      setRules(audience.data.rules);
    }
  }, [audience.data]);

  const previewQuery = useQuery({
    queryKey: ["mkt", "audience-preview", id, rules],
    queryFn: () => preview({ data: { rules } }),
    enabled: !!audience.data,
  });

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { id, name: name.trim(), rules } }),
    onSuccess: () => {
      toast.success("Audiência salva");
      queryClient.invalidateQueries({ queryKey: ["mkt", "audience", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshMutation = useMutation({
    mutationFn: () => refresh({ data: { id } }),
    onSuccess: (res) => {
      toast.success(`${res.member_count} membros materializados`);
      queryClient.invalidateQueries({ queryKey: ["mkt", "audience", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (audience.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando audiência…</p>;
  }
  if (audience.error) {
    return <p className="text-sm text-destructive">{(audience.error as Error).message}</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/audiences" className="text-xs text-muted-foreground hover:underline">
            ← Audiências
          </Link>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{name || "Audiência"}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Salvar
          </Button>
          <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
            {refreshMutation.isPending ? "Materializando…" : "Materializar membros"}
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros do segmento</CardTitle>
            <CardDescription>
              As regras são avaliadas no servidor sobre a base unificada — nenhum dado sai da plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="audience-name" className="text-sm font-medium">
                Nome
              </label>
              <Input id="audience-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <AudienceRuleBuilder rules={rules} onChange={setRules} />
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle className="text-base">Prévia</CardTitle>
            <CardDescription>Contagem estimada com os filtros atuais.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-bold tabular-nums">
              {previewQuery.isFetching ? "…" : (previewQuery.data?.count ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">contatos correspondem</p>
            <ul className="space-y-1 text-sm">
              {(previewQuery.data?.sample ?? []).map((s) => (
                <li key={s.entity_id} className="flex items-center justify-between gap-2">
                  <Link
                    to="/contacts/$id"
                    params={{ id: s.entity_id }}
                    className="truncate hover:underline"
                  >
                    {s.display_name ?? "—"}
                  </Link>
                  <Badge variant="outline">{Number(s.signal_score ?? 0).toFixed(1)}</Badge>
                </li>
              ))}
            </ul>
            {audience.data ? (
              <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                Materializados: {audience.data.audience.member_count}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
