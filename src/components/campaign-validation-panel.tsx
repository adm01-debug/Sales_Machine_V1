import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { ValidationIssue } from "@/lib/campaign-validation";
import { cn } from "@/lib/utils";

interface CampaignValidationPanelProps {
  issues: ValidationIssue[];
  className?: string;
}

/** Lista os problemas de autoria da campanha: erros bloqueiam, avisos apenas alertam. */
export function CampaignValidationPanel({ issues, className }: CampaignValidationPanelProps) {
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  if (issues.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-border bg-card p-3 text-sm",
          className,
        )}
      >
        <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
        <span>Criativos validados — pronto para lançar.</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2 rounded-md border border-border bg-card p-3", className)}>
      <p className="text-sm font-medium">
        Validação — {errors.length} erro(s), {warnings.length} aviso(s)
      </p>
      <ul className="space-y-1.5">
        {[...errors, ...warnings].map((issue, idx) => (
          <li key={`${issue.scope}-${idx}`} className="flex items-start gap-2 text-sm">
            {issue.level === "error" ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            ) : (
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            )}
            <span>
              <span className="font-medium">{issue.scope}:</span>{" "}
              <span className="text-muted-foreground">{issue.message}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
