import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getManualInterventions } from "@/lib/ops.functions";

/**
 * Trilha de auditoria das ações humanas sobre o pipeline.
 *
 * Só exibe eventos cujo autor é `operator:<uid>` — transições automáticas do
 * worker ficam de fora de propósito: aqui o objetivo é responder "quem mexeu
 * na fila, quando e em qual alvo", que é a pergunta de governança.
 */
export function ManualInterventions() {
  const fetchEvents = useServerFn(getManualInterventions);
  const query = useQuery({
    queryKey: ["ops", "interventions"],
    queryFn: () => fetchEvents(),
    refetchInterval: 120_000,
  });

  const events = query.data ?? [];

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Intervenções manuais (auditoria)
      </h2>
      {query.isLoading ? (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Carregando trilha de auditoria...
        </div>
      ) : query.isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Falha ao carregar auditoria: {(query.error as Error).message}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Nenhuma intervenção manual registrada — o pipeline vem rodando sozinho.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {events.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 p-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  <span className="font-medium">{e.from_state ?? "—"}</span>
                  {" → "}
                  <span className="font-medium">{e.to_state}</span>
                  {e.reason ? <span className="text-muted-foreground"> · {e.reason}</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Alvo {String(e.target_id).slice(0, 8)} · {e.actor}
                </p>
              </div>
              <time className="shrink-0 text-xs text-muted-foreground">
                {new Date(e.created_at).toLocaleString("pt-BR")}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
