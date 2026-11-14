import { useMemo, useState } from "react";
import { AlertTriangle, Info, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  auditCompliance,
  NICHE_RULES,
  NICHE_LABELS,
  type ComplianceNiche,
  type ComplianceRule,
  type ComplianceSeverity,
} from "@/lib/compliance-terms";

export interface ComplianceAuditPanelProps {
  text: string;
  /** Quando informado, o seletor de nicho é ocultado (modo controlado). */
  niches?: readonly ComplianceNiche[];
  customRules?: readonly ComplianceRule[];
  className?: string;
}

const ICONS: Record<ComplianceSeverity, typeof Info> = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE: Record<ComplianceSeverity, string> = {
  error: "text-destructive",
  warning: "text-neon-amber",
  info: "text-muted-foreground",
};

/** Auditoria de termos proibidos por nicho regulatório (Melhoria 034). */
export function ComplianceAuditPanel({
  text,
  niches,
  customRules,
  className,
}: ComplianceAuditPanelProps) {
  const [localNiche, setLocalNiche] = useState<ComplianceNiche>("geral");
  const active: readonly ComplianceNiche[] = niches?.length
    ? niches
    : localNiche === "geral"
      ? ["geral"]
      : ["geral", localNiche];
  const report = useMemo(
    () => auditCompliance({ text, niches: active, customRules }),
    [text, active, customRules],
  );

  return (
    <div className={cn("space-y-3 rounded-md border p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Conformidade regulatória</span>
        <Badge variant={report.blocked ? "destructive" : "secondary"}>
          {report.score}/100 · {report.blocked ? "bloqueado" : "liberado"}
        </Badge>
      </div>
      {!niches?.length && (
        <Select value={localNiche} onValueChange={(v) => setLocalNiche(v as ComplianceNiche)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Nicho do cliente" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(NICHE_RULES) as ComplianceNiche[]).map((n) => (
              <SelectItem key={n} value={n}>
                {NICHE_LABELS[n]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Progress value={report.score} />
      <p className="text-xs text-muted-foreground">
        Listas ativas: {active.map((n) => NICHE_LABELS[n]).join(", ")}
        {customRules?.length ? ` · ${customRules.length} termo(s) do cliente` : ""}
      </p>
      {report.violations.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Nenhum termo proibido encontrado.
        </p>
      ) : (
        <ul className="space-y-2">
          {report.violations.map((v) => {
            const Icon = ICONS[v.severity];
            return (
              <li key={`${v.niche}:${v.term}`} className="flex gap-2 text-xs">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE[v.severity])} />
                <span>
                  <span className={cn("font-medium", TONE[v.severity])}>
                    “{v.term}” · {NICHE_LABELS[v.niche]}
                  </span>
                  <span className="block text-muted-foreground">{v.reason}</span>
                  {v.suggestion && (
                    <span className="block text-muted-foreground">Sugestão: {v.suggestion}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
