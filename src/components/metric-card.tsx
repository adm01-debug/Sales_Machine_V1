import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface MetricCardProps {
  label: string;
  value: number | string;
  hint?: string;
  loading?: boolean;
}

export function MetricCard({ label, value, hint, loading }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums">
          {loading ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-muted" /> : value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
