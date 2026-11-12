import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ComplianceTermsManager } from "@/components/compliance-terms-manager";
import { ComplianceAuditPanel } from "@/components/compliance-audit-panel";
import { listComplianceTerms } from "@/lib/compliance.functions";
import type { ComplianceNiche, ComplianceRule } from "@/lib/compliance-terms";

export const Route = createFileRoute("/_authenticated/compliance")({
  head: () => ({
    meta: [
      { title: "Conformidade · Sales Machine" },
      {
        name: "description",
        content:
          "Audite criativos contra termos proibidos por nicho regulatório e gerencie a lista do cliente.",
      },
      { property: "og:title", content: "Conformidade · Sales Machine" },
      {
        property: "og:description",
        content: "Auditoria de termos proibidos por nicho e bloqueio de campanhas fora de norma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompliancePage,
});

function CompliancePage() {
  const list = useServerFn(listComplianceTerms);
  const terms = useQuery({ queryKey: ["compliance-terms"], queryFn: () => list() });
  const [draft, setDraft] = useState("");

  const active = useMemo(() => (terms.data ?? []).filter((t) => t.is_active), [terms.data]);
  const rules: ComplianceRule[] = useMemo(
    () =>
      active.map(({ term, severity, reason, suggestion }) => ({
        term,
        severity,
        reason,
        suggestion,
      })),
    [active],
  );
  const niches = useMemo<readonly ComplianceNiche[]>(() => {
    const set = new Set<ComplianceNiche>(["geral"]);
    for (const t of active) if (t.niche !== "custom") set.add(t.niche);
    return [...set];
  }, [active]);

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Conformidade regulatória</h1>
        <p className="text-sm text-muted-foreground">
          Termos proibidos por nicho (ANVISA, CVM, OAB, SPA/MF, CDC) somados à lista do cliente.
          Violações graves bloqueiam o lançamento da campanha.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lista do cliente</CardTitle>
            <CardDescription>
              Termos específicos do seu negócio, além das listas embutidas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ComplianceTermsManager />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Testar um texto</CardTitle>
            <CardDescription>Cole um criativo para ver o resultado da auditoria.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="compliance-draft">Texto</Label>
              <Textarea
                id="compliance-draft"
                rows={8}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Cole aqui a mensagem que será enviada…"
              />
            </div>
            <ComplianceAuditPanel text={draft} niches={niches} customRules={rules} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
