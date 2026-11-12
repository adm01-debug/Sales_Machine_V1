import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sales Machine · Prospecção orquestrada com IA" },
      {
        name: "description",
        content:
          "Sales Machine reúne LUX, SINGU e FATOR X em um único cockpit para prospectar decisores no LinkedIn, WhatsApp, Instagram, Email e SMS.",
      },
      { property: "og:title", content: "Sales Machine · Prospecção orquestrada com IA" },
      {
        property: "og:description",
        content:
          "Sales Machine reúne LUX, SINGU e FATOR X em um único cockpit para prospectar decisores no LinkedIn, WhatsApp, Instagram, Email e SMS.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

const PILLARS = [
  {
    name: "LUX",
    role: "ICP Discovery",
    body: "Encontra empresas que se encaixam no perfil de cliente ideal e enriquece decisores.",
  },
  {
    name: "SINGU",
    role: "CRM + Canais",
    body: "Armazena contatos, analisa comportamento e dispara WhatsApp, Email e SMS.",
  },
  {
    name: "FATOR X",
    role: "Agentes de IA",
    body: "Executa conversas com decisores usando agentes treinados e ferramentas.",
  },
  {
    name: "Sales Machine",
    role: "Orquestrador",
    body: "Une tudo: cadências, quotas por canal, auditoria e cockpit único.",
  },
];

function Landing() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          Prospecção orquestrada
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-6xl">Sales Machine</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          O cockpit que integra LUX, SINGU e FATOR X para prospectar decisores em LinkedIn,
          WhatsApp, Instagram, Email e SMS com agentes de IA treinados.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/dashboard">Abrir cockpit</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth">Entrar</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <Card key={p.name}>
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>{p.role}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{p.body}</CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
