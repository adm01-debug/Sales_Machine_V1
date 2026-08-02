import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Ban, CheckCircle2, Loader2, Wallet } from "lucide-react";
import { getBudgetReport, updateChannelBudget } from "@/lib/ops.functions";
import { formatBRL } from "@/lib/cost-model";
import type { BudgetStatus } from "@/lib/budget-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ok: { label: "Dentro do teto", variant: "secondary" },
  warning: { label: "Acima de 80%", variant: "outline" },
  exhausted: { label: "Bloqueado", variant: "destructive" },
  disabled: { label: "Desativado", variant: "destructive" },
};

interface DraftState {
  dailyLimit: string;
  monthlyLimit: string;
  enabled: boolean;
}

export function BudgetGuardrails() {
  const queryClient = useQueryClient();
  const fetchReport = useServerFn(getBudgetReport);
  const saveBudget = useServerFn(updateChannelBudget);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["ops", "budget-report"],
    queryFn: () => fetchReport(),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (vars: { channel: string; dailyLimit: number; monthlyLimit: number; enabled: boolean }) =>
      saveBudget({ data: vars }),
    onSuccess: (_res, vars) => {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[vars.channel];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["ops", "budget-report"] });
      queryClient.invalidateQueries({ queryKey: ["ops", "spend"] });
    },
  });

  const states = data?.states ?? [];
  const blockedCount = states.filter((s) => s.blocked).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />
              Guardrail de orçamento
            </CardTitle>
            <CardDescription>
              Tetos por canal. Ao atingir o limite, o worker de cadência adia os disparos
              daquele canal em vez de encerrar os contatos.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {blockedCount > 0 ? (
              <Badge variant="destructive" className="gap-1">
                <Ban className="h-3 w-3" aria-hidden />
                {blockedCount} canal(is) bloqueado(s)
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                Todos liberados
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertDescription>
              Não foi possível apurar o orçamento: {(error as Error).message}
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Apurando gastos do período…
          </div>
        ) : null}

        {data ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryTile label="Gasto no dia" value={formatBRL(data.totalSpentToday)} />
            <SummaryTile label="Teto diário somado" value={formatBRL(data.totalDailyLimit)} />
            <SummaryTile
              label="Linhas varridas"
              value={`${data.scannedRows.toLocaleString("pt-BR")}${data.truncated ? "+" : ""}`}
              hint={data.truncated ? "Teto de varredura atingido — valores são piso." : undefined}
            />
          </div>
        ) : null}

        <div className="space-y-3">
          {states.map((state) => {
            const draft = drafts[state.channel] ?? {
              dailyLimit: String(state.dailyLimit),
              monthlyLimit: String(state.monthlyLimit),
              enabled: state.status !== "disabled",
            };
            const dirty = Boolean(drafts[state.channel]);
            const meta = STATUS_META[state.status];
            const patch = (partial: Partial<DraftState>) =>
              setDrafts((prev) => ({ ...prev, [state.channel]: { ...draft, ...partial } }));

            return (
              <div
                key={state.channel}
                className={cn(
                  "rounded-lg border p-3",
                  state.blocked ? "border-destructive/40 bg-destructive/5" : "bg-card",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{state.channel}</span>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Hoje {formatBRL(state.spentToday)} · Mês {formatBRL(state.spentMonth)}
                  </div>
                </div>

                <div className="mt-2">
                  <Progress value={Math.min(state.usageRate ?? 0, 100)} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {state.usageRate === null
                      ? "Sem teto diário configurado"
                      : `${state.usageRate}% do teto diário · restam ${formatBRL(state.remainingToday ?? 0)}`}
                    {state.reason ? ` · ${state.reason}` : ""}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="text-xs text-muted-foreground">
                    Teto diário (BRL)
                    <Input
                      className="mt-1 h-8 w-32"
                      inputMode="decimal"
                      value={draft.dailyLimit}
                      onChange={(e) => patch({ dailyLimit: e.target.value })}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Teto mensal (BRL)
                    <Input
                      className="mt-1 h-8 w-32"
                      inputMode="decimal"
                      value={draft.monthlyLimit}
                      onChange={(e) => patch({ monthlyLimit: e.target.value })}
                    />
                  </label>
                  <label className="flex items-center gap-2 pb-1 text-xs text-muted-foreground">
                    <Switch
                      checked={draft.enabled}
                      onCheckedChange={(checked) => patch({ enabled: checked })}
                      aria-label={`Ativar canal ${state.channel}`}
                    />
                    Canal ativo
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!dirty || mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        channel: state.channel,
                        dailyLimit: Number(draft.dailyLimit.replace(",", ".")) || 0,
                        monthlyLimit: Number(draft.monthlyLimit.replace(",", ".")) || 0,
                        enabled: draft.enabled,
                      })
                    }
                  >
                    {mutation.isPending && mutation.variables?.channel === state.channel ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                    ) : null}
                    Salvar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {mutation.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertDescription>{(mutation.error as Error).message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SummaryTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
