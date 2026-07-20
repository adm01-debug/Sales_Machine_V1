import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listEvalCases, createEvalCase, runEvalCase } from "@/lib/orchestrator.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/evals")({
  head: () => ({
    meta: [
      { title: "Evals · Sales Machine" },
      { name: "description", content: "Harness de testes para agentes FATOR X." },
    ],
  }),
  component: EvalsPage,
});

function EvalsPage() {
  const qc = useQueryClient();
  const fetchCases = useServerFn(listEvalCases);
  const createCase = useServerFn(createEvalCase);
  const runCase = useServerFn(runEvalCase);
  const cases = useQuery({ queryKey: ["sm", "evals"], queryFn: () => fetchCases() });

  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const [channel, setChannel] = useState<"whatsapp" | "email" | "sms" | "linkedin" | "instagram">("whatsapp");

  const createMut = useMutation({
    mutationFn: () =>
      createCase({
        data: { name, expected_intent: intent, expected_channel: channel, signal_json: {} },
      }),
    onSuccess: () => {
      toast.success("Caso criado");
      setName("");
      setIntent("");
      qc.invalidateQueries({ queryKey: ["sm", "evals"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const runMut = useMutation({
    mutationFn: (case_id: string) => runCase({ data: { case_id } }),
    onSuccess: (r) =>
      toast[r.passed ? "success" : "error"](
        r.passed ? `PASS (${r.output.slice(0, 60)}…)` : `FAIL: ${r.error ?? "critério não atendido"}`,
      ),
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Eval Harness</h1>
          <p className="text-sm text-muted-foreground">Casos de teste para regressão dos agentes.</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo caso</CardTitle>
            <CardDescription>Descreva o intent esperado que o agente deve responder.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Nome do caso" value={name} onChange={(e) => setName(e.target.value)} />
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as typeof channel)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {(["whatsapp", "email", "sms", "linkedin", "instagram"] as const).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <Textarea
              placeholder="Intent esperado (ex: 'agendar reunião', 'enviar catálogo')"
              rows={3}
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            />
            <Button disabled={!name || !intent || createMut.isPending} onClick={() => createMut.mutate()}>
              Criar caso
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {(cases.data ?? []).map((c) => (
            <Card key={c.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <CardDescription>Intent: {c.expected_intent}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {c.expected_channel && <Badge variant="outline">{c.expected_channel}</Badge>}
                  <Button size="sm" onClick={() => runMut.mutate(c.id)} disabled={runMut.isPending}>
                    Rodar
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}