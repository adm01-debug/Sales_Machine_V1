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
  const [priority, setPriority] = useState<(typeof PRIORITY_FILTERS)[number]["id"]>("all");

  const profiles = useQuery({
    queryKey: ["mkt", "profiles", search, kind],
    queryFn: () => fetchProfiles({ data: { search: search || undefined, kind, limit: 100 } }),
  });

  const rows = useMemo(() => {
    const list = (profiles.data ?? []).filter(
      (p): p is typeof p & { entity_id: string } => !!p.entity_id,
    );
    return list
      .filter((p) => priority === "all" || p.reply_priority === priority)
      .sort(
        (a, b) =>
          PRIORITY_ORDER[a.reply_priority] - PRIORITY_ORDER[b.reply_priority] ||
          b.reply_probability - a.reply_probability,
      );
  }, [profiles.data, priority]);

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
          <CardDescription>
            Ordenado por probabilidade de resposta (sinal + sentimento das respostas).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
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
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
            {PRIORITY_FILTERS.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={priority === f.id ? "secondary" : "ghost"}
                onClick={() => setPriority(f.id)}
                className="h-7 px-2 text-xs"
              >
                {f.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {profiles.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum registro para este filtro. Os dados chegam pelos webhooks de LUX e SINGU.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((p) => {
                const meta = PRIORITY_META[p.reply_priority];
                const Icon = meta.icon;
                return (
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
                    {p.sentiment.total > 0 ? (
                      <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        {p.sentiment.positive > 0 && (
                          <span className="flex items-center gap-1 text-neon-lime">
                            <Smile className="h-3 w-3" /> {p.sentiment.positive}
                          </span>
                        )}
                        {p.sentiment.negative > 0 && (
                          <span className="flex items-center gap-1 text-destructive">
                            <Frown className="h-3 w-3" /> {p.sentiment.negative}
                          </span>
                        )}
                        <span>
                          saldo {p.sentiment.net_score > 0 ? "+" : ""}
                          {p.sentiment.net_score}
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={meta.className}>
                      <Icon className="mr-1 h-3 w-3" />
                      {meta.label} · {p.reply_probability}%
                    </Badge>
                    <Badge variant="outline">{p.kind === "company" ? "empresa" : "pessoa"}</Badge>
                    <Badge variant="secondary">
                      sinal {Number(p.signal_score ?? 0).toFixed(1)}
                    </Badge>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
