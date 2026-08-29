# Modelagem de Dados — Sales_Machine_V1

> **Fontes canônicas (nesta ordem):** 1) `supabase/migrations/*.sql` (45, verdade absoluta) · 2) `.contexto-compartilhado/dump-arquitetura.json` (snapshot gerado) · 3) `.contexto-compartilhado/dicionario-dados.md` (semântica + tags PII).
> ⚠️ `docs/SCHEMA_REFERENCE.md` é histórico e parcialmente aspiracional — não usar como fonte.

## Convenções

- snake_case; PK `id uuid DEFAULT gen_random_uuid()`; timestamps `timestamptz` em UTC (`created_at`/`updated_at` com trigger `tg_touch_updated_at`).
- Enums `sm_*` para domínios fechados (14 — ver dicionário). Valores novos = migration nova com `ALTER TYPE ... ADD VALUE`.
- Multi-tenant por usuário via RLS (`has_role`); tabelas novas **nascem com RLS**.
- Append-only: `sales_machine_events`, `campaign_target_events` (cleanup >1 ano apenas).
- Anti-replay: `UNIQUE(source, external_id)` em `sales_machine_events`.
- Locks de fila: `locked_until` (timestamptz), nunca flags booleanas.

## Núcleo (ERD textual)

```
auth.users 1───n user_roles

entity_map (company|contact) ◀── chave canônica (lux_id, singu_id, fatorx_thread_id, fuxico_id)
   │1
   │n
   ├── campaign_targets n──1 campaigns_orchestration n──1 cadence_rules
   │        │1
   │        │n campaign_target_events (audit append-only)
   │
   ├── contact_touchpoints (1:1, retry/backoff, email_message_id p/ threading)
   ├── consent_ledger (opt-in/out por canal + evidência)
   ├── sales_machine_events (inbox de webhooks, anti-replay)
   ├── signal_weights ─▶ signal_score(entity_id) [função]
   └── contact_churn_scores

journeys 1──n journey_nodes ──n journey_edges
   │1
   │n journey_enrollments 1──n journey_enrollment_events

audiences 1──n audience_members
lead_forms 1──n lead_form_submissions (double opt-in, PII)
marketing_campaigns 1──n campaign_sends · campaign_variants · message_templates ─▶ template_preflight_history

channel_budgets ─▶ budget_reallocations · channel_roi_stats · channel_quotas · ops_alert_notifications
sender_health · email_deliverability_events · agent_eval_cases ─▶ agent_eval_runs
compliance_terms ─▶ compliance_violations_log
```

## Máquina de estados de `campaign_targets.state`

```
queued ──▶ running ──▶ replied ──▶ completed (TERMINAL)
  │          │▶ paused  │▶ stopped  │▶ lost  │▶ dead_letter
```
Transições fora do permitido são **rejeitadas por trigger** — aplicação nunca faz UPDATE direto em `state`.

## Integridade referencial notável

- `sales_machine_events.entity_id` → `entity_map` ON DELETE SET NULL (histórico sobrevive à entidade).
- `user_roles.user_id` → `auth.users` ON DELETE CASCADE.
- Deletes de dados pessoais: **somente** via função LGPD dedicada (admin), que sabe apagar sem violar auditoria.

## Regenerar o snapshot

```bash
python3 scripts/gerar-dump-arquitetura.py   # após qualquer migration nova (Lei 12)
```
