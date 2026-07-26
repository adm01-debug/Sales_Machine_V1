import { Trash2 } from "lucide-react";
import {
  NODE_KIND_LABEL,
  branchesForKind,
  type JourneyEdgeInput,
  type JourneyNodeInput,
} from "@/lib/journey-graph";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const CHANNELS = ["email", "whatsapp", "sms", "rcs", "mms", "linkedin", "instagram"] as const;

export interface NodeCardProps {
  node: JourneyNodeInput;
  nodes: JourneyNodeInput[];
  edges: JourneyEdgeInput[];
  issues: string[];
  onChange: (patch: Partial<JourneyNodeInput>) => void;
  onConfig: (patch: Record<string, unknown>) => void;
  onEdge: (branch: string, toNodeId: string) => void;
  onRemove: () => void;
}

/** Editor de uma etapa do fluxo: rótulo, configuração por tipo e saídas. */
export function NodeCard({
  node,
  nodes,
  edges,
  issues,
  onChange,
  onConfig,
  onEdge,
  onRemove,
}: NodeCardProps) {
  const branches = branchesForKind(node.kind, node.config);
  const cfg = node.config as Record<string, unknown>;
  const str = (key: string) => (typeof cfg[key] === "string" ? (cfg[key] as string) : "");
  const num = (key: string) => (typeof cfg[key] === "number" ? String(cfg[key]) : "");

  return (
    <Card className={issues.length > 0 ? "border-destructive/60" : undefined}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <Badge variant="secondary">{NODE_KIND_LABEL[node.kind]}</Badge>
          <CardTitle className="text-base">{node.label || NODE_KIND_LABEL[node.kind]}</CardTitle>
        </div>
        {node.kind === "trigger" ? null : (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remover etapa ${node.label || node.kind}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`label-${node.id}`}>Nome da etapa</Label>
          <Input
            id={`label-${node.id}`}
            value={node.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </div>

        {node.kind === "send" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`channel-${node.id}`}>Canal</Label>
              <select
                id={`channel-${node.id}`}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={str("channel") || "email"}
                onChange={(e) => onConfig({ channel: e.target.value })}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`subject-${node.id}`}>Assunto (e-mail)</Label>
              <Input
                id={`subject-${node.id}`}
                value={str("subject")}
                onChange={(e) => onConfig({ subject: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor={`body-${node.id}`}>Mensagem</Label>
              <Textarea
                id={`body-${node.id}`}
                rows={4}
                placeholder="Olá {{nome|tudo bem}}, ..."
                value={str("body")}
                onChange={(e) => onConfig({ body: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Use variáveis no formato {"{{nome|padrão}}"} ou informe um modelo da biblioteca.
              </p>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor={`tpl-${node.id}`}>ID do modelo (opcional)</Label>
              <Input
                id={`tpl-${node.id}`}
                value={str("template_id")}
                onChange={(e) => onConfig({ template_id: e.target.value })}
              />
            </div>
          </div>
        ) : null}

        {node.kind === "wait" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {(["delay_days", "delay_hours", "delay_minutes"] as const).map((key) => (
              <div className="space-y-1.5" key={key}>
                <Label htmlFor={`${key}-${node.id}`}>
                  {key === "delay_days" ? "Dias" : key === "delay_hours" ? "Horas" : "Minutos"}
                </Label>
                <Input
                  id={`${key}-${node.id}`}
                  type="number"
                  min={0}
                  value={num(key)}
                  onChange={(e) => onConfig({ [key]: Number(e.target.value) || 0 })}
                />
              </div>
            ))}
          </div>
        ) : null}

        {node.kind === "trigger" || node.kind === "condition" || node.kind === "split" ? (
          <JsonField node={node} onConfig={onConfig} />
        ) : null}

        {branches.length > 0 ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Próxima etapa</p>
            {branches.map((branch) => {
              const edge = edges.find((e) => e.from_node_id === node.id && e.branch === branch);
              return (
                <div className="flex items-center gap-2" key={branch}>
                  <Label className="w-20 shrink-0 text-xs" htmlFor={`edge-${node.id}-${branch}`}>
                    {branch}
                  </Label>
                  <select
                    id={`edge-${node.id}-${branch}`}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={edge?.to_node_id ?? ""}
                    onChange={(e) => onEdge(branch, e.target.value)}
                  >
                    <option value="">— nenhuma —</option>
                    {nodes
                      .filter((n) => n.id !== node.id && n.kind !== "trigger")
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label || NODE_KIND_LABEL[n.kind]}
                        </option>
                      ))}
                  </select>
                </div>
              );
            })}
          </div>
        ) : null}

        {issues.length > 0 ? (
          <ul className="space-y-1 text-xs text-destructive">
            {issues.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Campo avançado em JSON para condições, gatilho e pesos do teste A/B. */
function JsonField({
  node,
  onConfig,
}: {
  node: JourneyNodeInput;
  onConfig: (patch: Record<string, unknown>) => void;
}) {
  const key = node.kind === "split" ? "branches" : "conditions";
  const value = JSON.stringify((node.config as Record<string, unknown>)[key] ?? [], null, 2);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`json-${node.id}`}>
        {node.kind === "split" ? "Ramos e pesos" : "Condições"} (JSON)
      </Label>
      <Textarea
        id={`json-${node.id}`}
        rows={5}
        className="font-mono text-xs"
        defaultValue={value}
        onBlur={(e) => {
          try {
            onConfig({ [key]: JSON.parse(e.target.value || "[]") });
          } catch {
            // JSON inválido é ignorado: mantém a última configuração válida.
          }
        }}
      />
      <p className="text-xs text-muted-foreground">
        {node.kind === "split"
          ? 'Ex.: [{"branch":"A","weight":50},{"branch":"B","weight":50}]'
          : 'Ex.: [{"field":"signal_score","op":"gte","value":10}]'}
      </p>
    </div>
  );
}