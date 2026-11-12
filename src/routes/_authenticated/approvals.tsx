import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPendingApprovals, decideApproval } from "@/lib/orchestrator.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "Aprovações · Sales Machine" },
      { name: "description", content: "Revise mensagens de agentes antes do envio." },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const qc = useQueryClient();
  const fetchPending = useServerFn(listPendingApprovals);
  const decide = useServerFn(decideApproval);
  const pending = useQuery({ queryKey: ["sm", "approvals"], queryFn: () => fetchPending() });
  const [edits, setEdits] = useState<Record<string, string>>({});

  const mut = useMutation({
    mutationFn: (v: {
      touchpoint_id: string;
      decision: "approve" | "reject";
      edited_message?: string;
    }) => decide({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.decision === "approve" ? "Aprovado e enviado" : "Rejeitado");
      qc.invalidateQueries({ queryKey: ["sm", "approvals"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <header>
          <h1 className="text-2xl font-bold">Aprovações pendentes</h1>
          <p className="text-sm text-muted-foreground">
            Human-in-the-loop: revise, edite e aprove antes do disparo real.
          </p>
        </header>

        {pending.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {pending.data && pending.data.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma mensagem aguardando aprovação.</p>
        )}

        <div className="space-y-3">
          {(pending.data ?? []).map((tp) => {
            const payload = (tp.payload ?? {}) as { message?: string };
            const value = edits[tp.id] ?? payload.message ?? "";
            return (
              <Card key={tp.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">Touchpoint {tp.id.slice(0, 8)}</CardTitle>
                    <CardDescription>
                      {new Date(tp.created_at).toLocaleString("pt-BR")}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">{tp.channel}</Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    value={value}
                    onChange={(e) => setEdits((s) => ({ ...s, [tp.id]: e.target.value }))}
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        mut.mutate({
                          touchpoint_id: tp.id,
                          decision: "approve",
                          edited_message: value,
                        })
                      }
                    >
                      Aprovar e enviar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => mut.mutate({ touchpoint_id: tp.id, decision: "reject" })}
                    >
                      Rejeitar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
