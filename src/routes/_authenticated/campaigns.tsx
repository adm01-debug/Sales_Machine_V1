import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listMarketingCampaigns, saveMarketingCampaign } from "@/lib/marketing.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({
    meta: [
      { title: "Campanhas · Sales Machine" },
      {
        name: "description",
        content: "Campanhas de marketing multicanal com audiências, variantes A/B e agendamento.",
      },
    ],
  }),
  component: CampaignsPage,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  running: "default",
  scheduled: "secondary",
  draft: "outline",
  paused: "secondary",
  completed: "secondary",
  cancelled: "destructive",
};

function CampaignsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchCampaigns = useServerFn(listMarketingCampaigns);
  const save = useServerFn(saveMarketingCampaign);
  const [name, setName] = useState("");

  const campaigns = useQuery({
    queryKey: ["mkt", "campaigns"],
    queryFn: () => fetchCampaigns(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          name: name.trim(),
          objective: "engagement",
          channel: "email",
          daily_cap: 500,
          requires_human_approval: false,
          variants: [{ label: "A", body: "Escreva sua mensagem aqui.", split_percent: 100 }],
        },
      }),
    onSuccess: (res) => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["mkt", "campaigns"] });
      navigate({ to: "/campaigns/$id", params: { id: res.id! } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Campanhas</h1>
        <p className="text-sm text-muted-foreground">
          Disparos 1:many para audiências, com variantes e controle de cadência de envio.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova campanha</CardTitle>
          <CardDescription>Configure audiência, canal e conteúdo na tela seguinte.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            placeholder="ex.: Lançamento catálogo Q3"
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>
            {createMutation.isPending ? "Criando…" : "Criar"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todas as campanhas</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (campaigns.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma campanha de marketing ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(campaigns.data ?? []).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Link to="/campaigns/$id" params={{ id: c.id }} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {c.audiences?.name ?? "Sem audiência"} · {c.objective}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{c.channel}</Badge>
                    <Badge variant={STATUS_VARIANT[c.status] ?? "outline"}>{c.status}</Badge>
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
