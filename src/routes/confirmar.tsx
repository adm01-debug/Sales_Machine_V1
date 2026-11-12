import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { confirmLeadForm } from "@/lib/lead-forms.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/confirmar")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: z
      .string()
      .catch("")
      .parse(search.token ?? ""),
  }),
  head: () => ({
    meta: [
      { title: "Confirmar cadastro · Sales Machine" },
      {
        name: "description",
        content: "Confirme seu e-mail para concluir o cadastro e receber nossos contatos.",
      },
      { property: "og:title", content: "Confirmar cadastro · Sales Machine" },
      { property: "og:description", content: "Confirmação de cadastro em um clique." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfirmPage,
});

function ConfirmPage() {
  const { token } = Route.useSearch();
  const confirm = useServerFn(confirmLeadForm);
  const query = useQuery({
    queryKey: ["lead-form-confirm", token],
    queryFn: () => confirm({ data: { token } }),
    enabled: token.length >= 16,
    retry: false,
  });

  const message = !token
    ? "Link inválido."
    : query.isLoading
      ? "Confirmando…"
      : query.error
        ? "Não foi possível confirmar agora. Tente novamente mais tarde."
        : query.data?.ok
          ? "Cadastro confirmado! Em breve nosso time entra em contato."
          : query.data?.reason === "expired"
            ? "Este link expirou. Preencha o formulário novamente."
            : "Link inválido ou já utilizado.";

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Confirmação de cadastro</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </main>
  );
}
