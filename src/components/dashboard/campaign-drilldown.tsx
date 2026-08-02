import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCampaignDrilldown } from "@/lib/analytics.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

const SERIES = [
  "var(--neon-cyan)",
  "var(--neon-purple)",
  "var(--neon-lime)",
  "var(--neon-pink)",
  "var(--neon-amber)",
];

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  sms: "SMS",
  rcs: "RCS",
  mms: "MMS",
  linkedin: "LinkedIn",
  instagram: "Instagram",
};

const axisProps = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

const tooltipProps = {
  cursor: { fill: "color-mix(in oklab, var(--foreground) 6%, transparent)" },
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    fontSize: 12,
    color: "var(--popover-foreground)",
  },
  labelStyle: { color: "var(--muted-foreground)" },
} as const;

export interface CampaignDrilldownProps {
  /** Campanha selecionada no ranking; `null` mantém o painel fechado. */
  campaignId: string | null;
  campaignName?: string | undefined;
  onClose: () => void;
}

/** Painel de detalhamento de uma campanha: etapas, canais e variantes. */
export function CampaignDrilldown({ campaignId, campaignName, onClose }: CampaignDrilldownProps) {
  const [days, setDays] = useState(30);
  const fetchDrilldown = useServerFn(getCampaignDrilldown);
  const query = useQuery({
    queryKey: ["analytics", "campaign-drilldown", campaignId, days],
    queryFn: () => fetchDrilldown({ data: { campaignId: campaignId as string, days } }),
    enabled: Boolean(campaignId),
  });

  const data = query.data;
  const loading = query.isLoading;

  const channels = (data?.channels ?? []).map((c) => ({
    ...c,
    name: CHANNEL_LABEL[c.channel] ?? c.channel,
    reply_rate: Number(c.reply_rate.toFixed(2)),
  }));

  return (
    <Dialog open={Boolean(campaignId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {data?.campaign?.name ?? campaignName ?? "Campanha"}
            {data?.campaign?.status ? (
              <Badge variant="secondary">{data.campaign.status}</Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {data
              ? `${data.total_sends.toLocaleString("pt-BR")} envios materializados nos últimos ${days} dias`
              : "Carregando detalhamento por canal e etapa…"}
          </DialogDescription>
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit mt-2">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? "premium" : "ghost"}
                onClick={() => setDays(d)}
                className="h-7 px-2 text-xs"
              >
                {d} dias
              </Button>
            ))}
          </div>
          {campaignId && (
            <div className="mt-4 border-t border-border pt-4">
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto gap-2">
                <Link 
                  to="/campaigns/wizard" 
                  search={{ campaignId }}
                  className="flex items-center"
                >
                  <ExternalLink className="h-4 w-4" />
                  Ajustar e Revisar Campanha no Wizard
                </Link>
              </Button>
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-[220px] w-full rounded-xl" />
            <Skeleton className="h-[220px] w-full rounded-xl" />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Etapas do envio</h3>
              {(data?.stages ?? []).every((s) => s.value === 0) ? (
                <p className="text-sm text-muted-foreground">Nenhum envio registrado ainda.</p>
              ) : (
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data?.stages ?? []}
                      layout="vertical"
                      margin={{ top: 8, right: 24, left: 24, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" {...axisProps} />
                      <YAxis type="category" dataKey="stage" width={110} {...axisProps} />
                      <Tooltip {...tooltipProps} />
                      <Bar dataKey="value" name="Envios" radius={[0, 6, 6, 0]}>
                        {(data?.stages ?? []).map((_, i) => (
                          <Cell key={i} fill={SERIES[i % SERIES.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Desempenho por canal</h3>
              {channels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sem interações registradas para esta campanha.
                </p>
              ) : (
                <>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={channels} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="name" {...axisProps} />
                        <YAxis {...axisProps} width={44} />
                        <Tooltip {...tooltipProps} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="sent" name="Enviadas" fill="var(--neon-cyan)" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="delivered" name="Entregues" fill="var(--neon-purple)" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="replied" name="Respostas" fill="var(--neon-lime)" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="failed" name="Falhas" fill="var(--neon-pink)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {channels.map((c) => (
                      <li
                        key={c.channel}
                        className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
                      >
                        <span>{c.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {c.reply_rate.toFixed(1).replace(".", ",")}% de resposta
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            {(data?.variants ?? []).length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Variantes</h3>
                <ul className="space-y-2">
                  {(data?.variants ?? []).map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
                    >
                      <span>{v.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {v.sends.toLocaleString("pt-BR")} envios · {v.failed} falhas
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {(data?.top_errors ?? []).length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Principais erros</h3>
                <ul className="space-y-2">
                  {(data?.top_errors ?? []).map((e) => (
                    <li
                      key={e.message}
                      className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
                    >
                      <span className="break-all">{e.message}</span>
                      <span className="tabular-nums text-muted-foreground">{e.count}x</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
