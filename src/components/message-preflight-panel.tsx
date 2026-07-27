import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Channel } from "@/lib/audience-rules";
import { preflightMessage, type MessageSeverity } from "@/lib/message-preflight";
import { scoreLabel } from "@/lib/email-preflight";

export interface MessagePreflightPanelProps {
  channel: Channel;
  body: string;
  mediaUrl?: string | null;
  className?: string;
}

const ICONS: Record<MessageSeverity, typeof Info> = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE: Record<MessageSeverity, string> = {
  error: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-muted-foreground",
};

/** Relatório de qualidade para canais curtos (WhatsApp, SMS, RCS, MMS, LinkedIn, Instagram). */
export function MessagePreflightPanel({
  channel,
  body,
  mediaUrl,
  className,
}: MessagePreflightPanelProps) {
  const report = useMemo(
    () => preflightMessage({ channel, body, mediaUrl }),
    [channel, body, mediaUrl],
  );

  return (
    <div className={cn("space-y-3 rounded-md border p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Pré-voo de qualidade</span>
        <Badge variant={report.score >= 70 ? "secondary" : "destructive"}>
          {report.score}/100 · {scoreLabel(report.score)}
        </Badge>
      </div>
      <Progress value={report.score} />
      <p className="text-xs text-muted-foreground">
        {report.chars} caracteres · {report.linkCount} link(s) · {report.emojiCount} emoji(s)
        {report.smsSegments !== null ? ` · ${report.smsSegments} segmento(s) SMS` : ""}
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
