import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { EmailBlock } from "@/lib/email-blocks";
import { preflightEmail, scoreLabel, type PreflightSeverity } from "@/lib/email-preflight";

export interface EmailPreflightPanelProps {
  subject: string;
  blocks: EmailBlock[];
  className?: string;
}

const ICONS: Record<PreflightSeverity, typeof Info> = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE: Record<PreflightSeverity, string> = {
  error: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-muted-foreground",
};

/** Relatório de entregabilidade do e-mail, calculado no cliente em tempo real. */
export function EmailPreflightPanel({ subject, blocks, className }: EmailPreflightPanelProps) {
  const report = useMemo(() => preflightEmail({ subject, blocks }), [subject, blocks]);
  const label = scoreLabel(report.score);

  return (
    <div className={cn("space-y-3 rounded-md border p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Pré-voo de entregabilidade</span>
        <Badge variant={report.score >= 70 ? "secondary" : "destructive"}>
          {report.score}/100 · {label}
        </Badge>
      </div>
      <Progress value={report.score} />
      <p className="text-xs text-muted-foreground">
        {(report.htmlBytes / 1024).toFixed(1)} KB · {report.textChars} chars de texto ·{" "}
        {report.imageCount} imagem(ns) · {report.linkCount} link(s)
      </p>
      {report.findings.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Nenhum problema detectado.
        </p>
      ) : (
        <ul className="space-y-2">
          {report.findings.map((f) => {
            const Icon = ICONS[f.severity];
            return (
              <li key={f.code} className="flex gap-2 text-xs">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE[f.severity])} />
                <span>
                  <span className={cn("font-medium", TONE[f.severity])}>{f.message}</span>
                  {f.hint && <span className="block text-muted-foreground">{f.hint}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}