import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, History, Loader2, Scale, ShieldAlert, Sparkles } from "lucide-react";
import {
  applyBudgetReallocation,
  getBudgetReallocationHistory,
  getBudgetReallocationPlan,
} from "@/lib/ops.functions";
import { formatBRL } from "@/lib/cost-model";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * Realocação automática de teto diário: move saldo ocioso de canais folgados
 * para canais saturados, mantendo o orçamento total do dia inalterado.
 */
export function BudgetReallocation() {
  const queryClient = useQueryClient();
  const fetchPlan = useServerFn(getBudgetReallocationPlan);
  const applyPlan = useServerFn(applyBudgetReallocation);
  const fetchHistory = useServerFn(getBudgetReallocationHistory);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ops", "budget-reallocation"],
    queryFn: () => fetchPlan(),
    staleTime: 60_000,
  });

  const { data: history } = useQuery({
    queryKey: ["ops", "budget-reallocation-history"],
    queryFn: () => fetchHistory(),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: () => applyPlan(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops", "budget-reallocation"] });
      queryClient.invalidateQueries({ queryKey: ["ops", "budget-reallocation-history"] });
      queryClient.invalidateQueries({ queryKey: ["ops", "budget-report"] });
      queryClient.invalidateQueries({ queryKey: ["ops", "spend"] });
    },
  });

  const transfers = data?.transfers ?? [];
  const conserved =
    data ? Math.abs(data.totalAfter - data.totalBefore) <= 0.01 : true;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-muted-foreground" aria-hidden />
              Realocação de saldo entre canais
            </CardTitle>
            <CardDescription>
              Move teto diário de canais ociosos para canais saturados sem alterar o
              orçamento total do dia. Doadores mantêm margem de segurança.
            </CardDescription>
          </div>
          <Button
            size="sm"
            disabled={transfers.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="mr-1 h-3 w-3" aria-hidden />
            )}
            Aplicar realocação
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" aria-hidden />
            <AlertDescription>
              Não foi possível montar o plano: {(error as Error).message}
            </AlertDescription>
          </Alert>
        ) : null}

        {mutation.isError ? (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" aria-hidden />
            <AlertDescription>{(mutation.error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        {mutation.isSuccess && !mutation.isPending ? (
          <Alert>
            <AlertDescription>
              {mutation.data?.applied
                ? `${mutation.data.applied} canal(is) ajustado(s) — ${formatBRL(mutation.data.plan.movedTotal)} realocados.`
                : "Nada a realocar: os tetos já estão equilibrados."}
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Simulando redistribuição…
          </div>
        ) : null}

        {data && transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma transferência recomendada agora: não há canal saturado com saldo
            ocioso disponível em outro canal.
          </p>
        ) : null}

        {transfers.length > 0 ? (
          <div className="space-y-2">
            {transfers.map((t, i) => (
              <div
                key={`${t.from}-${t.to}-${i}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
              >
                <span className="font-medium capitalize">{t.from}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
                <span className="font-medium capitalize">{t.to}</span>
                <Badge variant="secondary" className="ml-auto">{formatBRL(t.amount)}</Badge>
              </div>
            ))}
          </div>
        ) : null}

        {data && data.changes.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.changes.map((c) => (
              <div key={c.channel} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{c.channel}</span>
                  <Badge variant={c.delta < 0 ? "outline" : "secondary"}>
                    {c.delta > 0 ? "+" : ""}
                    {formatBRL(c.delta)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatBRL(c.currentDailyLimit)} → {formatBRL(c.proposedDailyLimit)} ·{" "}
                  {c.role === "donor" ? "doador" : "receptor"}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {data && data.unmet.length > 0 ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-medium">Necessidades não atendidas</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {data.unmet.map((u, i) => (
                <li key={`${u.channel}-${i}`}>
                  <span className="capitalize">{u.channel}</span>
                  {u.missing > 0 ? ` — faltam ${formatBRL(u.missing)}` : ""} · {u.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data ? (
          <p className={cn("text-xs", conserved ? "text-muted-foreground" : "text-destructive")}>
            Teto diário somado: {formatBRL(data.totalBefore)} → {formatBRL(data.totalAfter)}
            {conserved ? " (orçamento total preservado)" : " (divergência detectada)"}
          </p>
        ) : null}

        {history && history.length > 0 ? (
          <div className="space-y-2 border-t pt-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4 text-muted-foreground" aria-hidden />
              Histórico de realocações
            </p>
            <p className="text-xs text-muted-foreground">
              A rotina automática revisa os tetos a cada 30 minutos e só aplica quando
              respeita o intervalo mínimo, o valor mínimo e o limite percentual de
              remanejamento. Planos maiores ficam para aprovação manual aqui.
            </p>
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="rounded-lg border p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {new Date(h.appliedAt).toLocaleString("pt-BR")}
                    </span>
                    <Badge variant="secondary">{formatBRL(h.movedTotal)}</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {h.channelsChanged} canal(is) ajustado(s) ·{" "}
                    {h.transfers.length > 0
                      ? h.transfers
                          .map((t) => `${t.from} → ${t.to} (${formatBRL(t.amount)})`)
                          .join(", ")
                      : "sem transferências"}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
