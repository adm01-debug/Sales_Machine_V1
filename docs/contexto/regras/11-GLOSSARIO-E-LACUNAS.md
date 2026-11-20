# 11 · GLOSSÁRIO, DADOS DE REFERÊNCIA E LACUNAS

> Gerado automaticamente por AI Context Sync v1.3.2 · commit `c87ee589ce` · branch `main` · 2026-11-20 00:02 UTC
> Não edite à mão — regras humanas vão em `manual/`.

## Glossário do domínio (entidades do sistema)

| Termo | Significado / valores | Tamanho | Origem |
|---|---|---|---|
| `agent_eval_cases` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `agent_eval_runs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `audience_members` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `audiences` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `budget_reallocations` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `cadence_rules` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `campaign_sends` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `campaign_target_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `campaign_targets` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `campaign_variants` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `campaigns_orchestration` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `channel_budgets` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `channel_quotas` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `channel_roi_stats` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `compliance_terms` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `compliance_violations_log` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `consent_ledger` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `contact_churn_scores` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `contact_touchpoints` | _(sem COMMENT ON TABLE — significado não documentado)_ | 19 colunas | migration |
| `email_deliverability_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `entity_map` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `journey_edges` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `journey_enrollment_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `journey_enrollments` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `journey_nodes` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `journeys` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `lead_form_submissions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 16 colunas | migration |
| `lead_forms` | _(sem COMMENT ON TABLE — significado não documentado)_ | 19 colunas | migration |
| `marketing_campaigns` | _(sem COMMENT ON TABLE — significado não documentado)_ | 17 colunas | migration |
| `message_templates` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `ops_alert_notifications` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `sales_machine_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `sender_health` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `signal_weights` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | migration |
| `template_preflight_history` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `user_roles` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | migration |
| `v_contact_profiles` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `v_pipeline_health` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `app_role` (enum) | admin, operator, viewer |  | banco |
| `sm_source` (enum) | lux, singu, fatorx, manual, fuxico |  | banco |
| `sm_channel` (enum) | linkedin, whatsapp, email, sms, instagram, rcs, mms |  | banco |
| `sm_event_status` (enum) | received, processing, processed, error, ignored |  | banco |
| `sm_direction` (enum) | outbound, inbound |  | banco |
| `sm_campaign_status` (enum) | draft, active, paused, archived |  | banco |
| `sm_touchpoint_status` (enum) | queued, sent, delivered, read, replied, failed, opted_out, dead_letter, pending_approval |  | banco |
| `sm_target_state` (enum) | queued, running, paused, replied, stopped, lost, completed, dead_letter |  | banco |
| `sm_cadence_preset` (enum) | aggressive, standard, enterprise, custom |  | banco |
| `sm_journey_status` (enum) | draft, active, paused, archived |  | banco |
| `sm_journey_node_kind` (enum) | trigger, send, wait, condition, split, goal, exit |  | banco |
| `sm_enrollment_state` (enum) | active, waiting, completed, exited, goal_reached, failed |  | banco |
| `sm_compliance_niche` (enum) | geral, saude, financeiro, juridico, apostas, suplementos, custom |  | banco |
| `sm_compliance_severity` (enum) | error, warning, info |  | banco |
| `MetricAccent` (TS) | cyan \| purple \| lime \| pink \| amber |  | `src/components/metric-card.tsx` |
| `ExternalSystem` (TS) | lux \| singu \| fatorx \| fuxico |  | `src/integrations/external/config.server.ts` |
| `SinguChannel` (TS) | whatsapp \| email \| sms |  | `src/integrations/external/singu.server.ts` |
| `SocialChannel` (TS) | linkedin \| instagram |  | `src/integrations/social/types.ts` |
| `CHANNELS` (TS) | "whatsapp", "email", "sms", "rcs", "mms", "linkedin", "instagram", |  | `src/lib/audience-rules.ts` |
| `BudgetStatus` (TS) | ok \| warning \| exhausted \| disabled |  | `src/lib/budget-guard.ts` |
| `ScheduleDecisionCode` (TS) | apply \| no_plan \| cooldown \| below_min_moved \| exceeds_max_share |  | `src/lib/budget-reallocation-schedule.ts` |
| `SOCIAL_CHANNELS` (TS) | "linkedin", "instagram" |  | `src/lib/cadence-engine.ts` |
| `PreflightVerdict` (TS) | ok \| warning \| blocked |  | `src/lib/campaign-cost.ts` |
| `ComplianceSeverity` (TS) | error \| warning \| info |  | `src/lib/compliance-terms.ts` |
| `ComplianceNiche` (TS) | geral \| saude \| financeiro \| juridico \| apostas \| suplementos |  | `src/lib/compliance-terms.ts` |
| `CostChannel` (TS) | whatsapp \| sms \| mms \| rcs \| email \| linkedin \| instagram |  | `src/lib/cost-model.ts` |
| `Align` (TS) | left \| center \| right |  | `src/lib/email-blocks.ts` |
| `PreflightSeverity` (TS) | error \| warning \| info |  | `src/lib/email-preflight.ts` |
| `JourneyNodeKind` (TS) | trigger \| send \| wait \| condition \| split \| goal \| exit |  | `src/lib/journey-engine.ts` |
| `ConditionOp` (TS) | eq \| neq \| contains \| not_contains \| gt \| gte \| lt \| lte \| exists \| not_exists \| in |  | `src/lib/journey-engine.ts` |
| `JOURNEY_NODE_KINDS` (TS) | "trigger", "send", "wait", "condition", "split", "goal", "exit", |  | `src/lib/journey-graph.ts` |
| `JOURNEY_STATUSES` (TS) | "draft", "active", "paused", "archived" |  | `src/lib/journey-graph.ts` |
| `EnrollmentBlockCode` (TS) | ok \| journey_inactive \| already_enrolled \| reentry_blocked \| cooldown \| entry_cap \| no_consent |  | `src/lib/journey-triggers.ts` |
| `TRIGGER_SOURCES` (TS) | "lux", "singu", "fatorx", "fuxico", "promo", "manual" |  | `src/lib/journey-triggers.ts` |
| `LEAD_FIELD_TYPES` (TS) | "text", "email", "phone", "textarea", "select", "checkbox", |  | `src/lib/lead-forms.ts` |
| `LEAD_FORM_STATUSES` (TS) | "draft", "published", "archived" |  | `src/lib/lead-forms.ts` |
| `MessageSeverity` (TS) | error \| warning \| info |  | `src/lib/message-preflight.ts` |
| `AlertLevel` (TS) | critical \| warning |  | `src/lib/ops-alerts.ts` |
| `AUDIT_PERIODS` (TS) | 1, 7, 30, 90 |  | `src/lib/ops-audit.server.ts` |
| `Sentiment` (TS) | positive \| neutral \| negative |  | `src/lib/sentiment.ts` |
| `ReplyPriority` (TS) | hot \| warm \| cold \| blocked \| unknown |  | `src/lib/sentiment.ts` |

