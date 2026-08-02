import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import { getAnalyticsCharts } from "@/lib/analytics.functions";
import { pctDelta } from "@/lib/analytics-aggregate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { CampaignDrilldown } from "@/components/dashboard/campaign-drilldown";

const SERIES = ["var(--neon-cyan)", "var(--neon-purple)", "var(--neon-lime)", "var(--neon-pink)", "var(--neon-amber)"];

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  sms: "SMS",
  rcs: "RCS",
  mms: "MMS",
  linkedin: "LinkedIn",
  instagram: "Instagram",
};

const RANGES = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
] as const;

const axisProps = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip() {
  return (
    <Tooltip
      cursor={{ fill: "color-mix(in oklab, var(--foreground) 6%, transparent)" }}
      contentStyle={{
        background: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        fontSize: 12,
        color: "var(--popover-foreground)",
      }}
      labelStyle={{ color: "var(--muted-foreground)" }}
    />
  );
}

function ChartFrame({
  title,
  description,
  loading,
  empty,
  children,
  className,
}: {
  title: string;
  description: string;
  loading?: boolean;
  empty?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        {loading ? (
          <Skeleton className="h-[260px] w-full rounded-xl" />
        ) : empty ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Sem dados no período selecionado.
          </div>
        ) : (
          <div className="h-[260px] w-full">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

/** Indicador de tendência com delta percentual vs. período anterior. */
function DeltaBadge({
  delta,
  invert = false,
  className,
}: {
  delta: number | null;
  invert?: boolean;
  className?: string;
}) {
  if (delta === null) {
    return (
      <span className={cn("text-xxs uppercase tracking-widest text-muted-foreground", className)}>
        sem base
      </span>
    );
  }
  const flat = Math.abs(delta) < 0.05;
  const positive = invert ? delta < 0 : delta > 0;
  const Icon = flat ? ArrowRight : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
        flat
          ? "border-border text-muted-foreground"
          : positive
            ? "border-primary/40 text-primary"
            : "border-destructive/40 text-destructive",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {flat ? "0,0%" : `${delta > 0 ? "+" : ""}${delta.toFixed(1).replace(".", ",")}%`}
    </span>
  );
}

function TrendCard({
  label,
  value,
  previous,
  delta,
  invert,
  loading,
  suffix,
}: {
  label: string;
  value: number;
  previous: number;
  delta: number | null;
  invert?: boolean;
  loading?: boolean;
  suffix?: string;
}) {
  const fmt = (n: number) =>
    suffix === "%" ? `${n.toFixed(1).replace(".", ",")}%` : n.toLocaleString("pt-BR");
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xxs uppercase tracking-widest text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tabular-nums">{fmt(value)}</span>
              <DeltaBadge delta={delta} invert={invert} />
            </div>
            <p className="text-xs text-muted-foreground">
              Período anterior: {fmt(previous)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsCharts() {
  const [days, setDays] = useState<number>(30);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const fetchCharts = useServerFn(getAnalyticsCharts);
  const query = useQuery({
    queryKey: ["analytics", "charts", days],
    queryFn: () => fetchCharts({ data: { days } }),
  });

  const data = query.data;
  const loading = query.isLoading;

  const totals = data?.totals ?? { sent: 0, replies: 0, failed: 0, reply_rate: 0 };
  const previous = data?.previous_totals ?? { sent: 0, replies: 0, failed: 0, reply_rate: 0 };

  const deltas = useMemo(
    () => ({
      sent: pctDelta(totals.sent, previous.sent),
      replies: pctDelta(totals.replies, previous.replies),
      failed: pctDelta(totals.failed, previous.failed),
      rate: pctDelta(totals.reply_rate, previous.reply_rate),
    }),
    [totals, previous],
  );

  const previousByChannel = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of data?.previous_channels ?? []) map.set(c.channel, c.reply_rate);
    return map;
  }, [data]);

  const donut = (data?.channels ?? []).map((c) => ({
    name: CHANNEL_LABEL[c.channel] ?? c.channel,
    value: c.sent,
  }));
  const donutTotal = donut.reduce((a, d) => a + d.value, 0);

  const rateData = (data?.channels ?? []).map((c) => ({
    name: CHANNEL_LABEL[c.channel] ?? c.channel,
    rate: Number(c.reply_rate.toFixed(2)),
    anterior: Number((previousByChannel.get(c.channel) ?? 0).toFixed(2)),
  }));

  const campaigns = (data?.campaigns ?? []).map((c) => ({
    id: c.id,
    fullName: c.name,
    name: c.name.length > 18 ? `${c.name.slice(0, 17)}…` : c.name,
    sends: c.sends,
  }));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Resultados</h2>
          <p className="text-sm text-muted-foreground">
            Comparação com os {days} dias anteriores para decisões rápidas.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={days === r.days ? "premium" : "ghost"}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TrendCard
          label="Enviadas"
          value={totals.sent}
          previous={previous.sent}
          delta={deltas.sent}
          loading={loading}
        />
        <TrendCard
          label="Respostas"
          value={totals.replies}
          previous={previous.replies}
          delta={deltas.replies}
          loading={loading}
        />
        <TrendCard
          label="Taxa de resposta"
          value={totals.reply_rate}
          previous={previous.reply_rate}
          delta={deltas.rate}
          loading={loading}
          suffix="%"
        />
        <TrendCard
          label="Falhas"
          value={totals.failed}
          previous={previous.failed}
          delta={deltas.failed}
          invert
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartFrame
          className="lg:col-span-2"
          title="Volume de interações"
          description={`Envios, respostas e falhas por dia · últimos ${days} dias`}
          loading={loading}
          empty={totals.sent + totals.replies + totals.failed === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.daily ?? []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--neon-cyan)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--neon-cyan)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradReplies" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--neon-lime)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--neon-lime)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" {...axisProps} minTickGap={24} />
              <YAxis {...axisProps} width={44} />
              <ChartTooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="sent"
                name="Enviadas"
                stroke="var(--neon-cyan)"
                strokeWidth={2}
                fill="url(#gradSent)"
              />
              <Area
                type="monotone"
                dataKey="replies"
                name="Respostas"
                stroke="var(--neon-lime)"
                strokeWidth={2}
                fill="url(#gradReplies)"
              />
              <Area
                type="monotone"
                dataKey="failed"
                name="Falhas"
                stroke="var(--neon-pink)"
                strokeWidth={2}
                fillOpacity={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title="Mix de canais"
          description="Participação de cada canal no volume enviado"
          loading={loading}
          empty={donutTotal === 0}
        >
          <div className="relative h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <ChartTooltip />
                <Pie
                  data={donut}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="85%"
                  paddingAngle={2}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {donut.map((_, i) => (
                    <Cell key={i} fill={SERIES[i % SERIES.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-10">
              <span className="text-2xl font-bold tabular-nums">{donutTotal.toLocaleString("pt-BR")}</span>
              <span className="text-xxs uppercase tracking-widest text-muted-foreground">Envios</span>
            </div>
          </div>
        </ChartFrame>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartFrame
          title="Funil de entrega"
          description="Da fila até a resposta do decisor"
          loading={loading}
          empty={(data?.funnel ?? []).every((f) => f.value === 0)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data?.funnel ?? []}
              layout="vertical"
              margin={{ top: 8, right: 24, left: 24, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" {...axisProps} />
              <YAxis type="category" dataKey="stage" width={86} {...axisProps} />
              <ChartTooltip />
              <Bar dataKey="value" name="Mensagens" radius={[0, 6, 6, 0]}>
                {(data?.funnel ?? []).map((_, i) => (
                  <Cell key={i} fill={SERIES[i % SERIES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title="Taxa de resposta por canal"
          description="Período atual vs. período anterior"
          loading={loading}
          empty={rateData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rateData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis {...axisProps} width={44} unit="%" />
              <ChartTooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="anterior" name="Anterior" fill="var(--muted-foreground)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="rate" name="Atual" fill="var(--neon-purple)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title="Campanhas por volume"
          description="Envios materializados por campanha"
          loading={loading}
          empty={campaigns.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={campaigns} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" {...axisProps} interval={0} angle={-15} textAnchor="end" height={48} />
              <YAxis {...axisProps} width={44} />
              <ChartTooltip />
              <Bar dataKey="sends" name="Envios" fill="var(--neon-cyan)" radius={[6, 6, 0, 0]} />
              <Line
                type="monotone"
                dataKey="sends"
                name="Tendência"
                stroke="var(--neon-amber)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>
    </section>
  );
}