import { GripVertical, Trash2 } from "lucide-react";
import {
  FIELD_TYPE_LABEL,
  LEAD_FIELD_TYPES,
  type LeadField,
  type LeadFieldType,
} from "@/lib/lead-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface LeadFieldEditorProps {
  field: LeadField;
  index: number;
  total: number;
  error?: string;
  onChange: (patch: Partial<LeadField>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}

/** Edição de um campo do formulário público. */
export function LeadFieldEditor({
  field,
  index,
  total,
  error,
  onChange,
  onRemove,
  onMove,
}: LeadFieldEditorProps) {
  const isChoice = field.type === "select";

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-xs font-medium text-muted-foreground">Campo {index + 1}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label="Mover para cima"
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label="Mover para baixo"
          >
            ↓
          </Button>
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remover campo">
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`label-${field.key}`}>Rótulo</Label>
          <Input
            id={`label-${field.key}`}
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`key-${field.key}`}>Identificador</Label>
          <Input
            id={`key-${field.key}`}
            value={field.key}
            onChange={(e) => onChange({ key: e.target.value.toLowerCase() })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`type-${field.key}`}>Tipo</Label>
          <Select
            value={field.type}
            onValueChange={(value) => onChange({ type: value as LeadFieldType })}
          >
            <SelectTrigger id={`type-${field.key}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_FIELD_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {FIELD_TYPE_LABEL[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`ph-${field.key}`}>Texto de ajuda</Label>
          <Input
            id={`ph-${field.key}`}
            value={field.placeholder ?? ""}
            onChange={(e) => onChange({ placeholder: e.target.value })}
          />
        </div>
        {isChoice ? (
          <div className="space-y-1.5">
            <Label htmlFor={`opt-${field.key}`}>Opções (separadas por vírgula)</Label>
            <Input
              id={`opt-${field.key}`}
              value={field.options.join(", ")}
              onChange={(e) =>
                onChange({
                  options: e.target.value
                    .split(",")
                    .map((opt) => opt.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id={`req-${field.key}`}
          checked={field.required}
          onCheckedChange={(checked) => onChange({ required: checked })}
        />
        <Label htmlFor={`req-${field.key}`} className="text-sm font-normal">
          Obrigatório
        </Label>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
