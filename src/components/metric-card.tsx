import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type MetricAccent = "cyan" | "purple" | "lime" | "pink" | "amber";

const ACCENT_BAR: Record<MetricAccent, string> = {
  cyan: "bg-neon-cyan",
  purple: "bg-neon-purple",
  lime: "bg-neon-lime",
  pink: "bg-neon-pink",
  amber: "bg-neon-amber",
};

export interface MetricCardProps {
  label: string;
  value: number | string;
  hint?: string;
  loading?: boolean;
  accent?: MetricAccent;
}

export function MetricCard({ label, value, hint, loading, accent = "cyan" }: MetricCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-5">
        <div className="flex items-center gap-2">
          <span className={cn("h-4 w-1 rounded-full", ACCENT_BAR[accent])} aria-hidden />
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pb-5">
        <p className="text-3xl font-bold tabular-nums tracking-tight">
          {loading ? (
            <span className="inline-block h-7 w-16 animate-pulse rounded bg-muted" />
          ) : (
            value
          )}
        </p>
        {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
