import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listCampaigns,
  createCampaign,
  listCadenceRules,
} from "@/lib/orchestrator.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const CHANNELS = ["whatsapp", "email", "sms", "linkedin", "instagram"] as const;
type Channel = (typeof CHANNELS)[number];

export const Route = createFileRoute("/_authenticated/prospecting")({
  head: () => ({
    meta: [
      { title: "Campanhas · Sales Machine" },
      { name: "description", content: "Configure cadências multicanal com agentes do FATOR X." },
    ],
  }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const qc = useQueryClient();
  const fetchCampaigns = useServerFn(listCampaigns);
  const fetchRules = useServerFn(listCadenceRules);
  const create = useServerFn(createCampaign);

  const campaignsQ = useQuery({ queryKey: ["sm", "campaigns"], queryFn: () => fetchCampaigns() });
  const rulesQ = useQuery({ queryKey: ["sm", "cadence-rules"], queryFn: () => fetchRules() });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState("");
  const [cadenceId, setCadenceId] = useState("");
  const [channels, setChannels] = useState<Record<Channel, boolean>>({
    whatsapp: true,
    email: true,
    sms: false,
    linkedin: false,
    instagram: false,
  });

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          name,
          description: description || undefined,
          channels: CHANNELS.filter((c) => channels[c]),
          fatorx_agent_id: agentId || undefined,
          cadence_rule_id: cadenceId || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Campanha criada");
      setName("");
      setDescription("");
      setAgentId("");
      setCadenceId("");
      qc.invalidateQueries({ queryKey: ["sm", "campaigns"] });
      qc.invalidateQueries({ queryKey: ["sm", "campaigns", "picker"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao criar"),
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Campanhas</h1>
            <p className="text-sm text-muted-foreground">
              Cada campanha define canais + agente + cadência.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/companies"><Button variant="outline" size="sm">Empresas</Button></Link>
            <Link to="/dashboard"><Button variant="outline" size="sm">Cockpit</Button></Link>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Nova campanha</CardTitle>
            <CardDescription>Ativa imediatamente após criar.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Q4 · CTOs Fintech" />
            </div>
            <div className="space-y-2">
              <Label>Agente FATOR X (ID)</Label>
              <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="opcional · usa default" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Regra de cadência</Label>
              <Select value={cadenceId} onValueChange={setCadenceId}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {(rulesQ.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Canais ativos</Label>
              <div className="flex flex-wrap gap-3">
                {CHANNELS.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={channels[c]}
                      onCheckedChange={(v) => setChannels((s) => ({ ...s, [c]: Boolean(v) }))}
                    />
                    {c}
                    {(c === "linkedin" || c === "instagram") && (
                      <Badge variant="outline" className="text-xxs">stub</Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <Button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !name || CHANNELS.every((c) => !channels[c])}
              >
                Criar campanha
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campanhas existentes</CardTitle>
          </CardHeader>
          <CardContent>
            {campaignsQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (campaignsQ.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma campanha ainda.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(campaignsQ.data ?? []).map((c) => (
                  <li key={c.id} className="flex items-center justify-between border-b py-2 last:border-0">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Canais: {Array.isArray(c.channels) ? c.channels.join(", ") : "—"}
                      </p>
                    </div>
                    <Badge>{c.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}