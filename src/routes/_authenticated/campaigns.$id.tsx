import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getMarketingCampaign,
  launchMarketingCampaign,
  saveMarketingCampaign,
  setCampaignStatus,
} from "@/lib/marketing.functions";
import { getVariableCoverage, listAudienceSample } from "@/lib/marketing.functions";
import { listAudiences } from "@/lib/audiences.functions";
import { validateCampaign, hasBlockingIssues } from "@/lib/campaign-validation";
import { TEMPLATE_VARS } from "@/lib/template-vars";
import { TemplatePickerDialog, type PickedTemplate } from "@/components/template-picker-dialog";
import { upsertTemplate } from "@/lib/templates.functions";
import { CampaignValidationPanel } from "@/components/campaign-validation-panel";
import { MessagePreview } from "@/components/message-preview";
import { CHANNELS } from "@/lib/audience-rules";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  head: () => ({
    meta: [
      { title: "Editar campanha · Sales Machine" },
      {
        name: "description",
        content: "Defina audiência, canal, variantes A/B e lance a campanha de marketing.",
      },
    ],
  }),
  component: CampaignDetailPage,
});

const OBJECTIVES = ["awareness", "engagement", "conversion", "reactivation", "announcement"] as const;

interface VariantDraft {
  label: string;
  subject?: string;
  body: string;
  media_url?: string;
  split_percent: number;
}

function CampaignDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchCampaign = useServerFn(getMarketingCampaign);
  const fetchAudiences = useServerFn(listAudiences);
  const fetchSample = useServerFn(listAudienceSample);
  const fetchCoverage = useServerFn(getVariableCoverage);
  const saveTemplate = useServerFn(upsertTemplate);
  const save = useServerFn(saveMarketingCampaign);
  const launch = useServerFn(launchMarketingCampaign);
  const changeStatus = useServerFn(setCampaignStatus);

  const [name, setName] = useState("");
  const [objective, setObjective] = useState<(typeof OBJECTIVES)[number]>("engagement");
  const [channel, setChannel] = useState<string>("email");
  const [audienceId, setAudienceId] = useState<string>("");
  const [dailyCap, setDailyCap] = useState(500);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [variants, setVariants] = useState<VariantDraft[]>([
    { label: "A", body: "", split_percent: 100 },
  ]);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [previewVariant, setPreviewVariant] = useState(0);
  const [previewContactId, setPreviewContactId] = useState<string>("");

  const campaign = useQuery({
    queryKey: ["mkt", "campaign", id],
    queryFn: () => fetchCampaign({ data: { id } }),
  });
  const audiences = useQuery({ queryKey: ["mkt", "audiences"], queryFn: () => fetchAudiences() });

  useEffect(() => {
    const c = campaign.data?.campaign;
    if (!c) return;
    setName(c.name);
    setObjective(c.objective as (typeof OBJECTIVES)[number]);
    setChannel(c.channel);
    setAudienceId(c.audience_id ?? "");
    setDailyCap(c.daily_cap ?? 500);
    setRequiresApproval(!!c.requires_human_approval);
    const v = campaign.data?.variants ?? [];
    if (v.length > 0) {
      setVariants(
        v.map((x) => ({
          label: x.label,
          subject: x.subject ?? undefined,
          body: x.body,
          media_url: x.media_url ?? undefined,
          split_percent: x.split_percent,
        })),
      );
    }
  }, [campaign.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id,
          name: name.trim(),
          objective,
          channel: channel as never,
          audience_id: audienceId || undefined,
          daily_cap: dailyCap,
          requires_human_approval: requiresApproval,
          variants: variants.map((v) => ({
            label: v.label,
            subject: v.subject || undefined,
            body: v.body,
            media_url: v.media_url || undefined,
            split_percent: v.split_percent,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Campanha salva");
      queryClient.invalidateQueries({ queryKey: ["mkt", "campaign", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const launchMutation = useMutation({
    mutationFn: () => launch({ data: { id } }),
    onSuccess: (res) => {
      toast.success(`${res.queued} envios materializados`);
      queryClient.invalidateQueries({ queryKey: ["mkt", "campaign", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => changeStatus({ data: { id, status: status as never } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mkt", "campaign", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Amostra de contatos reais da audiência para a prévia e a cobertura de variáveis.
  const sample = useQuery({
    queryKey: ["mkt", "sample", audienceId],
    queryFn: () => fetchSample({ data: { audience_id: audienceId, limit: 10 } }),
    enabled: !!audienceId,
  });

  const variantTexts = variants.flatMap((v) => [v.body, v.subject ?? ""]).filter(Boolean);
  const coverage = useQuery({
    queryKey: ["mkt", "coverage", audienceId, variantTexts.join("|")],
    queryFn: () => fetchCoverage({ data: { audience_id: audienceId, texts: variantTexts.slice(0, 10) } }),
    enabled: !!audienceId && variantTexts.length > 0,
  });

  const selectedAudience = (audiences.data ?? []).find((a) => a.id === audienceId);
  const issues = validateCampaign({
    name,
    channel: channel as never,
    audience_id: audienceId || null,
    audience_size: selectedAudience?.member_count ?? undefined,
    variants: variants.map((v) => ({
      label: v.label,
      subject: v.subject ?? null,
      body: v.body,
      media_url: v.media_url ?? null,
      rcs_payload: null,
      split_percent: v.split_percent,
    })),
  });
  const blocked = hasBlockingIssues(issues);

  const previewContact = (sample.data ?? []).find((c) => c.id === previewContactId);
  const activeVariant = variants[Math.min(previewVariant, variants.length - 1)];

  const applyTemplate = (idx: number, tpl: PickedTemplate) => {
    updateVariant(idx, {
      body: tpl.body,
      subject: tpl.subject ?? undefined,
      media_url: tpl.media_url ?? undefined,
    });
    toast.success(`Template "${tpl.name}" aplicado à variante ${variants[idx]?.label ?? ""}`);
  };

  // Devolve o criativo para a Biblioteca, reaproveitando as mesmas regras de validação.
  const saveAsTemplateMutation = useMutation({
    mutationFn: async (idx: number) => {
      const v = variants[idx];
      if (!v?.body.trim()) throw new Error("Escreva o corpo antes de salvar como template");
      return saveTemplate({
        data: {
          name: `${name.trim() || "Campanha"} · variante ${v.label}`,
          channel: channel as never,
          subject: channel === "email" ? (v.subject ?? null) : null,
          body: v.body,
          media_url: v.media_url || null,
          rcs_payload: null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Criativo salvo na Biblioteca");
      queryClient.invalidateQueries({ queryKey: ["sm", "templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const insertVar = (idx: number, key: string) =>
    updateVariant(idx, { body: `${variants[idx]?.body ?? ""}{{${key}}}` });

  const totalSplit = variants.reduce((a, v) => a + v.split_percent, 0);
  const status = campaign.data?.campaign.status ?? "draft";

  const updateVariant = (idx: number, patch: Partial<VariantDraft>) =>
    setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));

  if (campaign.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (campaign.error)
    return <p className="text-sm text-destructive">{(campaign.error as Error).message}</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/campaigns" className="text-xs text-muted-foreground hover:underline">
            ← Campanhas
          </Link>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{name || "Campanha"}</h1>
          <Badge variant="secondary" className="mt-1">{status}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Salvar
          </Button>
          {status === "running" ? (
            <Button variant="outline" onClick={() => statusMutation.mutate("paused")}>
              Pausar
            </Button>
          ) : null}
          <Button
            onClick={() => launchMutation.mutate()}
            disabled={launchMutation.isPending || !audienceId || blocked}
          >
            {launchMutation.isPending ? "Lançando…" : "Lançar campanha"}
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuração</CardTitle>
              <CardDescription>Audiência, canal e ritmo de disparo.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="c-name">Nome</Label>
                <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Audiência</Label>
                <Select value={audienceId} onValueChange={setAudienceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma audiência" />
                  </SelectTrigger>
                  <SelectContent>
                    {(audiences.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.member_count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Canal</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Objetivo</Label>
                <Select
                  value={objective}
                  onValueChange={(v) => setObjective(v as (typeof OBJECTIVES)[number])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OBJECTIVES.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cap">Limite diário de envios</Label>
                <Input
                  id="cap"
                  type="number"
                  min={1}
                  value={dailyCap}
                  onChange={(e) => setDailyCap(Number(e.target.value) || 1)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Exigir aprovação humana antes de cada envio
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Variantes</CardTitle>
                <CardDescription>
                  Distribuição atual: {totalSplit}%{totalSplit !== 100 ? " (deve somar 100%)" : ""}
                </CardDescription>
              </div>
              {variants.length < 4 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setVariants((p) => [
                      ...p,
                      { label: String.fromCharCode(65 + p.length), body: "", split_percent: 0 },
                    ])
                  }
                >
                  Adicionar
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {variants.map((v, i) => (
                <div key={i} className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge>{v.label}</Badge>
                      <Button size="sm" variant="outline" onClick={() => setPickerFor(i)}>
                        Usar template
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => saveAsTemplateMutation.mutate(i)}
                        disabled={saveAsTemplateMutation.isPending}
                      >
                        Salvar na biblioteca
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={v.split_percent}
                        onChange={(e) =>
                          updateVariant(i, { split_percent: Number(e.target.value) || 0 })
                        }
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                      {variants.length > 1 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setVariants((p) => p.filter((_, x) => x !== i))}
                        >
                          Remover
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {channel === "email" ? (
                    <Input
                      placeholder="Assunto"
                      value={v.subject ?? ""}
                      onChange={(e) => updateVariant(i, { subject: e.target.value })}
                    />
                  ) : null}
                  <Textarea
                    rows={4}
                    placeholder="Corpo da mensagem. Use {{nome}} para personalizar."
                    value={v.body}
                    onChange={(e) => updateVariant(i, { body: e.target.value })}
                  />
                  {channel === "mms" || channel === "rcs" || channel === "instagram" ? (
                    <Input
                      placeholder="URL da mídia (https://…)"
                      value={v.media_url ?? ""}
                      onChange={(e) => updateVariant(i, { media_url: e.target.value })}
                    />
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_VARS.map((def) => (
                      <Button
                        key={def.key}
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => insertVar(i, def.key)}
                        aria-label={`Inserir variável ${def.label}`}
                      >
                        {`{{${def.key}}}`}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <CampaignValidationPanel issues={issues} />
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prévia</CardTitle>
            <CardDescription>Como o contato recebe a mensagem.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                value={String(previewVariant)}
                onValueChange={(v) => setPreviewVariant(Number(v))}
              >
                <SelectTrigger aria-label="Variante da prévia">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {variants.map((v, i) => (
                    <SelectItem key={v.label} value={String(i)}>
                      Variante {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={previewContactId} onValueChange={setPreviewContactId}>
                <SelectTrigger aria-label="Contato da prévia">
                  <SelectValue placeholder="Dados de exemplo" />
                </SelectTrigger>
                <SelectContent>
                  {(sample.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.display_name || c.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeVariant ? (
              <MessagePreview
                channel={channel as never}
                subject={activeVariant.subject}
                body={activeVariant.body}
                mediaUrl={activeVariant.media_url}
                values={previewContact?.values}
                contactName={previewContact?.display_name || undefined}
              />
            ) : null}

            {coverage.data && coverage.data.coverage.length > 0 ? (
              <div className="space-y-1 border-t border-border pt-3">
                <p className="text-xs font-medium">
                  Cobertura das variáveis ({coverage.data.sample} contatos)
                </p>
                {coverage.data.coverage.map((c) => (
                  <div key={c.key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{`{{${c.key}}}`}</span>
                    <span className={c.pct < 80 ? "text-destructive" : ""}>{c.pct}%</span>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Desempenho</CardTitle>
            <CardDescription>Envios materializados desta campanha.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-3xl font-bold tabular-nums">{campaign.data?.stats.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">envios no total</p>
            <ul className="space-y-1 border-t border-border pt-3">
              {Object.entries(campaign.data?.stats.by_state ?? {}).map(([state, count]) => (
                <li key={state} className="flex items-center justify-between">
                  <span className="capitalize text-muted-foreground">{state}</span>
                  <span className="tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        </div>
      </div>

      <TemplatePickerDialog
        open={pickerFor !== null}
        onOpenChange={(o) => setPickerFor(o ? pickerFor : null)}
        channel={channel as never}
        onSelect={(tpl) => {
          if (pickerFor !== null) applyTemplate(pickerFor, tpl);
        }}
      />
    </div>
  );
}
