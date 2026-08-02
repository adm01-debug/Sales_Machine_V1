import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listContactProfiles } from "@/lib/profile360.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PRIORITY_ORDER, type ReplyPriority } from "@/lib/sentiment";
import { Flame, ThermometerSun, Snowflake, ShieldOff, HelpCircle, Smile, Frown } from "lucide-react";

const PRIORITY_META: Record<
  ReplyPriority,
  { label: string; icon: typeof Flame; className: string }
> = {
  hot: { label: "Alta chance", icon: Flame, className: "border-neon-lime/40 bg-neon-lime/10 text-neon-lime" },
  warm: { label: "Média chance", icon: ThermometerSun, className: "border-neon-amber/40 bg-neon-amber/10 text-neon-amber" },
  cold: { label: "Baixa chance", icon: Snowflake, className: "border-neon-cyan/30 bg-neon-cyan/5 text-neon-cyan" },
  blocked: { label: "Rejeitou", icon: ShieldOff, className: "border-destructive/40 bg-destructive/10 text-destructive" },
  unknown: { label: "Sem sinal", icon: HelpCircle, className: "border-border bg-muted/30 text-muted-foreground" },
};

const PRIORITY_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "hot", label: "🔥 Alta" },
  { id: "warm", label: "Média" },
  { id: "cold", label: "Baixa" },
  { id: "blocked", label: "Rejeitaram" },
] as const;

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Base unificada · Sales Machine" },
      {
        name: "description",
        content:
          "Base 360 de contas e decisores consolidada a partir de LUX, SINGU e FATOR X, ordenada por sinal.",
      },
    ],
  }),
  component: ContactsPage,
});

function ContactsPage() {
  const fetchProfiles = useServerFn(listContactProfiles);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"company" | "person" | undefined>(undefined);

  const profiles = useQuery({
    queryKey: ["mkt", "profiles", search, kind],
    queryFn: () => fetchProfiles({ data: { search: search || undefined, kind, limit: 100 } }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Base unificada</h1>
        <p className="text-sm text-muted-foreground">
          Contas e decisores com histórico consolidado dos sistemas integrados.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtrar</CardTitle>
          <CardDescription>Ordenado por score de sinal decrescente.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={search}
            placeholder="Buscar por nome"
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant={kind === undefined ? "default" : "outline"} onClick={() => setKind(undefined)}>
              Todos
            </Button>
            <Button variant={kind === "company" ? "default" : "outline"} onClick={() => setKind("company")}>
              Empresas
            </Button>
            <Button variant={kind === "person" ? "default" : "outline"} onClick={() => setKind("person")}>
              Pessoas
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {profiles.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (profiles.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum registro. Os dados chegam pelos webhooks de LUX e SINGU.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {(profiles.data ?? [])
                .filter((p): p is typeof p & { entity_id: string } => !!p.entity_id)
                .map((p) => (
                <li key={p.entity_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Link
                      to="/contacts/$id"
                      params={{ id: p.entity_id }}
                      className="font-medium hover:underline"
                    >
                      {p.display_name ?? "Sem nome"}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {p.touchpoint_count ?? 0} interações · {p.inbound_count ?? 0} respostas
                      {p.last_touch_at
                        ? ` · último contato ${new Date(p.last_touch_at).toLocaleDateString("pt-BR")}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{p.kind === "company" ? "empresa" : "pessoa"}</Badge>
                    <Badge variant="secondary">
                      sinal {Number(p.signal_score ?? 0).toFixed(1)}
                    </Badge>
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
