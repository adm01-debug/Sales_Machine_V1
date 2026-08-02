import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteComplianceTerm,
  listComplianceTerms,
  upsertComplianceTerm,
} from "@/lib/compliance.functions";
import {
  NICHE_LABELS,
  NICHE_RULES,
  type ComplianceNiche,
  type ComplianceSeverity,
} from "@/lib/compliance-terms";

const SEVERITIES: Array<{ value: ComplianceSeverity; label: string }> = [
  { value: "error", label: "Bloqueia o envio" },
  { value: "warning", label: "Alerta" },
  { value: "info", label: "Informativo" },
];

/** CRUD dos termos proibidos do cliente (Melhoria 035). */
export function ComplianceTermsManager() {
  const qc = useQueryClient();
  const list = useServerFn(listComplianceTerms);
  const upsert = useServerFn(upsertComplianceTerm);
  const remove = useServerFn(deleteComplianceTerm);

  const [term, setTerm] = useState("");
  const [reason, setReason] = useState("");
  const [niche, setNiche] = useState<ComplianceNiche | "custom">("custom");
  const [severity, setSeverity] = useState<ComplianceSeverity>("warning");

  const terms = useQuery({ queryKey: ["compliance-terms"], queryFn: () => list() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["compliance-terms"] });

  const saveMut = useMutation({
    mutationFn: () => upsert({ data: { term, reason, niche, severity, is_active: true } }),
    onSuccess: () => {
      setTerm("");
      setReason("");
      invalidate();
      toast.success("Termo cadastrado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Termo removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = term.trim().length >= 2 && reason.trim().length >= 3 && !saveMut.isPending;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ct-term">Termo proibido</Label>
          <Input
            id="ct-term"
            value={term}
            maxLength={120}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="ex.: lucro certo"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ct-reason">Motivo</Label>
          <Input
            id="ct-reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ex.: promessa de retorno vedada pela CVM"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Nicho</Label>
          <Select value={niche} onValueChange={(v) => setNiche(v as ComplianceNiche | "custom")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">{NICHE_LABELS.custom}</SelectItem>
              {(Object.keys(NICHE_RULES) as ComplianceNiche[]).map((n) => (
                <SelectItem key={n} value={n}>
                  {NICHE_LABELS[n]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Gravidade</Label>
          <Select value={severity} onValueChange={(v) => setSeverity(v as ComplianceSeverity)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button disabled={!canSave} onClick={() => saveMut.mutate()}>
        {saveMut.isPending ? "Salvando…" : "Adicionar termo"}
      </Button>

      {terms.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando termos…</p>
      ) : (terms.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum termo próprio cadastrado — apenas as listas regulatórias embutidas são aplicadas.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {terms.data?.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.term}</p>
                <p className="truncate text-xs text-muted-foreground">{t.reason}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{NICHE_LABELS[t.niche]}</Badge>
                <Badge variant={t.severity === "error" ? "destructive" : "secondary"}>
                  {t.severity === "error" ? "bloqueia" : t.severity === "warning" ? "alerta" : "info"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover termo ${t.term}`}
                  disabled={deleteMut.isPending}
                  onClick={() => deleteMut.mutate(t.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}