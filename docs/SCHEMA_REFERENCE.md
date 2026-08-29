# SALES MACHINE — Schema Reference
> **Banco:** Supabase Cloud · **Última atualizaçóo:** 2026-07-21 · **Migrations:** 009 aplicadas

## Enums

| Enum | Valores |
|---|---|
| `app_role` | `admin`, `operator`, `viewer` |
| `sm_source` | `lux`, `singu`, `fatorx`, `manual` |
| `sm_channel` | `linkedin`, `whatsapp`, `email`, `sms`, `instagram` |
| `sm_event_status` | `received`, `processing`, `processed`, `error`, `ignored` |
| `sm_direction` | `outbound`, `inbound` |
| `sm_campaign_status` | `draft`, `active`, `paused`, `archived` |
| `sm_touchpoint_status` | `queued`, `sent`, `delivered`, `read`, `replied`, `failed`, `opted_out`, `dead_letter`, `pending_approval`, `pending_provider` |
| `sm_target_state` | `queued`, `running`, `paused`, `replied`, `stopped`, `lost`, `completed`, `dead_letter` |
| `sm_cadence_preset` | `aggressive`, `standard`, `enterprise`, `custom` |
| `sm_consent_status` | `opted_in`, `opted_out`, `pending`, `unknown` |
| `sm_legal_basis` | `legitimate_interest`, `consent`, `contract`, `not_applicable` |
| `sm_template_status` | `draft`, `approved`, `archived` |
| `sm_calendar_status` | `scheduled`, `sending`, `sent`, `failed`, `cancelled` |

---

## Tabelas

### `user_roles`
RBAC. Primeiro usuário → admin; demais → operator.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK auth.users | CASCADE DELETE |
| `role` | app_role | |
| `created_at` | timestamptz | |

**RLS:** usuário lê próprios roles. Funções: `has_role(uuid, app_role) → bool` (SECURITY DEFINER).

---

### `sales_machine_events`
Ingestão de webhooks + audit log de eventos. **Não deletar — append-only.**

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `source` | sm_source | `lux`, `singu`, `fatorx`, `manual` |
| `event_type` | text | ex: `icp_company_found`, `reply`, `meeting_booked` |
| `external_id` | text | id original no sistema fonte |
| `entity_id` | uuid FK entity_map | SET NULL on delete |
| `payload` | jsonb | dados completos do evento |
| `status` | sm_event_status | |
| `error` | text | |
| `received_at` | timestamptz | |
| `processed_at` | timestamptz | nullable |

**Constraints:** UNIQUE(source, external_id) — previne replay.
**Índices:** `(source, event_type, received_at DESC)`, `(status) WHERE status<>''rocessed'`, `(entity_id, received_at DESC)`.
**RLS:** admin pode ler. service_role ALL.

---

### `entity_map`
**Chave canönica** que une os 4 bancos (LUX ↔SINGU ↔ FATOR X).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | entity_id usado em todo o sistema |
| `kind` | text CHECK  `company` ou `contact` |
| `display_name` | text | |
| `lux_id` | text | id da empresa/contato no LUX |
| `singu_id` | text | id no SINGU |
| `fatorx_thread_id` | text | thread de conversa nj FATOR X |
| `metadata` | jsonb | inclui `lux_company_id` p/ anti-carpet-bombing |
| `created_at` / `updated_at` | timestamptz | |

**Índices únicos:** `(kind, lux_id)`, `(kind, singu_id)`, `(fatorx_thread_id)` — todos parciais (WHERE NOT NULL).
**LINDex GIN:** `metadata WHERE KIND='contact'` — usado por `has_recent_account_touchpoint()`.
**Upsert:** sempre usar `INSERT ... ON CONFLICT (kind, lux_id) DO UPDATE`.

---

### `cadence_rules`
Templates de cadência multicanal.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `description` | text | |
| `preset` | sm_cadence_preset | `aggressive`/`standard`/`enterprise`/`custom` |
| `steps` | jsonb | `[{"channel":"whatsapp","delay_days":0}, ...]` |
| `owner_id` | uuid FK auth.users | NULL = global/sistema |
| `is_active` | boolean | |
| `created_at` / `updated_at` | timestamptz | |

**Seed:** 3 presets globais (owner_id NULL) + 1 Default multichannel.

---

### `campaigns_orchestration`
Campanha de outbound/marketing.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `icp_filter` | jsonb | critérios para filtrar entities |
| `channels` | sm_channel[] | canais ativos |
| `fatorx_agent_id` | text | agente do FATOR X |
| `cadence_rule_id` | uuid FK cadence_rules | |
| `cadence_preset` | sm_cadence_preset | |
| `status` | sm_campaign_status | |
| `account_cooldown_hours` | integer | default 48h anti-carpet-bombing |
| `requires_human_approval` | boolean | default TRUE — gate de aprovação |
| `owner_id` | uuid FK auth.users | |
| `created_at` / `updated_at` | timestamptz | |