## Dados de referência (seed — planos, categorias, perfis fixos)

_nenhum item encontrado_

## Auditoria de consistência (código × schema) — trate como NÃO VERIFICADO

> `status`: inclui estados só de UI/realtime (ex.: `uploading`, `SUBSCRIBED`) que nunca vão ao banco — confira o arquivo antes de concluir que falta valor no enum.

| Tipo | Problema | Onde |
|---|---|---|
| status | valor `pending_provider` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/integrations/social/types.ts`<br>`escreve:src/routes/api/public/agent-tools/send-message.ts` |
| status | valor `bounced` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/lib/ops.functions.ts` |
| status | valor `complaint` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/lib/ops.functions.ts` |
| status | valor `opted_in` para `status` usado no código não existe em nenhum enum do banco/TS | `filtra:src/lib/ops.functions.ts` |
| status | valor `fulfilled` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/lib/orchestrator.functions.ts` |
| status | valor `expanded` para `state` usado no código não existe em nenhum enum do banco/TS | `escreve:src/components/ui/sidebar.tsx` |
| status | valor `collapsed` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/ui/sidebar.tsx` |
| status | valor `Fila` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/lib/analytics-aggregate.ts` |
| status | valor `Enviadas` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/lib/analytics-aggregate.ts` |
| status | valor `Entregues` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/lib/analytics-aggregate.ts` |
| status | valor `Respondidas` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/lib/analytics-aggregate.ts` |
| status | valor `Materializados` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/lib/analytics-aggregate.ts` |
| status | valor `Enviados` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/lib/analytics-aggregate.ts` |
| status | valor `Respondidos` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/lib/analytics-aggregate.ts` |
| status | valor `Falhas` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/lib/analytics-aggregate.ts` |
| status | valor `Entregue` para `stage` usado no código não existe em nenhum enum do banco/TS | `compara:src/lib/campaign-diagnostics.ts` |
| status | valor `Enviado` para `stage` usado no código não existe em nenhum enum do banco/TS | `compara:src/lib/campaign-diagnostics.ts` |
| status | valor `config` para `step` usado no código não existe em nenhum enum do banco/TS | `escreve:src/lib/deliverability.functions.ts` |
| status | valor `webhook` para `step` usado no código não existe em nenhum enum do banco/TS | `escreve:src/lib/deliverability.functions.ts` |
| status | valor `verify` para `step` usado no código não existe em nenhum enum do banco/TS | `escreve:src/lib/deliverability.functions.ts` |
| tabela | tabela `a` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `contacts` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `contatos` usada no código não existe nas migrations/types do repo | `scripts/ci/inventario-banco.unit.mjs` |
| tabela | tabela `dashboard_table` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `emails` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `fantasma` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `fixture_table` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `ghost_table` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `outra` usada no código não existe nas migrations/types do repo | `scripts/ci/inventario-banco.unit.mjs` |
| tabela | tabela `payments` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `runtime_table` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `so_teste` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `t` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `t1` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `tabela` usada no código não existe nas migrations/types do repo | `scripts/inventario/gerar-banco.mjs`<br>`scripts/inventario/gerar-repo.mjs` |
| tabela | tabela `tools_runtime` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `tx` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| rls | `sales_machine_events`: front faz INSERT mas nenhuma política RLS permite INSERT → vai falhar/retornar vazio para usuários | `src/lib/lead-forms-delivery.server.ts`<br>`src/lib/orchestrator.functions.ts` |
| rls | `v_contact_profiles`: acessada do front (2 arquivo(s)) sem RLS (não encontrado) | `src/lib/audience-resolver.server.ts`<br>`src/lib/profile360.functions.ts` |
| edge | edge function `dashboard-edge` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `fixture-edge` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `ghost-edge` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `inexistente` invocada mas não existe em supabase/functions/ | `scripts/ai-context/cenarios.mjs` |
| edge | edge function `orphan-fn` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `other` invocada mas não existe em supabase/functions/ | `scripts/ai-context/cenarios.mjs` |
| edge | edge function `runtime-fn` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `runtime-missing` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `send-email` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `tools-edge` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `dashboard_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `demo` chamada mas não definida nas migrations/types | `scripts/supabase_snapshot/test_snapshot.py` |
| rpc | RPC `fixture_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `fn` chamada mas não definida nas migrations/types | `scripts/supabase_snapshot/snapshot.py` |
| rpc | RPC `ghost_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `is_admin` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `nome` chamada mas não definida nas migrations/types | `scripts/supabase_snapshot/snapshot.py` |
| rpc | RPC `r1` chamada mas não definida nas migrations/types | `scripts/ai-context/cenarios.mjs` |
| rpc | RPC `runtime_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `tools_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `scripts/inventario/gerar-banco.mjs` |
| dinâmico | 2 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `scripts/regras_negocio/generate.py` |
| segurança | função `fn_refresh_roi_stats` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/migrations/20260802124518_be42ee28-381a-41c1-8b90-19d41d7bba5e.sql` |
| segurança | função `fn_calculate_churn_risk` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/migrations/20260802125202_8d7bc5b1-c4b2-4f75-9151-ddf9ed5d31b0.sql` |

