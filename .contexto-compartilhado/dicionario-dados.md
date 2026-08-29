# Dicionário de Dados — Sales_Machine_V1

> Fonte: `supabase/migrations/*.sql` (45 aplicadas) via `dump-arquitetura.json` + `docs/SCHEMA_REFERENCE.md` (semântica de negócio).
> ⚠️ O SCHEMA_REFERENCE está parcialmente desatualizado (cita enums/tabelas aspiracionais que não existem — ver `pendencias-conhecidas.md`). Este dicionário reflete o **real**.
> Tag `[PII]` = dado pessoal (LGPD). Toda tabela tem RLS habilitado.

## Enums (14 reais)

| Enum | Valores | Uso |
|---|---|---|
| `app_role` | `admin`, `operator`, `viewer` | RBAC via `user_roles` + `has_role()` |
| `sm_source` | `lux`, `singu`, `fatorx`, `manual` | Origem de eventos/entidades |
| `sm_channel` | `linkedin`, `whatsapp`, `email`, `sms`, `instagram` | Canal de contato |
| `sm_event_status` | `received`, `processing`, `processed`, `error`, `ignored` | Pipeline de ingestão |
| `sm_direction` | `outbound`, `inbound` | Direção do touchpoint |
| `sm_campaign_status` | `draft`, `active`, `paused`, `archived` | Ciclo de vida de campanha |
| `sm_touchpoint_status` | `queued`, `sent`, `delivered`, `read`, `replied`, `failed`, `opted_out`, `dead_letter`, `pending_approval`, `pending_provider` | Estado de um envio 1:1 |
| `sm_target_state` | `queued`, `running`, `paused`, `replied`, `stopped`, `lost`, `completed`, `dead_letter` | **Máquina de estados** do target (transições via trigger — nunca UPDATE direto) |
| `sm_cadence_preset` | `aggressive`, `standard`, `enterprise`, `custom` | Presets de cadência |
| `sm_journey_status` | `draft`, `active`, `paused`, `archived` | Journeys (marketing) |
| `sm_journey_node_kind` | `trigger`, `send`, `wait`, `condition`, `split`, `goal`, `exit` | Tipos de nó do grafo de journey |
| `sm_enrollment_state` | `active`, `waiting`, `completed`, `exited`, `goal_reached`, `failed` | Estado de enrollment em journey |
| `sm_compliance_niche` | `geral`, `saude`, `financeiro`, `juridico`, `apostas`, `suplementos`, `custom` | Nicho regulado (termos proibidos) |
| `sm_compliance_severity` | `error`, `warning`, `info` | Severidade de termo/violação |

## Tabelas por domínio (36)

### Identidade & RBAC
- **`user_roles`** — `user_id` FK→auth.users, `role` app_role. Primeiro usuário vira `admin`, demais `operator` (via `handle_new_user`).

### Ingestão & identidade de entidades
- **`sales_machine_events`** — append-only. Webhooks + audit de eventos. `UNIQUE(source, external_id)` anti-replay → sempre `ON CONFLICT DO NOTHING`. `payload` jsonb `[PII potencial]`.
- **`entity_map`** `[PII]` — chave canônica unindo LUX ↔ SINGU ↔ FATOR X ↔ FUXICO. `kind` (`company`/`contact`), `display_name` `[PII]`, `lux_id`, `singu_id`, `fatorx_thread_id`, `fuxico_id`, `metadata` jsonb. **Upsert só via `ON CONFLICT (kind, lux_id) DO UPDATE`.**

### Orquestração de cadência (outbound 1:1)
- **`campaigns_orchestration`** — campanha: `cadence_preset`, `requires_human_approval` (approval gate).
- **`campaign_targets`** — alvo em campanha. `state` (sm_target_state, máquina de estados), `current_step`, `next_run_at`, `locked_until` (lock de worker — sempre setar ao pegar, limpar ao terminar). `UNIQUE(campaign_id, entity_id)`.
- **`campaign_target_events`** — append-only audit de transições. Nunca deletar (exceto cleanup >1 ano).
- **`cadence_rules`** — templates de cadência multicanal com presets.
- **`contact_touchpoints`** `[PII]` — envios 1:1. `channel`, `direction`, `status`, `attempts`+`next_retry_at` (backoff), `email_message_id` (threading), `fatorx_thread_id`, `payload` `[PII]`.

