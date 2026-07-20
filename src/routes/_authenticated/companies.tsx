import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listIcpCompanies,
  listCampaignsForPicker,
  enqueueBatchProspection,
} from "@/lib/orchestrator.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/companies")({
  head: () => ({
    meta: [
      { title: "Empresas ICP · Sales Machine" },
      { name: "description", content: "Selecione empresas do LUX e dispare cadências em lote." },
    ],
  }),
  component: CompaniesPage,
});

function CompaniesPage() {
  const fetchCompanies = useServerFn(listIcpCompanies);
  const fetchCampaigns = useServerFn(listCampaignsForPicker);
  const enqueue = useServerFn(enqueueBatchProspection);

  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [campaignId, setCampaignId] = useState<string>("");

  const companiesQ = useQuery({
    queryKey: ["sm", "companies"],
    queryFn: () => fetchCompanies({ data: {} }),
  });
  const campaignsQ = useQuery({
    queryKey: ["sm", "campaigns", "picker"],
    queryFn: () => fetchCampaigns(),
  });

  const enqueueMut = useMutation({
    mutationFn: (payload: { campaign_id: string; companies: Array<{ lux_id: string; display_name: string }> }) =>
      enqueue({ data: payload }),
    onSuccess: (r) => {
      toast.success(`Enfileirado: ${r.enqueued} · Ignorado: ${r.skipped}`);
      setSelected({});
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao enfileirar"),
  });

  const rows = useMemo(() => {
    const list = companiesQ.data?.companies ?? [];
    if (!filter) return list;
    const q = filter.toLowerCase();
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.industry ?? "").toString().toLowerCase().includes(q),
    );
  }, [companiesQ.data, filter]);

  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
  const selectedRows = rows.filter((r) => selectedIds.includes(r.lux_id));

  function toggleAll(v: boolean) {
    const next: Record<string, boolean> = {};
    if (v) for (const r of rows) next[r.lux_id] = true;
    setSelected(next);
  }

  function handleEnqueue() {
    if (!campaignId) return toast.error("Selecione uma campanha");
    if (selectedRows.length === 0) return toast.error("Selecione ao menos uma empresa");
    enqueueMut.mutate({
      campaign_id: campaignId,
      companies: selectedRows.map((r) => ({ lux_id: r.lux_id, display_name: r.name })),
    });
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Empresas ICP</h1>
            <p className="text-sm text-muted-foreground">
              Lista vinda do LUX. Selecione várias e dispare uma cadência em lote.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/campaigns"><Button variant="outline" size="sm">Campanhas</Button></Link>
            <Link to="/dashboard"><Button variant="outline" size="sm">Cockpit</Button></Link>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Prospecção em lote</CardTitle>
            <CardDescription>
              Selecione uma campanha ativa e as empresas alvo. O worker roda a cadência automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <Input
                placeholder="Filtrar por nome ou setor…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="max-w-sm"
              />
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger className="max-w-sm">
                  <SelectValue placeholder="Selecione a campanha…" />
                </SelectTrigger>
                <SelectContent>
                  {(campaignsQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {c.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleEnqueue}
                disabled={enqueueMut.isPending || selectedIds.length === 0 || !campaignId}
              >
                Iniciar em lote ({selectedIds.length})
              </Button>
            </div>

            {companiesQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando empresas…</p>
            ) : companiesQ.data?.error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Não consegui ler do LUX</p>
                <p className="text-muted-foreground">{companiesQ.data.error}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Configure os secrets <code>LUX_URL</code> e <code>LUX_SERVICE_KEY</code> nas configurações do projeto.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="w-10 p-2">
                        <Checkbox
                          checked={rows.length > 0 && selectedIds.length === rows.length}
                          onCheckedChange={(v) => toggleAll(Boolean(v))}
                        />
                      </th>
                      <th className="p-2">Empresa</th>
                      <th className="p-2">Setor</th>
                      <th className="p-2">Porte</th>
                      <th className="p-2">Status</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-muted-foreground">
                          Nenhuma empresa retornada pelo LUX.
                        </td>
                      </tr>
                    ) : (
                      rows.map((c) => (
                        <tr key={c.lux_id} className="border-t">
                          <td className="p-2">
                            <Checkbox
                              checked={!!selected[c.lux_id]}
                              onCheckedChange={(v) =>
                                setSelected((s) => ({ ...s, [c.lux_id]: Boolean(v) }))
                              }
                            />
                          </td>
                          <td className="p-2 font-medium">{c.name}</td>
                          <td className="p-2 text-muted-foreground">{c.industry ?? "—"}</td>
                          <td className="p-2 text-muted-foreground">{String(c.size ?? "—")}</td>
                          <td className="p-2">
                            {c.in_campaign ? (
                              <Badge>Em cadência</Badge>
                            ) : c.entity_id ? (
                              <Badge variant="secondary">Conhecida</Badge>
                            ) : (
                              <Badge variant="outline">Nova</Badge>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <Link
                              to="/companies/$id"
                              params={{ id: c.lux_id }}
                              search={{ name: c.name }}
                            >
                              <Button size="sm" variant="ghost">Dossiê</Button>
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}