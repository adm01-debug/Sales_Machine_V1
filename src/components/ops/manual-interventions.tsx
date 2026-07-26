import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getManualInterventions } from "@/lib/ops.functions";
import { cn } from "@/lib/utils";

/** Recortes temporais oferecidos; `null` = todo o histórico retido (90 dias). */
const PERIODS: Array<{ label: string; days: number | null }> = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "Tudo", days: null },
];

/**
 * Trilha de auditoria das ações humanas sobre o pipeline.
 *
 * Só exibe eventos cujo autor é `operator:<uid>` — transições automáticas do
 * worker ficam de fora de propósito: aqui o objetivo é responder "quem mexeu
 * na fila, quando e em qual alvo", que é a pergunta de governança.
 */
export function ManualInterventions() {
  const fetchEvents = useServerFn(getManualInterventions);
  const [days, setDays] = useState<number | null>(7);
  const [targetInput, setTargetInput] = useState("");
  // Só o valor confirmado entra na queryKey: evita uma requisição por tecla.
  const [targetId, setTargetId] = useState("");

  const query = useQuery({
    queryKey: ["ops", "interventions", days, targetId],
    queryFn: () => fetchEvents({ data: { days, targetId: targetId || null } }),
    refetchInterval: 120_000,
  });

  const events = query.data ?? [];

  return (
    <section>
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Intervenções manuais (auditoria)
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border bg-card p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setDays(p.days)}
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors",
                  p.days === days
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setTargetId(targetInput.trim());
            }}
            className="flex items-center gap-2"
          >
            <label htmlFor="audit-target" className="sr-only">
              Filtrar por ID do alvo
            </label>
            <input
              id="audit-target"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="ID do alvo (prefixo)"
              className="w-44 rounded-md border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              className="rounded-md border px-2 py-1 text-xs text-foreground hover:bg-accent"
            >
              Filtrar
            </button>
            {targetId ? (
              <button
                type="button"
                onClick={() => {
                  setTargetInput("");
                  setTargetId("");
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Limpar
              </button>
            ) : null}
          </form>
        </div>
      </div>
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
          {targetId || days
            ? "Nenhuma intervenção manual no filtro selecionado."
            : "Nenhuma intervenção manual registrada — o pipeline vem rodando sozinho."}
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