### Marketing broadcast (1:many)
- **`marketing_campaigns`**, **`campaign_sends`**, **`campaign_variants`** (A/B), **`audiences`** + **`audience_members`**, **`message_templates`** (`validate_template_vars()`), **`template_preflight_history`**.
- **`lead_forms`** / **`lead_form_submissions`** `[PII]` — captura pública: `email`, `phone`, `full_name`, `company_name` `[PII]`; double opt-in via `confirm_token_hash` + `confirm_expires_at`; `ip_hash`, `user_agent` (evidência LGPD).

### Journeys (automação visual)
- **`journeys`**, **`journey_nodes`** (grafo: trigger/send/wait/condition/split/goal/exit), **`journey_edges`**, **`journey_enrollments`**, **`journey_enrollment_events`**.

### Budget & Ops
- **`channel_budgets`**, **`channel_quotas`** (⚠️ seed vazio — ver pendências), **`budget_reallocations`**, **`channel_roi_stats`** (refresh via `fn_refresh_roi_stats`), **`ops_alert_notifications`** (alert-sweep).

### Compliance & LGPD
- **`compliance_terms`** — termos proibidos por nicho regulado/severidade.
- **`compliance_violations_log`** — log de violações detectadas em preflight.
- **`consent_ledger`** `[PII]` — consentimento/opt-out por `entity_id`+`channel`: `status`, `source`, `reason`, `evidence`. **`check_consent()` consulta isto antes de qualquer envio.**

### Saúde de entrega & churn
- **`sender_health`** — warmup de mailbox: `sent/bounced/replied/spam_reports` por dia; `compute_daily_cap()` = 50 se bounce>5%, senão ramp 50+(10×dias), teto 500.
- **`email_deliverability_events`** — bounces/complaints (webhook `singu-bounce`).
- **`contact_churn_scores`** — `fn_calculate_churn_risk()`.

### IA & scoring
- **`signal_weights`** — peso e `half_life_hours` por tipo de sinal; `signal_score(entity_id)` = Σ w×e^(−ln2·t/half-life).
- **`agent_eval_cases`** / **`agent_eval_runs`** — harness de avaliação do agente FATOR X (10 cases semeados; ainda não roda em CI — ver pendências).

## Funções-chave (12)

| Função | Propósito |
|---|---|
| `has_role(uuid, app_role)` | RBAC; SECURITY DEFINER — **requerida** pelas policies RLS |
| `check_consent(uuid, channel)` | Gate de consentimento pré-envio. **NUNCA bypassar** |
| `signal_score(uuid)` | Scoring com decay temporal |
| `has_recent_account_touchpoint(uuid, hours)` | Anti-carpet-bombing por empresa |
| `compute_daily_cap(text)` | Ramp-up de sender de email |
| `fn_calculate_churn_risk()` | Churn score de contatos |
| `fn_refresh_roi_stats()` | Refresh de ROI por canal |
| `refresh_pipeline_health()` | View de saúde do pipeline |
| `handle_new_user()` | Trigger em auth.users (1º=admin). EXECUTE revogado de authenticated/anon |
| `tg_log_target_state_change` / `tg_sync_target_status` / `tg_touch_updated_at` | Triggers da máquina de estados e timestamps |

## Regras críticas do banco (as 10 — fonte: SCHEMA_REFERENCE, validadas)

1. **SKIP LOCKED** no tick de cadência (`FOR UPDATE SKIP LOCKED LIMIT 100`)
2. **`check_consent()` obrigatório** antes de qualquer envio
3. **`UNIQUE(source, external_id)`** em `sales_machine_events` → `ON CONFLICT DO NOTHING`
4. **`entity_map` upsert** — `ON CONFLICT (kind, lux_id) DO UPDATE`, nunca INSERT direto
5. **Nunca** UPDATE em `campaign_targets.state` fora da máquina de estados
6. **`locked_until`** — sempre setar ao pegar target; limpar ao terminar
7. **`campaign_target_events` é append-only** (exceto cleanup >1 ano)
8. **Disclosure de IA** na 1ª mensagem do agente
9. **Stop words de opt-out** detectadas no webhook SINGU → `consent_ledger` imediato
10. **LGPD** — apagamento só via função dedicada de apagamento de dados pessoais (admin)