## Lacunas — o que este contexto NÃO consegue responder (perguntas para o dono do negócio)

- Nenhuma regra manual em `manual/`: prazos, limites, exceções comerciais, quem aprova o quê — só o negócio sabe.
- `sales_machine_events.status` tem valores ['received', 'processing', 'processed', 'error', 'ignored'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `campaigns_orchestration.status` tem valores ['draft', 'active', 'paused', 'archived'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `contact_touchpoints.status` tem valores ['queued', 'sent', 'delivered', 'read', 'replied', 'failed', 'opted_out', 'dead_letter', 'pending_approval'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `campaign_targets.current_step` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `campaign_targets.status` tem valores ['completed', 'done', 'failed', 'paused', 'queued', 'running'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `campaign_targets.state` tem valores ['queued', 'running', 'paused', 'replied', 'stopped', 'lost', 'completed', 'dead_letter'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `campaign_target_events.from_state` tem valores ['queued', 'running', 'paused', 'replied', 'stopped', 'lost', 'completed', 'dead_letter'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `campaign_target_events.to_state` tem valores ['queued', 'running', 'paused', 'replied', 'stopped', 'lost', 'completed', 'dead_letter'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `consent_ledger.status` tem valores ['opt_in', 'opt_out'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `marketing_campaigns.status` tem valores ['cancelled', 'completed', 'draft', 'paused', 'running', 'scheduled'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `campaign_sends.state` tem valores ['dead_letter', 'failed', 'opted_out', 'pending_approval', 'queued', 'sending', 'sent', 'skipped'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `journeys.status` tem valores ['draft', 'active', 'paused', 'archived'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `journey_enrollments.state` tem valores ['active', 'waiting', 'completed', 'exited', 'goal_reached', 'failed'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `lead_forms.status` tem valores ['archived', 'draft', 'published'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `lead_form_submissions.status` tem valores ['confirmed', 'discarded', 'pending'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- 38/38 tabelas sem `COMMENT ON TABLE` — o significado de negócio não está no schema: `user_roles`, `sales_machine_events`, `entity_map`, `cadence_rules`, `campaigns_orchestration`, `channel_quotas`, `contact_touchpoints`, `campaign_targets`, `campaign_target_events`, `sender_health`, `signal_weights`, `agent_eval_cases` …
- Há tabelas usadas no código sem migration no repo — o schema real pode ter sido alterado pelo painel.

## Regras manuais presentes

_nenhuma — copie `manual/TEMPLATE-regras-de-negocio.md`_
