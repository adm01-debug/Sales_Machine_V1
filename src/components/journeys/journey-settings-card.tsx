import type { JourneySettings } from "@/lib/journey-graph";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export interface JourneySettingsCardProps {
  settings: JourneySettings;
  onChange: (patch: Partial<JourneySettings>) => void;
}

/** Configurações globais da jornada: identidade, guardrails e janela de envio. */
export function JourneySettingsCard({ settings, onChange }: JourneySettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configurações</CardTitle>
        <CardDescription>
          Valem para todas as etapas: janela de envio, teto de entradas e gate humano.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="journey-name">Nome</Label>
          <Input
            id="journey-name"
            value={settings.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="journey-description">Descrição</Label>
          <Textarea
            id="journey-description"
            rows={2}
            value={settings.description ?? ""}
            onChange={(e) => onChange({ description: e.target.value || null })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="window-start">Janela — início (h UTC)</Label>
          <Input
            id="window-start"
            type="number"
            min={0}
            max={23}
            value={settings.send_window_start}
            onChange={(e) => onChange({ send_window_start: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="window-end">Janela — fim (h UTC)</Label>
          <Input
            id="window-end"
            type="number"
            min={1}
            max={24}
            value={settings.send_window_end}
            onChange={(e) => onChange({ send_window_end: Number(e.target.value) || 24 })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="entry-cap">Teto de entradas por dia</Label>
          <Input
            id="entry-cap"
            type="number"
            min={0}
            value={settings.entry_daily_cap}
            onChange={(e) => onChange({ entry_daily_cap: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <div>
            <Label htmlFor="reentry">Permitir reentrada</Label>
            <p className="text-xs text-muted-foreground">Mesmo contato pode entrar de novo.</p>
          </div>
          <Switch
            id="reentry"
            checked={settings.allow_reentry}
            onCheckedChange={(v) => onChange({ allow_reentry: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3 md:col-span-2">
          <div>
            <Label htmlFor="approval">Exigir aprovação humana</Label>
            <p className="text-xs text-muted-foreground">
              Cada mensagem vai para a fila de aprovações antes de sair.
            </p>
          </div>
          <Switch
            id="approval"
            checked={settings.requires_human_approval}
            onCheckedChange={(v) => onChange({ requires_human_approval: v })}
          />
        </div>
      </CardContent>
    </Card>
  );
}