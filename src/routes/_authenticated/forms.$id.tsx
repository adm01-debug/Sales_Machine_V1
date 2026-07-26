import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Save } from "lucide-react";
import { getLeadForm, saveLeadForm } from "@/lib/lead-forms.functions";
import { listJourneys } from "@/lib/journeys.functions";
import {
  LEAD_FORM_STATUSES,
  LEAD_FORM_STATUS_LABEL,
  leadFormSchema,
  parseFieldsSafe,
  type LeadField,
  type LeadFormInput,
} from "@/lib/lead-forms";
import { LeadFieldEditor } from "@/components/forms/LeadFieldEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/forms/$id")({
  head: () => ({
    meta: [
      { title: "Editar formulário · Sales Machine" },
      {
        name: "description",
        content: "Configure campos, consentimento e destino dos leads captados pelo formulário.",
      },
      { property: "og:title", content: "Editar formulário · Sales Machine" },
      {
        property: "og:description",
        content: "Campos, double opt-in e entrada automática em jornadas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <p className="p-6 text-sm text-destructive">{(error as Error).message}</p>
  ),
  notFoundComponent: () => <p className="p-6 text-sm">Formulário não encontrado.</p>,
  component: FormEditorPage,
});

function FormEditorPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchForm = useServerFn(getLeadForm);
  const fetchJourneys = useServerFn(listJourneys);
  const persist = useServerFn(saveLeadForm);
  const [draft, setDraft] = useState<LeadFormInput | null>(null);

  const query = useQuery({
    queryKey: ["mkt", "lead-form", id],
    queryFn: async () => {
      const res = await fetchForm({ data: { id } });
      setDraft({
        ...(res.form as unknown as LeadFormInput),
        fields: parseFieldsSafe(res.form.fields),
      });
      return res;
    },
  });
  const journeys = useQuery({ queryKey: ["mkt", "journeys"], queryFn: () => fetchJourneys({}) });

  const parsed = useMemo(() => (draft ? leadFormSchema.safeParse(draft) : null), [draft]);
  const issues = useMemo(() => {
    const map: Record<string, string> = {};
    if (parsed && !parsed.success) {
      for (const issue of parsed.error.issues) map[issue.path.join(".")] = issue.message;
    }
    return map;
  }, [parsed]);

  const save = useMutation({
    mutationFn: () => persist({ data: { id, form: parsed!.data } }),
    onSuccess: () => {
      toast.success("Formulário salvo");
      queryClient.invalidateQueries({ queryKey: ["mkt", "lead-forms"] });
      queryClient.invalidateQueries({ queryKey: ["mkt", "lead-form", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading || !draft) return <Skeleton className="h-96 w-full" />;

  const patch = (values: Partial<LeadFormInput>) =>
    setDraft((prev) => (prev ? { ...prev, ...values } : prev));
  const patchField = (index: number, values: Partial<LeadField>) =>
    setDraft((prev) =>
      prev
        ? { ...prev, fields: prev.fields.map((f, i) => (i === index ? { ...f, ...values } : f)) }
        : prev,
    );
  const moveField = (index: number, direction: -1 | 1) =>
    setDraft((prev) => {
      if (!prev) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.fields.length) return prev;
      const fields = [...prev.fields];
      [fields[index], fields[target]] = [fields[target], fields[index]];
      return { ...prev, fields };
    });

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild aria-label="Voltar">
            <Link to="/forms">
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{draft.name}</h1>
            <p className="text-xs text-muted-foreground">/f/{draft.slug}</p>
          </div>
        </div>
        <Button onClick={() => save.mutate()} disabled={!parsed?.success || save.isPending}>
          <Save className="mr-1 h-4 w-4" aria-hidden />
          {save.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Conteúdo da página</CardTitle>
          <CardDescription>O que o visitante vê ao abrir o link público.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input id="title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              rows={2}
              value={draft.description ?? ""}
              onChange={(e) => patch({ description: e.target.value || null })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="submit_label">Texto do botão</Label>
              <Input
                id="submit_label"
                value={draft.submit_label}
                onChange={(e) => patch({ submit_label: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Situação</Label>
              <Select
                value={draft.status}
                onValueChange={(value) => patch({ status: value as LeadFormInput["status"] })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_FORM_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {LEAD_FORM_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="success">Mensagem de sucesso</Label>
            <Input
              id="success"
              value={draft.success_message}
              onChange={(e) => patch({ success_message: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Campos</CardTitle>
            <CardDescription>Máximo de 20 campos por formulário.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={draft.fields.length >= 20}
            onClick={() =>
              patch({
                fields: [
                  ...draft.fields,
                  {
                    key: `campo_${draft.fields.length + 1}`,
                    label: "Novo campo",
                    type: "text",
                    required: false,
                    options: [],
                  },
                ],
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Adicionar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.fields.map((field, index) => (
            <LeadFieldEditor
              key={index}
              field={field}
              index={index}
              total={draft.fields.length}
              error={
                issues[`fields.${index}.key`] ??
                issues[`fields.${index}.label`] ??
                issues[`fields.${index}`]
              }
              onChange={(values) => patchField(index, values)}
              onRemove={() => patch({ fields: draft.fields.filter((_, i) => i !== index) })}
              onMove={(direction) => moveField(index, direction)}
            />
          ))}
          {issues.fields ? <p className="text-xs text-destructive">{issues.fields}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Consentimento e destino</CardTitle>
          <CardDescription>
            O consentimento fica registrado por contato e canal, atendendo à LGPD.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="consent">Texto de consentimento</Label>
            <Textarea
              id="consent"
              rows={2}
              value={draft.consent_text}
              onChange={(e) => patch({ consent_text: e.target.value })}
            />
            {issues.consent_text ? (
              <p className="text-xs text-destructive">{issues.consent_text}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="doi"
              checked={draft.double_opt_in}
              onCheckedChange={(checked) => patch({ double_opt_in: checked })}
            />
            <Label htmlFor="doi" className="text-sm font-normal">
              Exigir confirmação por e-mail (double opt-in)
            </Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ttl">Validade do link (horas)</Label>
              <Input
                id="ttl"
                type="number"
                min={1}
                max={720}
                value={draft.confirm_ttl_hours}
                onChange={(e) => patch({ confirm_ttl_hours: Number(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="journey">Jornada de entrada</Label>
              <Select
                value={draft.journey_id ?? "none"}
                onValueChange={(value) => patch({ journey_id: value === "none" ? null : value })}
              >
                <SelectTrigger id="journey">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {(journeys.data ?? []).map((journey) => (
                    <SelectItem key={journey.id} value={journey.id}>
                      {journey.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Envios recentes</CardTitle>
          <CardDescription>Últimos 50 preenchimentos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(query.data?.submissions ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum envio ainda.</p>
          ) : (
            (query.data?.submissions ?? []).map((submission) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                key={submission.id}
              >
                <span className="truncate">{submission.email ?? submission.full_name ?? "—"}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{submission.status}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}