import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getChannelROI } from "@/lib/ops.functions";
import { formatBRL } from "@/lib/cost-model";
import { cn } from "@/lib/utils";
import { TrendingUp, Users, Target, BarChart3 } from "lucide-react";

const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
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

export function ChannelROIStats() {
  const [days, setDays] = useState<number>(7);
  const fetchROI = useServerFn(getChannelROI);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["ops", "roi", days],
    queryFn: () => fetchROI({ data: { days } }),
    refetchInterval: 600_000,
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          ROI & Conversão por Canal (Melhoria 037)
        </h2>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setDays(p.days)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition-all",
                days === p.days
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-32 animate-pulse rounded-lg border bg-muted/20" />
          <div className="h-32 animate-pulse rounded-lg border bg-muted/20" />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Erro ao carregar ROI: {(error as Error).message}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-border bg-card/50 p-8 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">
            Dados de conversão insuficiente para o período selecionado.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((item) => (
            <div
              key={item.channel}
              className="rounded-lg border border-border bg-card p-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {CHANNEL_LABEL[item.channel] ?? item.channel}
                </span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                    (item.conversion_rate ?? 0) > 2
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.conversion_rate ?? 0}% Conv.
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase">
                    <Target className="h-3 w-3" /> Custo
                  </div>
                  <div className="text-sm font-medium">{formatBRL(item.total_spent_brl)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase">
                    <Users className="h-3 w-3" /> Conv.
                  </div>
                  <div className="text-sm font-medium">{item.total_conversions}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase">
                    <TrendingUp className="h-3 w-3" /> CAC
                  </div>
                  <div className="text-sm font-medium text-primary">
                    {item.cac_brl ? formatBRL(item.cac_brl) : "—"}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border/50">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Eficiência de Funil</span>
                  <span>{item.total_messages_sent} envios</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.min((item.conversion_rate ?? 0) * 5, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
