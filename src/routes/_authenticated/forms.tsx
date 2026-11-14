import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Plus } from "lucide-react";
import { listLeadForms, saveLeadForm } from "@/lib/lead-forms.functions";
import {
  DEFAULT_FIELDS,
  LEAD_FORM_STATUS_LABEL,
  slugify,
  type LeadFormStatus,
} from "@/lib/lead-forms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/forms")({
  head: () => ({
    meta: [
      { title: "Formulários de captação · Sales Machine" },
      {
        name: "description",
        content:
          "Crie formulários públicos com double opt-in e envie os leads direto para jornadas automatizadas.",
      },
      { property: "og:title", content: "Formulários de captação · Sales Machine" },
      {
        property: "og:description",
        content: "Captação de leads com consentimento registrado e entrada automática em jornadas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FormsPage,
});

function FormsPage() {
  const queryClient = useQueryClient();
  const fetchForms = useServerFn(listLeadForms);
  const persist = useServerFn(saveLeadForm);
  const [name, setName] = useState("");

  const query = useQuery({ queryKey: ["mkt", "lead-forms"], queryFn: () => fetchForms({}) });

  const create = useMutation({
    mutationFn: () =>
      persist({
        data: {
          id: null,
          form: {
            name: name.trim(),
            slug: slugify(name) || `form-${Date.now()}`,
            title: name.trim(),
            description: null,
            fields: DEFAULT_FIELDS,
            submit_label: "Enviar",
            success_message: "Recebemos seus dados. Obrigado!",
            consent_text: "Autorizo o contato comercial e o tratamento dos meus dados.",
            double_opt_in: true,
            confirm_ttl_hours: 48,
            channel: "email",
            journey_id: null,
            tags: [],
            status: "draft",
          },
        },
      }),
    onSuccess: () => {
      setName("");
      toast.success("Formulário criado");
      queryClient.invalidateQueries({ queryKey: ["mkt", "lead-forms"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">Formulários de captação</h1>
        <p className="text-sm text-muted-foreground">
          Páginas públicas com consentimento registrado e confirmação por e-mail (double opt-in).
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Novo formulário</CardTitle>
          <CardDescription>O endereço público é gerado a partir do nome.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="form-name">Nome</Label>
            <Input
              id="form-name"
              value={name}
              placeholder="Ex.: Materiais para gestores de RH"
              onChange={(e) => setName(e.target.value)}
            />
            {name ? (
              <p className="text-xs text-muted-foreground">Endereço: /f/{slugify(name)}</p>
            ) : null}
          </div>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Criar
          </Button>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (query.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum formulário criado ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(query.data ?? []).map((form) => (
            <Card key={form.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-base">
                    <Link
                      to="/forms/$id"
                      params={{ id: form.id }}
                      className="hover:underline focus-visible:underline"
                    >
                      {form.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>/f/{form.slug}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={form.status === "published" ? "default" : "outline"}>
                    {LEAD_FORM_STATUS_LABEL[form.status as LeadFormStatus]}
                  </Badge>
                  <Button variant="ghost" size="icon" asChild aria-label="Abrir página pública">
                    <Link to="/f/$slug" params={{ slug: form.slug }} target="_blank">
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>Canal: {form.channel}</span>
                <span>Confirmação por e-mail: {form.double_opt_in ? "sim" : "não"}</span>
                <span>Envios: {form.submission_count}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
