import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCampaignCostPreflight } from "@/lib/marketing.functions";
import { cn } from "@/lib/utils";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const VERDICT = {
  ok: {
    label: "Aprovado",
    icon: CheckCircle2,
    badge: "bg-primary/10 text-primary border-primary/20",
    text: "Dentro do orçamento configurado para o canal.",
  },
  warning: {
    label: "Atenção",
    icon: AlertTriangle,
    badge: "bg-neon-amber/10 text-neon-amber border-neon-amber/25",
    text: "Consome boa parte do saldo do dia.",
  },
  blocked: {
    label: "Reprovado",
    icon: ShieldAlert,
    badge: "bg-destructive/10 text-destructive border-destructive/20",
    text: "O lançamento será recusado até ajustar audiência ou teto.",
  },
} as const;

export interface CostPreflightCardProps {
  campaignId: string;
  /** Invalida junto com o editor: muda variante/audiência, recalcula. */
  revision?: string;
}

/** Pré-voo de custo: quanto o lançamento vai custar e se cabe no orçamento. */
export function CostPreflightCard({ campaignId, revision }: CostPreflightCardProps) {
  const fetchPreflight = useServerFn(getCampaignCostPreflight);
  const query = useQuery({
    queryKey: ["mkt", "preflight", campaignId, revision ?? ""],
    queryFn: () => fetchPreflight({ data: { id: campaignId } }),
    staleTime: 30_000,
  });

  const data = query.data;
  const verdict = data ? VERDICT[data.verdict] : null;
  const Icon = verdict?.icon ?? Wallet;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />
              Pré-voo de custo
            </CardTitle>
            <CardDescription>Estimativa do disparo contra o saldo do canal.</CardDescription>
          </div>
          {verdict && (
            <Badge variant="outline" className={cn("shrink-0", verdict.badge)}>
              <Icon className="mr-1 h-3 w-3" aria-hidden />
              {verdict.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {query.isPending && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculando estimativa…
          </p>
        )}
        {query.isError && (
          <p className="text-destructive">
            Não foi possível estimar o custo: {(query.error as Error).message}
          </p>
        )}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Custo estimado" value={brl(data.estimate.totalCost)} strong />
              <Metric label="Contatos" value={String(data.estimate.audienceSize)} />
              <Metric label="Por contato" value={brl(data.estimate.costPerContact)} />
              <Metric
                label="Saldo do dia"
                value={data.remainingToday === null ? "sem teto" : brl(data.remainingToday)}
              />
            </div>

            {data.estimate.variants.length > 1 && (
              <ul className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                {data.estimate.variants.map((v) => (
                  <li key={v.label} className="flex justify-between gap-2">
                    <span>
                      Variante {v.label} · {v.recipients} contato(s)
                      {v.segmentsPerMessage > 1 ? ` · ${v.segmentsPerMessage} segmentos` : ""}
                    </span>
                    <span className="font-mono">{brl(v.cost)}</span>
                  </li>
                ))}
              </ul>
            )}

            <p className={cn("text-xs", data.verdict === "blocked" ? "text-destructive" : "text-muted-foreground")}>
              {data.reasons.length > 0 ? data.reasons.join(" · ") : verdict?.text}
            </p>

            {!data.budgetAvailable && (
              <p className="text-xs text-muted-foreground">
                Guardrail de orçamento indisponível — estimativa exibida sem comparação de saldo.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums", strong ? "text-lg font-semibold text-foreground" : "text-foreground")}>
        {value}
      </p>
    </div>
  );
}