import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getChurnMetrics } from "@/lib/churn.functions";
import { cn } from "@/lib/utils";
import { AlertTriangle, TrendingDown, ShieldAlert, UserMinus } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function ChurnRiskWidget() {
  const fetchMetrics = useServerFn(getChurnMetrics);

  const { data, isLoading } = useQuery({
    queryKey: ["churn", "metrics"],
    queryFn: () => fetchMetrics(),
    refetchInterval: 300_000,
  });

  if (isLoading) {
    return <div className="h-32 w-full animate-pulse rounded-xl border bg-card/50" />;
  }

  const totalAtRisk = (data?.critical ?? 0) + (data?.high ?? 0);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all hover:shadow-lg hover:shadow-primary/5">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Saúde da Audiência
          </p>
          <h3 className="text-2xl font-bold tracking-tight text-foreground">
            {totalAtRisk}{" "}
            <span className="text-sm font-normal text-muted-foreground">Contatos em Risco</span>
          </h3>
        </div>
        <div
          className={cn(
            "rounded-full p-2.5",
            totalAtRisk > 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
          )}
        >
          {totalAtRisk > 0 ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <ShieldAlert className="h-5 w-5" />
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-muted-foreground">
            <span>Crítico</span>
            <span className="text-destructive">{data?.critical ?? 0}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-destructive transition-all duration-700"
              style={{
                width: `${Math.min(((data?.critical ?? 0) / (totalAtRisk || 1)) * 100, 100)}%`,
              }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-muted-foreground">
            <span>Alto Risco</span>
            <span className="text-orange-500">{data?.high ?? 0}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-700"
              style={{ width: `${Math.min(((data?.high ?? 0) / (totalAtRisk || 1)) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <TrendingDown className="h-3.5 w-3.5 text-destructive" />
          <span>+12% vs mês anterior</span>
        </div>
        <Link
          to="/ops"
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <UserMinus className="h-3.5 w-3.5" />
          Ver Detalhes
        </Link>
      </div>

      {/* Glossy overlay effect */}
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/5 blur-3xl transition-all group-hover:bg-primary/10" />
    </div>
  );
}
