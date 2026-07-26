import { useMemo } from "react";
import type { Channel } from "@/lib/audience-rules";
import { renderTemplate, sampleVarValues } from "@/lib/template-vars";
import { analyzeSms } from "@/lib/sms-segments";
import { CHANNEL_BODY_LIMIT } from "@/lib/campaign-validation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MessagePreviewProps {
  channel: Channel;
  subject?: string | null;
  body: string;
  mediaUrl?: string | null;
  /** Valores do contato escolhido; sem ele, usamos os exemplos do catálogo. */
  values?: Record<string, string | null>;
  contactName?: string;
  className?: string;
}

/** Prévia renderizada da mensagem, com variáveis resolvidas e contagem por canal. */
export function MessagePreview({
  channel,
  subject,
  body,
  mediaUrl,
  values,
  contactName,
  className,
}: MessagePreviewProps) {
  const resolved = values ?? sampleVarValues();

  const rendered = useMemo(() => renderTemplate(body, resolved), [body, resolved]);
  const renderedSubject = useMemo(
    () => (subject ? renderTemplate(subject, resolved).text : ""),
    [subject, resolved],
  );

  const limit = CHANNEL_BODY_LIMIT[channel];
  const isSms = channel === "sms" || channel === "mms";
  const sms = isSms ? analyzeSms(rendered.text) : null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="uppercase">
          {channel}
        </Badge>
        {contactName ? (
          <span className="text-xs text-muted-foreground">Prévia para {contactName}</span>
        ) : (
          <span className="text-xs text-muted-foreground">Prévia com dados de exemplo</span>
        )}
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-3">
        {channel === "email" && renderedSubject ? (
          <p className="mb-2 border-b border-border pb-2 text-sm font-semibold">
            {renderedSubject}
          </p>
        ) : null}
        {mediaUrl ? (
          <img
            src={mediaUrl}
            alt="Mídia anexada à mensagem"
            loading="lazy"
            className="mb-2 max-h-40 w-full rounded-md object-cover"
          />
        ) : null}
        <p className="whitespace-pre-wrap text-sm">
          {rendered.text || (
            <span className="text-muted-foreground">Escreva o corpo da mensagem…</span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className={cn(rendered.text.length > limit && "text-destructive")}>
          {rendered.text.length}/{limit} caracteres
        </span>
        {sms ? (
          <span>
            {sms.segments} segmento(s) · {sms.encoding}
          </span>
        ) : null}
        {rendered.missing.length > 0 ? (
          <span className="text-destructive">
            Sem valor: {rendered.missing.map((k) => `{{${k}}}`).join(", ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}