---

### `campaign_targets`
**State machine por lead.** Um registro por (campaign, entity).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `campaign_id` | uuid FK campaigns_orchestration | CASCADE |
| `entity_id` | uuid FK entity_map | CASCADE$|
| `current_step` | integer | índice no array de steps da cadência |
| `next_run_at` | timestamptz | quando o tick deve processar |
| `status` | text | legado — mantido em sync com `state` |
| `state` | sm_target_state | **fonte de verdade** |
| `attempts` | integer | tentativas no passo atual |
| `max_attempts` | integer | default 5 |
| `locked_until` | timestamptz | lock otimista durante processamento |
| `last_transition_at` | timestamptz | |
| `last_error` | text | |

**Transições válidas:**
- `queued` → `running`
- `running` → `paused`, `replied`, `stopped`, `lost`, `completed`, `dead_letter`
- `paused` → `queued`, `stopped`, `lost`
- `replied` → `completed`
- `completed`, `stopped`, `lost` → **TERMINAL** (nenhuma)
- `dead_letter` → `queued` (retry manual)

**Triggers:** `tg_log_target_state_change` (audit), `tg_sync_target_status` (compat), `tg_validate_target_state_transition` (guard).
**SKIP LOCKED** obrigatório no tick para evitar race condition.

---

### `campaign_target_events`
**Audit log imutável** de transições de estado.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `target_id` | uuid FK campaign_targets | CASCADE |
| `from_state` | sm_target_state | nullable (NULL = criação) |
| `to_state` | sm_target_state | |
| `reason` | text | |
| `actor` | text | `system`, `webhook`, `human` |
| `payload` | jsonb | contexto adicional |
| `entity_snapshot` | jsonb | snapshot da entity no momento |
| `created_at` | timestamptz | **NUNCA ATUALIZAR** |

---

### `channel_quotas`
Limite diário de envios por usuário×canal.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK auth.users | CASCADE |
| `channel` | sm_channel | |
| `daily_cap` | integer | default 50 |
| `current_count` | integer | |
| `reset_at` | timestamptz | próxima meia-noite |

**Atualização atômica:** `UPDATE ... SET last_updated = now(), current_count = current_count + 1 WHERE current_count < daily_cap RETURNING *`

---

### `contact_touchpoints`
Espelho de toques para dashboards.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `entity_id` | uuid FK entity_map | CASCADE |
| `campaign_id` | uuid FK campaigns_orchestration | SET NULL |
| `channel` | sm_channel | |
| `direction` | sm_direction | `outbound`/`inbound` |
| `status` | sm_touchpoint_status | |
| `fatorx_thread_id` | text | |
| `singu_interaction_id` | text | |
| `payload` | jsonb | |
| `error` | text | |
| `attempts` | integer | |
| `max_attempts` | integer | default 5 |
| `next_retry_at` | timestamptz | backoff exponencial |
| `email_message_id` | text | threading RFC 2822 |
| `email_in_reply_to` | text | |
| `email_references` | text[] | |

---

### `consent_ledger`
**LGPD A	rt. 7/11.** Opt-in/opt-out por contato×canal. **Checar ANTES de qualquer envio.**

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `entity_id` | uuid FK entity_map | CASCADE$|
| `channel` | sm_channel | |
| `status` | sm_consent_status | default `unknown` |
| `legal_basis` | sm_legal_basis | default `legitimate_interest` |
| `source` | text | `inbound_keyword`, `form`, `manual` |
| `opted_at` / `opted_out_at` | timestamptz | |
| `ip_address` | inet | |
| `notes` | text | |

**Função:** `check_consent(entity_id, channel) → bool`  — retorna FALSE se opted_out.
**Índice:** `(entity_id, channel) WHERE status='opted_out'` — consulta de bloqueio ultrarápida.

---

### `stop_word_lists`
Keywords de opt-out por idioma×canal.

| Coluna | Tipo | Notas |
|---|---|---|
| `language` | text | `pt-BR`, `en` |
| `channel` | sm_channel | |
| `words` | text[] | comparação case-insensitive no webhook-singu |

---

### `agent_identity_config`
Persona + guardrails do agente de IA por campanha/canal.

| Coluna | Tipo | Notas |
|---|---|---|
| `campaign_id` | uuid FK campaigns (nullable) | NULL = fallback global |
| `channel` | sm_channel (nullable) | NULL = todos os canais |
| `persona_name` | text | ex: "Assistente Virtual" |
| `company_name` | text | ex: "Promo Brindes" |
| `disclosure_text` | text | apresentado no primeiro contato |
| `prohibited_topics` | text[] | política, religião, concorrentes... |
| `prohibited_commitments` | text[] | descontos não autorizados... |
| `max_turns_per_session` | integer | default 20 |
| `identity_guardrail_enabled` | boolean | se FALSE, agente pode negar identidade (não recomendado) |
| `pii_detection_enabled` | boolean | |
| `stop_word_language` | text | |
| `fatorx_agent_id` | text | override do agente do FATOR X |

