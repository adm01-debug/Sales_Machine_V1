import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listComplianceViolations } from "@/lib/ops.functions";
import { ShieldAlert } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NICHE_LABELS } from "@/lib/compliance-terms";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ComplianceViolationsTrail() {
  const fetchViolations = useServerFn(listComplianceViolations);
  const { data: violations } = useSuspenseQuery({
    queryKey: ["compliance_violations_log"],
    queryFn: () => fetchViolations(),
  });

  return (
    <>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-primary" />
          <div>
            <CardTitle>Trilha de Auditoria: Conformidade</CardTitle>
            <CardDescription>
              Tentativas de envio ou salvamento com termos restritos/proibidos.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Data/Hora</th>
                <th className="px-4 py-3">Campanha</th>
                <th className="px-4 py-3">Nicho</th>
                <th className="px-4 py-3">Termo</th>
                <th className="px-4 py-3">Ação</th>
                <th className="px-4 py-3">Snapshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {violations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground italic">
                    Nenhuma violação registrada recentemente.
                  </td>
                </tr>
              ) : (
                violations.map((v) => (
                  <tr key={v.id} className="transition-colors hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {v.created_at
                        ? format(new Date(v.created_at), "dd/MM HH:mm", { locale: ptBR })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {v.marketing_campaigns?.name || (
                        <span className="text-muted-foreground italic">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className="text-xxs font-medium uppercase tracking-tighter"
                      >
                        {NICHE_LABELS[v.niche as keyof typeof NICHE_LABELS] || v.niche}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          v.severity === "error"
                            ? "font-bold text-destructive"
                            : "font-medium text-warning"
                        }
                      >
                        {v.term}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={v.action === "launch" ? "destructive" : "secondary"}
                        className="text-[10px]"
                      >
                        {v.action === "launch" ? "LANÇAR" : "SALVAR"}
                      </Badge>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-muted-foreground">
                      {v.text_snapshot}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </>
  );
}
