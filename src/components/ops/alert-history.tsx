import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAlertNotifications } from "@/lib/ops.functions";
import { cn } from "@/lib/utils";

const dt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/**
 * Histórico das notificações disparadas pela varredura automática de alertas.
 * Diferente do banner (estado atual), aqui aparece o rastro do que já foi
 * comunicado externamente — incluindo alertas já resolvidos.
 */
export function AlertHistory() {
  const fetchNotifications = useServerFn(getAlertNotifications);
  const { data, isLoading } = useQuery({
    queryKey: ["ops", "alert-notifications"],
    queryFn: () => fetchNotifications(),
  });

  const rows = data ?? [];

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Notificações enviadas</h2>
      {isLoading ? (
        <div className="h-20 animate-pulse rounded-lg border border-border bg-muted/40" />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Nenhuma notificação registrada. A varredura automática grava aqui cada alerta aberto,
          relembrado ou resolvido.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {rows.map((row: any) => (
            <li key={row.id} className="flex items-start gap-3 p-3">
              <span
                className={cn(
                  "mt-1 h-2 w-2 shrink-0 rounded-full",
                  row.resolved_at
                    ? "bg-muted-foreground"
                    : row.level === "critical"
                      ? "bg-destructive"
                      : "bg-primary",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
                <p className="text-xs text-muted-foreground">{row.detail}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.resolved_at
                    ? `Resolvido em ${dt(row.resolved_at)}`
                    : `Ativo desde ${dt(row.first_notified_at)}`}
                  {" · último aviso "}
                  {dt(row.last_notified_at)}
                  {` · ${row.occurrences}x`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}