---

### `marketing_templates`
Templates aprovados para Module 02.

| Coluna | Tipo | Notas |
|---|---|---|
| `channel` | sm_channel | |
| `status` | sm_template_status | `draft`→ `approved` → `archived` |
| `subject` | text | e-mail only |
| `body` | text | variáveis como `{nome}`, `{empresa}` |
| `required_vars` | text[] | validado por `validate_template_vars()` |
| `allowed_hours_start` / `_end` | smallint | janela de envio (default 8h-20h) |

---

### `content_calendar`
Agendamento de broadcast do Module 02.

| Coluna | Tipo | Notas |
|---|---|---|
| `template_id` | uuid FK marketing_templates | RESTRICT delete |
| `scheduled_at` | timestamptz | quando disparar |
| `audience_filter` | jsonb | filtro de entities |
| `status` | sm_calendar_status | |
| `locked_by` / `locked_until` | text / timestamptz | lock de broadcast em progresso |

---

### `signal_weights`
Configuração do scoring com decay.

| Coluna | Tipo | Notas |
|---|---|---|
| `event_type` | text PK | |
| `weight` | numeric | +100 reply, -500 opted_out... |
| `half_life_hours` | integer | 24h reply, 8760h opted_out |

**Função:** `signal_score(entity_id) → numeric` ℓ soma `w × exp(-ln(2) × t / halflife)`.

---

### `sender_health`
Saúde do sender de e-mail (warmup).

| Coluna | Tipo | Notas |
|---|---|---|
| `sender_id` | text | identificador do mailbox |
| `day` | date | UNIQUE(sender_id, day) |
| `sent` / `bounced` / `replied` / `spam_reports` | integer | |
| `daily_cap` | integer | |

**Função:** `compute_daily_cap(sender_id) → integer` - retorna 50 se bounce > 5%, senão ramp 50 + (10 × dias ativos), máx 500.

---

### `agent_eval_cases` + `agent_eval_runs`
Harness de avaliação do agente.

`agent_eval_cases`: dataset rotulado (`signal_json` → `expected_intent`, `expected_channel`). 10 cases semeados.
`agent_eval_runs`: resultado de cada execução do harness (passed bool, latency_ms, actual_output).

---

## Funções chave

| Função | Assinatura | Propósito |
|---|---|---|
| `has_role` | `(uuid, app_role) → bool` | SECURITY DEFINER, RBAC check |
| `check_consent` | `(uuid, sm_channel) → bool` | Verifica opt-out antes de envio |
| `signal_score` | `(uuid) → numeric` | Score decay temporal por entity |
| `has_recent_account_touchpoint` | `(uuid, hours int) → bool` | Anti-carpet-bombing por mpresa |
| `compute_daily_cap` | `(text) → int` | Ramp-up de sender de e-mail |
| `fn_recover_stale_locks` | `() → int` | Libera locks de 10min+ travados |
| `fn_archive_old_target_events` | `() → int` | Cleanup de eventos >1 ano |
| `export_entity_personal_data` | `(uuid) → jsonb` | LGPD Art.18 export |
| `delete_entity_personal_data` | `(uuid, uuid) → void` | LGPD Art.18 apagamento (admin only) |
| `validate_template_vars` | `(text, text[]) → bool` | Valida variáveis em template |

---

## Regras críticas (no violar)

1. **SKIP LOCKED obrigatório** no tick de cadência — `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 100`
2. **check_consent() OBRiGATÓRIO** antes de qualquer sinu-send, sms-send, etc.
3. **UNIQUE `(source, external_id)`** em `sales_machine_events`: usar INSERT ... ON CONFLICT DO NOTHING nos webhooks
4. **entity_map upsert** — INSERT ... ON CONFLICT (kind, lux_id) DO UPDATE — nunca INSERT direto
5. **Transições de estado inválidas** — nunca UPDATE campaign_targets.state fora da máquina de estados
6. **`locked_until`** — sempre setar ao pegar um target; sempre limpar ao terminar
7. **audit trail** — campaign_target_events é append-only, nunca deletar (exceto o cleanup de 1 ano)
8. **disclosure_text** — injetar na primeira mensagem do agente (agent_identity_config)
9. **stop_word_lists** — detectar keywords de opt-out em webhook-singu, gravar consent_ledger imediatamente
10. **LGPD** — delete_entity_personal_data() é a única forma de apagar dados de contato
