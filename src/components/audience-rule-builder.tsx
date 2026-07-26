import { CHANNELS, type AudienceRules } from "@/lib/audience-rules";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AudienceRuleBuilderProps {
  rules: AudienceRules;
  onChange: (rules: AudienceRules) => void;
}

const KINDS = ["company", "person"] as const;

export function AudienceRuleBuilder({ rules, onChange }: AudienceRuleBuilderProps) {
  const set = <K extends keyof AudienceRules>(key: K, value: AudienceRules[K]) =>
    onChange({ ...rules, [key]: value });

  const toggleKind = (kind: (typeof KINDS)[number]) =>
    set(
      "kinds",
      rules.kinds.includes(kind) ? rules.kinds.filter((k) => k !== kind) : [...rules.kinds, kind],
    );

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Tipo de registro</Label>
        <div className="flex gap-2">
          {KINDS.map((kind) => (
            <Badge
              key={kind}
              role="button"
              tabIndex={0}
              onClick={() => toggleKind(kind)}
              onKeyDown={(e) => e.key === "Enter" && toggleKind(kind)}
              variant={rules.kinds.includes(kind) ? "default" : "outline"}
              className="cursor-pointer"
            >
              {kind === "company" ? "Empresas" : "Pessoas"}
            </Badge>
          ))}
          {rules.kinds.length === 0 ? (
            <span className="text-xs text-muted-foreground">Todos os tipos</span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="search">Nome contém</Label>
          <Input
            id="search"
            value={rules.search}
            placeholder="ex.: logística"
            onChange={(e) => set("search", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="industries">Setores (separados por vírgula)</Label>
          <Input
            id="industries"
            value={rules.industries.join(", ")}
            placeholder="varejo, indústria"
            onChange={(e) =>
              set(
                "industries",
                e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              )
            }
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="score">Score mínimo de sinal</Label>
          <Input
            id="score"
            type="number"
            min={0}
            value={rules.min_signal_score}
            onChange={(e) => set("min_signal_score", Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="engaged">Engajou nos últimos (dias)</Label>
          <Input
            id="engaged"
            type="number"
            min={0}
            value={rules.engaged_within_days}
            onChange={(e) => set("engaged_within_days", Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cooldown">Excluir contatados há menos de (horas)</Label>
          <Input
            id="cooldown"
            type="number"
            min={0}
            value={rules.exclude_contacted_hours}
            onChange={(e) => set("exclude_contacted_hours", Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Exigir consentimento no canal</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={rules.require_consent_channel ? "outline" : "default"}
            onClick={() => set("require_consent_channel", undefined)}
          >
            Qualquer
          </Button>
          {CHANNELS.map((channel) => (
            <Button
              key={channel}
              type="button"
              size="sm"
              variant={rules.require_consent_channel === channel ? "default" : "outline"}
              onClick={() => set("require_consent_channel", channel)}
              className={cn("capitalize")}
            >
              {channel}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rules.only_previously_contacted}
            onChange={(e) => set("only_previously_contacted", e.target.checked)}
            className="size-4 accent-primary"
          />
          Somente quem já foi contatado (reativação)
        </label>
        <div className="space-y-2">
          <Label htmlFor="limit">Limite de membros</Label>
          <Input
            id="limit"
            type="number"
            min={1}
            max={5000}
            value={rules.limit}
            onChange={(e) => set("limit", Math.min(Number(e.target.value) || 1, 5000))}
          />
        </div>
      </div>
    </div>
  );
}
