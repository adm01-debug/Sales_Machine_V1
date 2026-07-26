import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getManualInterventions, exportManualInterventions } from "@/lib/ops.functions";
import { toCsv, csvFilename, downloadCsv, type CsvColumn } from "@/lib/csv-export";
import { cn } from "@/lib/utils";

/** Recortes temporais oferecidos; `null` = todo o histórico retido (90 dias). */
const PERIODS: Array<{ label: string; days: number | null }> = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "Tudo", days: null },
];

type InterventionRow = {
  id: string | number;
  target_id: string | number;
  from_state: string | null;
  to_state: string;
  reason: string | null;
  actor: string;
  created_at: string;
};

/**
 * Colunas da exportação. Mantemos o `target_id` inteiro (a UI trunca em 8
 * chars por espaço, mas a auditoria externa precisa do UUID completo) e a data
 * em ISO-8601 UTC, que é comparável entre fusos.
 */
const CSV_COLUMNS: Array<CsvColumn<InterventionRow>> = [
  { key: "created_at", header: "data_utc", value: (r) => new Date(r.created_at).toISOString() },
  { key: "target_id", header: "alvo_id", value: (r) => r.target_id },
  { key: "from_state", header: "estado_origem", value: (r) => r.from_state },
  { key: "to_state", header: "estado_destino", value: (r) => r.to_state },
  { key: "reason", header: "motivo", value: (r) => r.reason },
  { key: "actor", header: "ator", value: (r) => r.actor },
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
  const fetchExport = useServerFn(exportManualInterventions);
  const [days, setDays] = useState<number | null>(7);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [targetInput, setTargetInput] = useState("");
  // Só o valor confirmado entra na queryKey: evita uma requisição por tecla.
  const [targetId, setTargetId] = useState("");

  const query = useQuery({
    queryKey: ["ops", "interventions", days, targetId],
    queryFn: () => fetchEvents({ data: { days, targetId: targetId || null } }),
    refetchInterval: 120_000,
  });

  const events = query.data ?? [];

  /**
   * Exporta o recorte COMPLETO (não apenas as linhas visíveis): a listagem tem
   * teto de 200 registros, então buscamos a trilha paginada no servidor antes
   * de serializar.
   */
  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const result = await fetchExport({ data: { days, targetId: targetId || null } });
      if (result.rows.length === 0) {
        setExportError("Nenhum registro no filtro selecionado.");
        return;
      }
      const scope = days ? `${days}d` : "tudo";
      downloadCsv(
        csvFilename(`auditoria-intervencoes-${scope}`),
        toCsv(result.rows as InterventionRow[], CSV_COLUMNS),
      );
      if (result.truncated) {
        setExportError("Exportação truncada no teto de 5.000 registros — reduza o período.");
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Falha ao exportar.");
    } finally {
      setExporting(false);
    }
  }

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
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            title="Exportar a trilha filtrada em CSV"
            className="rounded-md border px-2 py-1 text-xs text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? "Exportando..." : "Exportar CSV"}
          </button>
        </div>
      </div>
      {exportError ? (
        <p className="mb-2 text-xs text-muted-foreground" role="status">
          {exportError}
        </p>
      ) : null}
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
