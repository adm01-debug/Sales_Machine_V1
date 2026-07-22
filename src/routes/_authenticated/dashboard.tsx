import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listRecentEvents, listCampaigns } from "@/lib/orchestrator.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Cockpit · Sales Machine" },
      { name: "description", content: "Painel central da Sales Machine com eventos, campanhas e integrações." },
    ],
  }),
  component: DashboardPage,
});

const SYSTEMS: Array<{ key: "lux" | "singu" | "fatorx"; name: string; role: string }> = [
  { key: "lux", name: "LUX", role: "Descoberta de empresas no ICP" },
  { key: "singu", name: "SINGU", role: "CRM + análise + canais (WhatsApp, Email, SMS)" },
  { key: "fatorx", name: "FATOR X", role: "Agentes de IA treinados" },
];

function DashboardPage() {
  const navigate = useNavigate();
  const fetchEvents = useServerFn(listRecentEvents);
  const fetchCampaigns = useServerFn(listCampaigns);
  const events = useQuery({ queryKey: ["sm", "events"], queryFn: () => fetchEvents() });
  const campaigns = useQuery({ queryKey: ["sm", "campaigns"], queryFn: () => fetchCampaigns() });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Sales Machine</h1>
            <p className="text-sm text-muted-foreground">
              Cockpit de prospecção orquestrada — LUX · SINGU · FATOR X
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/companies"><Button variant="outline" size="sm">Empresas</Button></Link>
            <Link to="/campaigns"><Button variant="outline" size="sm">Campanhas</Button></Link>
            <Link to="/composer"><Button variant="outline" size="sm">Compositor</Button></Link>
            <Link to="/ops"><Button variant="outline" size="sm">Operações</Button></Link>
            <Link to="/deliverability"><Button variant="outline" size="sm">Deliverability</Button></Link>
            <Link to="/approvals"><Button variant="outline" size="sm">Aprovações</Button></Link>
            <Link to="/evals"><Button variant="outline" size="sm">Evals</Button></Link>
            <Button variant="outline" size="sm" onClick={signOut}>Sair</Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {SYSTEMS.map((s) => (
            <Card key={s.key}>
              <CardHeader>
                <CardTitle className="text-base">{s.name}</CardTitle>
                <CardDescription>{s.role}</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary">Integrado via webhook + API</Badge>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Eventos recentes</CardTitle>
              <CardDescription>Últimos sinais recebidos dos sistemas integrados.</CardDescription>
            </CardHeader>
            <CardContent>
              {events.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : events.error ? (
                <p className="text-sm text-destructive">Sem permissão ou erro ao ler eventos.</p>
              ) : events.data && events.data.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {events.data.map((e) => (
                    <li key={e.id} className="flex items-center justify-between border-b py-1 last:border-0">
                      <span className="flex items-center gap-2">
                        <Badge variant="outline">{e.source}</Badge>
                        <span className="font-mono text-xs">{e.event_type}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(e.received_at).toLocaleString("pt-BR")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum evento ainda. Configure os webhooks nos sistemas externos.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campanhas de orquestração</CardTitle>
              <CardDescription>Cadências ativas com FATOR X + canais SINGU.</CardDescription>
            </CardHeader>
            <CardContent>
              {campaigns.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : campaigns.data && campaigns.data.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {campaigns.data.map((c) => (
                    <li key={c.id} className="flex items-center justify-between border-b py-1 last:border-0">
                      <span>{c.name}</span>
                      <Badge>{c.status}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma campanha criada ainda.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Endpoints de integração</CardTitle>
            <CardDescription>
              Configure estas URLs nos sistemas externos. Todas exigem HMAC-SHA256 no header{" "}
              <code className="rounded bg-muted px-1">x-signature</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm font-mono">
            <div>POST /api/public/webhooks/lux</div>
            <div>POST /api/public/webhooks/singu</div>
            <div>POST /api/public/webhooks/fatorx</div>
            <div className="pt-2 text-muted-foreground font-sans text-xs">
              Ferramenta de agente (bearer AGENT_TOOL_TOKEN):
            </div>
            <div>POST /api/public/agent-tools/send-message</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}