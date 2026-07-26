import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getPublicLeadForm, submitLeadForm } from "@/lib/lead-forms.functions";
import { HONEYPOT_KEY, parseFieldsSafe } from "@/lib/lead-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/f/$slug")({
  loader: ({ params }) => getPublicLeadForm({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    const title = (loaderData?.title as string) || "Formulário · Sales Machine";
    const description =
      (loaderData?.description as string) ||
      "Preencha seus dados para receber o contato do nosso time comercial.";
    return {
      meta: [
        { title: title.slice(0, 60) },
        { name: "description", content: description.slice(0, 158) },
        { property: "og:title", content: title.slice(0, 60) },
        { property: "og:description", content: description.slice(0, 158) },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: () => <PublicMessage title="Não foi possível carregar o formulário." />,
  notFoundComponent: () => <PublicMessage title="Formulário não encontrado." />,
  component: PublicFormPage,
});

function PublicMessage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        {children ? <CardContent>{children}</CardContent> : null}
      </Card>
    </main>
  );
}

function PublicFormPage() {
  const form = Route.useLoaderData();
  const { slug } = Route.useParams();
  const send = useServerFn(submitLeadForm);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => send({ data: { slug, values, consent } }),
    onSuccess: (res) => {
      if (res.status === "ignored" && Object.keys(res.errors).length > 0) {
        setErrors(res.errors as Record<string, string>);
        return;
      }
      setErrors({});
      setDone(
        res.status === "pending"
          ? "Enviamos um link de confirmação. Confirme para concluir seu cadastro."
          : res.message,
      );
    },
  });

  if (!form) return <PublicMessage title="Formulário não encontrado." />;
  if (done) return <PublicMessage title="Tudo certo!">{<p className="text-sm text-muted-foreground">{done}</p>}</PublicMessage>;

  const fields = parseFieldsSafe(form.fields);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{form.title || "Fale com o nosso time"}</CardTitle>
          {form.description ? <CardDescription>{form.description}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            {fields.map((field) => (
              <div className="space-y-1.5" key={field.key}>
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required ? " *" : ""}
                </Label>
                {field.type === "textarea" ? (
                  <Textarea
                    id={field.key}
                    rows={4}
                    placeholder={field.placeholder}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  />
                ) : field.type === "select" ? (
                  <select
                    id={field.key}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Selecione…
                    </option>
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : field.type === "checkbox" ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={field.key}
                      onCheckedChange={(c) => setValues((v) => ({ ...v, [field.key]: c === true }))}
                    />
                    <span className="text-sm text-muted-foreground">{field.placeholder}</span>
                  </div>
                ) : (
                  <Input
                    id={field.key}
                    type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
                    placeholder={field.placeholder}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  />
                )}
                {errors[field.key] ? (
                  <p className="text-xs text-destructive">{errors[field.key]}</p>
                ) : null}
              </div>
            ))}

            <input
              type="text"
              name={HONEYPOT_KEY}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="hidden"
              onChange={(e) => setValues((v) => ({ ...v, [HONEYPOT_KEY]: e.target.value }))}
            />

            <div className="flex items-start gap-2 rounded-md border border-border p-3">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={(c) => setConsent(c === true)}
              />
              <Label htmlFor="consent" className="text-xs font-normal leading-relaxed">
                {form.consent_text}
              </Label>
            </div>
            {errors.__consent ? <p className="text-xs text-destructive">{errors.__consent}</p> : null}
            {mutation.isError ? (
              <p className="text-xs text-destructive">{(mutation.error as Error).message}</p>
            ) : null}

            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Enviando…" : form.submit_label || "Enviar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}