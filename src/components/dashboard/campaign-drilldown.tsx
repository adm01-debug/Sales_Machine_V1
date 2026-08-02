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
import { ExternalLink, AlertTriangle, AlertCircle, Info, CheckCircle2, ShieldAlert } from "lucide-react";

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
  const [sentiment, setSentiment] = useState<"all" | "positive" | "neutral" | "negative">("all");
  const fetchDrilldown = useServerFn(getCampaignDrilldown);
  const query = useQuery({
    queryKey: ["analytics", "campaign-drilldown", campaignId, days, sentiment],
    queryFn: () => fetchDrilldown({ data: { campaignId: campaignId as string, days, sentimentFilter: sentiment } }),
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
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
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
            
            <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
              {([
                { id: "all", label: "Todos" },
                { id: "positive", label: "Positivos" },
                { id: "neutral", label: "Neutros" },
                { id: "negative", label: "Negativos" }
              ] as const).map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant={sentiment === s.id ? "secondary" : "ghost"}
                  onClick={() => setSentiment(s.id)}
                  className="h-7 px-2 text-xs"
                >
                  {s.label}
                </Button>
              ))}
            </div>
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
            {data?.diagnosis && (
              <section className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Diagnóstico Automático
                    </h3>
                    <Badge variant={data.diagnosis.score > 80 ? "lime" : data.diagnosis.score > 50 ? "amber" : "destructive"}>
                      Health Score: {data.diagnosis.score}/100
                    </Badge>
                  </div>
                  {data.diagnosis.score === 100 && (
                    <div className="flex items-center gap-1 text-xs text-neon-lime">
                      <CheckCircle2 className="h-3 w-3" />
                      Campanha Saudável
                    </div>
                  )}
                </div>

                <div className="grid gap-3">
                  {data.diagnosis.recommendations.map((rec, i) => (
                    <div 
                      key={i}
                      className="flex gap-3 p-3 rounded-lg bg-background/50 border border-border/50 text-sm"
                    >
                      <div className="mt-0.5">
                        {rec.type === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
                        {rec.type === "warning" && <AlertTriangle className="h-4 w-4 text-warning" />}
                        {rec.type === "info" && <Info className="h-4 w-4 text-neon-cyan" />}
                      </div>
                      <div className="space-y-1 flex-1">
                        <div className="font-medium flex items-center justify-between">
                          {rec.title}
                          <Badge variant="outline" className="text-[10px] uppercase h-4">
                            {rec.type}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          {rec.description}
                        </p>
                        {rec.action && (
                          <div className="pt-1 text-xs font-medium text-foreground italic">
                            💡 Recomendação: {rec.action}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {data.diagnosis.recommendations.length === 0 && (
                    <p className="text-xs text-muted-foreground italic text-center py-2">
                      Nenhum problema crítico detectado. Continue monitorando o desempenho.
                    </p>
                  )}
                </div>

                {data.diagnosis.sentiment && (
                  <div className="mt-4 border-t border-border pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-neon-purple animate-pulse" />
                        Análise de Sentimento (FATOR X)
                      </h4>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-[10px] text-neon-lime border-neon-lime/30 bg-neon-lime/5">
                          {data.diagnosis.sentiment.positive} Positivas
                        </Badge>
                        <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30 bg-destructive/5">
                          {data.diagnosis.sentiment.negative} Negativas
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="grid gap-2">
                      <div className={`text-xs p-2.5 rounded-lg border italic leading-relaxed ${
                        data.diagnosis.sentiment.threshold_alert 
                          ? "bg-destructive/10 border-destructive/30 text-destructive-foreground font-medium" 
                          : "bg-accent/30 border-border/50 text-foreground"
                      }`}>
                        {data.diagnosis.sentiment.threshold_alert && (
                          <div className="flex items-center gap-2 mb-1 not-italic">
                            <ShieldAlert className="h-3.5 w-3.5 text-destructive animate-bounce" />
                            <span className="text-[10px] font-bold uppercase tracking-tighter">Limite Excedido: {data.diagnosis.sentiment.negative_rate.toFixed(1)}% Negativo</span>
                          </div>
                        )}
                        "{data.diagnosis.sentiment.summary}"
                      </div>
                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Info className="h-3.5 w-3.5 mt-0.5 text-neon-purple" />
                        <span><strong>Insight:</strong> {data.diagnosis.sentiment.top_insight}</span>
                      </div>
                    </div>

                    {data.diagnosis.sentiment.positive_terms.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[9px] font-bold uppercase text-muted-foreground/70 tracking-widest px-1">
                          Nuvem de Oportunidade (Termos Positivos)
                        </div>
                        <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-neon-lime/5 border border-neon-lime/20">
                          {data.diagnosis.sentiment.positive_terms.map((t, i) => (
                            <Badge 
                              key={i} 
                              variant="outline" 
                              className="bg-background/50 border-neon-lime/30 text-neon-lime text-[10px] py-0 px-2"
                              style={{ 
                                fontSize: `${Math.min(14, 10 + t.count)}px`,
                                opacity: Math.max(0.6, Math.min(1, t.count / 5)) 
                              }}
                            >
                              {t.term}
                              {t.count > 1 && <span className="ml-1 opacity-50">({t.count})</span>}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

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
