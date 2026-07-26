import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSpendBreakdown } from "@/lib/ops.functions";
import { formatBRL } from "@/lib/cost-model";
import { cn } from "@/lib/utils";

const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  mms: "MMS",
  rcs: "RCS",
  email: "E-mail",
  linkedin: "LinkedIn",
  instagram: "Instagram",
};

/**
 * Impacto financeiro do pipeline: custo estimado por canal no período e a
 * fatia desperdiçada (mensagens pagas que terminaram em opt-out ou dead-letter).
 */
export function SpendBreakdown() {
  const [days, setDays] = useState<number>(30);
  const fetchSpend = useServerFn(getSpendBreakdown);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["ops", "spend", days],
    queryFn: () => fetchSpend({ data: { days } }),
    refetchInterval: 300_000,
  });

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Impacto financeiro por canal</h2>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setDays(p.days)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs",
                days === p.days
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-lg border border-border bg-muted/40" />
      ) : isError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Falha ao calcular custos: {(error as Error).message}
        </p>
      ) : !data || data.byChannel.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Nenhum envio cobrável no período selecionado.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">Custo estimado</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">
                {formatBRL(data.totalCost)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">Desperdício</div>
              <div className="mt-1 text-2xl font-semibold text-destructive">
                {formatBRL(data.wastedCost)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{data.wastedRate}% do total</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">Mensagens cobradas</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">
                {data.billableMessages}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">Custo médio</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">
                {formatBRL(
                  data.billableMessages > 0 ? data.totalCost / data.billableMessages : 0,
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">por mensagem</div>
            </div>
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {data.byChannel.map((c) => (
              <li key={c.channel} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {CHANNEL_LABEL[c.channel] ?? c.channel}
                  </span>
                  <span className="text-sm text-foreground">{formatBRL(c.cost)}</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${c.share}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.billable} msg · {formatBRL(c.unitCost)}/msg · {c.share}% do custo
                  {c.wasted > 0 ? ` · ${c.wasted} desperdiçada(s) (${formatBRL(c.wastedCost)})` : ""}
                </p>
              </li>
            ))}
          </ul>

          {data.truncated ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Volume acima do teto de varredura: os valores são um piso, não o total do período.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Estimativa com base em tabela de preços de referência por canal ({data.scannedRows}{" "}
            touchpoints analisados em {data.days} dias).
          </p>
        </div>
      )}
    </section>
  );
}