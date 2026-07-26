import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { getJourney, saveJourney, setJourneyStatus } from "@/lib/journeys.functions";
import {
  JOURNEY_NODE_KINDS,
  NODE_KIND_LABEL,
  STATUS_LABEL,
  defaultNodeConfig,
  journeySettingsSchema,
  validateGraphInput,
  type JourneyEdgeInput,
  type JourneyNodeInput,
  type JourneySettings,
  type JourneyStatus,
} from "@/lib/journey-graph";
import type { JourneyNodeKind } from "@/lib/journey-engine";
import { JourneySettingsCard } from "@/components/journeys/journey-settings-card";
import { NodeCard } from "@/components/journeys/node-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/journeys/$id")({
  head: () => ({
    meta: [
      { title: "Editor de jornada · Sales Machine" },
      {
        name: "description",
        content:
          "Monte o fluxo automatizado: gatilho, esperas, condições, testes A/B e envios multicanal.",
      },
      { property: "og:title", content: "Editor de jornada · Sales Machine" },
      {
        property: "og:description",
        content: "Construa e valide fluxos de automação multicanal antes de ativar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JourneyEditorPage,
});

let tmpSeq = 0;
const nextTempId = () => `tmp-${Date.now()}-${++tmpSeq}`;

function JourneyEditorPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchJourney = useServerFn(getJourney);
  const persist = useServerFn(saveJourney);
  const setStatus = useServerFn(setJourneyStatus);

  const query = useQuery({
    queryKey: ["mkt", "journey", id],
    queryFn: () => fetchJourney({ data: { id } }),
  });

  const [settings, setSettings] = useState<JourneySettings | null>(null);
  const [nodes, setNodes] = useState<JourneyNodeInput[]>([]);
  const [edges, setEdges] = useState<JourneyEdgeInput[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!query.data) return;
    setSettings(journeySettingsSchema.parse(query.data.journey));
    setNodes(
      query.data.nodes.map((n) => ({
        id: n.id,
        kind: n.kind as JourneyNodeKind,
        label: n.label ?? "",
        position_x: n.position_x ?? 0,
        position_y: n.position_y ?? 0,
        config: (n.config ?? {}) as Record<string, unknown>,
      })),
    );
    setEdges(
      query.data.edges.map((e) => ({
        from_node_id: e.from_node_id,
        to_node_id: e.to_node_id,
        branch: e.branch,
        ordinal: e.ordinal ?? 0,
      })),
    );
    setDirty(false);
  }, [query.data]);

  const issues = useMemo(() => {
    if (!settings) return [];
    return validateGraphInput({ id, settings, nodes, edges });
  }, [id, settings, nodes, edges]);
  const errors = issues.filter((i) => i.level === "error");

  const saveMutation = useMutation({
    mutationFn: () => persist({ data: { id, settings: settings!, nodes, edges } }),
    onSuccess: () => {
      toast.success("Fluxo salvo");
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["mkt", "journey", id] });
      queryClient.invalidateQueries({ queryKey: ["mkt", "journeys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (status: JourneyStatus) => setStatus({ data: { id, status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mkt", "journey", id] });
      queryClient.invalidateQueries({ queryKey: ["mkt", "journeys"] });
      toast.success("Situação atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addNode = (kind: JourneyNodeKind) => {
    setNodes((prev) => [
      ...prev,
      {
        id: nextTempId(),
        kind,
        label: NODE_KIND_LABEL[kind],
        position_x: 0,
        position_y: (prev.length + 1) * 160,
        config: defaultNodeConfig(kind),
      },
    ]);
    setDirty(true);
  };

  const removeNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.from_node_id !== nodeId && e.to_node_id !== nodeId));
    setDirty(true);
  };

  const patchNode = (nodeId: string, patch: Partial<JourneyNodeInput>) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)));
    setDirty(true);
  };

  const patchConfig = (nodeId: string, patch: Record<string, unknown>) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, config: { ...n.config, ...patch } } : n)),
    );
    setDirty(true);
  };

  const setEdge = (nodeId: string, branch: string, toNodeId: string) => {
    setEdges((prev) => {
      const rest = prev.filter((e) => !(e.from_node_id === nodeId && e.branch === branch));
      return toNodeId
        ? [...rest, { from_node_id: nodeId, to_node_id: toNodeId, branch, ordinal: 0 }]
        : rest;
    });
    setDirty(true);
  };

  if (query.isLoading || !settings) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (query.error) {
    return (
      <Card className="mx-auto max-w-4xl">
        <CardContent className="py-6 text-sm text-destructive">
          {(query.error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const status = (query.data?.journey.status ?? "draft") as JourneyStatus;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild aria-label="Voltar para jornadas">
            <Link to="/journeys">
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">{settings.name}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={status === "active" ? "default" : "outline"}>
                {STATUS_LABEL[status]}
              </Badge>
              {dirty ? <span>alterações não salvas</span> : <span>tudo salvo</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            Salvar rascunho
          </Button>
          {status === "active" ? (
            <Button variant="outline" onClick={() => statusMutation.mutate("paused")}>
              Pausar
            </Button>
          ) : (
            <Button
              onClick={() => statusMutation.mutate("active")}
              disabled={errors.length > 0 || dirty || statusMutation.isPending}
              title={
                dirty
                  ? "Salve o fluxo antes de ativar"
                  : errors.length > 0
                    ? "Corrija os erros do fluxo"
                    : undefined
              }
            >
              Ativar
            </Button>
          )}
        </div>
      </div>

      {issues.length > 0 ? (
        <Card className={errors.length > 0 ? "border-destructive/60" : undefined}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {errors.length > 0 ? "Corrija antes de ativar" : "Avisos"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {issues.map((i, idx) => (
                <li
                  key={`${i.level}-${idx}`}
                  className={i.level === "error" ? "text-destructive" : "text-muted-foreground"}
                >
                  {i.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <JourneySettingsCard
        settings={settings}
        onChange={(patch) => {
          setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
          setDirty(true);
        }}
      />

      <div className="space-y-3">
        {nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            nodes={nodes}
            edges={edges}
            issues={issues.filter((i) => i.nodeId === node.id).map((i) => i.message)}
            onChange={(patch) => patchNode(node.id, patch)}
            onConfig={(patch) => patchConfig(node.id, patch)}
            onEdge={(branch, to) => setEdge(node.id, branch, to)}
            onRemove={() => removeNode(node.id)}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Adicionar etapa</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {JOURNEY_NODE_KINDS.filter((k) => k !== "trigger").map((kind) => (
            <Button key={kind} variant="outline" size="sm" onClick={() => addNode(kind)}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
              {NODE_KIND_LABEL[kind]}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Inscrições recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {(query.data?.enrollments ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum contato inscrito ainda.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(query.data?.enrollments ?? []).slice(0, 10).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-muted-foreground">{e.entity_id}</span>
                  <Badge variant="outline">{e.state}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}