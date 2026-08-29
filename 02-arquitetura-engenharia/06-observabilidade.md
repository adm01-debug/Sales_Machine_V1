# Observabilidade — Sales_Machine_V1

> Fonte: código real (`ops-*`, `error-capture.ts`, `alert-dispatch.ts`, migrations).

## O que existe hoje

| Sinal | Mecanismo |
|---|---|
| **Alertas operacionais** | Regras avaliadas pelo `alert-sweep` (15min) → `ops_alert_notifications` + dispatch para webhook externo quando configurado; cooldown anti-spam de alerta; auto-resolve quando o estado sai do ativo |
| **Auditoria de funil** | `campaign_target_events` (transições de estado) e `sales_machine_events` (ingestão) — append-only |
| **Saúde de sender** | `sender_health` diário + `email_deliverability_events`; view de saúde do pipeline (`refresh_pipeline_health`) |
| **Erros** | captura centralizada `error-capture.ts` + integração `lovable-error-reporting.ts`; `console.error` namespaced por módulo (`[tick-cadence]`, `[webhook lux]`...) |
| **Telas de ops** | `/ops` (central), `/deliverability`, `/dashboard`, `/evals` |
| **ROI/budget** | `channel_roi_stats` (refresh periódico), `campaign-diagnostics.ts` |

## Queries operacionais úteis (via MCP/SQL)

```sql
-- targets travados (lock expirado sem liberação)
SELECT id, state, locked_until FROM campaign_targets
WHERE state='running' AND locked_until < now();

-- opt-outs recentes
SELECT entity_id, channel, reason, created_at
FROM consent_ledger WHERE status='opted_out' ORDER BY created_at DESC LIMIT 20;

-- saúde de senders hoje
SELECT * FROM sender_health WHERE day = current_date ORDER BY bounced DESC;
```

## Lacunas conhecidas `[CONFIRMAR prioridade]`

- Sem APM/tracing distribuído (requests do funil não têm trace_id ponta a ponta).
- Métricas de negócio dependem de queries manuais — candidato a views materializadas.
- `agent_eval_runs` não alimenta CI ainda (sem `.github/workflows`).
