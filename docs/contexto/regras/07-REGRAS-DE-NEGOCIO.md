# 07 · REGRAS DE NEGÓCIO

> Gerado automaticamente por AI Context Sync v1.3.2 · commit `bbb55e3e67` · branch `main` · 2026-11-24 08:53 UTC
> Não edite à mão — regras humanas vão em `manual/`.

## A. Regras escritas por humanos (`manual/` — prioridade máxima, nunca sobrescrito)

_Nenhum arquivo em `manual/`. Copie `manual/TEMPLATE-regras-de-negocio.md` para `manual/regras.md` e preencha._

## B. Quem pode ver/alterar o quê (RLS — conforme migrations do repo; schema real em `06`)

| Tabela | Política | Comando | Roles | Modo | USING | WITH CHECK |
|---|---|---|---|---|---|---|
| `user_roles` | users read their own roles | SELECT | authenticated | permissive | `auth.uid() = user_id` |  |
| `sales_machine_events` | admins read events | SELECT | authenticated | permissive | `public.has_role(auth.uid(), 'admin')` |  |
| `entity_map` | authenticated read entity_map | SELECT | authenticated | permissive | `true` |  |
| `entity_map` | operators write entity_map | INSERT | authenticated | permissive |  | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `entity_map` | operators update entity_map | UPDATE | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `cadence_rules` | auth read cadence | SELECT | authenticated | permissive | `true` |  |
| `cadence_rules` | operators manage cadence | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `campaigns_orchestration` | auth read campaigns | SELECT | authenticated | permissive | `true` |  |
| `campaigns_orchestration` | operators manage campaigns | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `channel_quotas` | users read own quotas | SELECT | authenticated | permissive | `auth.uid() = user_id` |  |
| `channel_quotas` | users update own quotas | UPDATE | authenticated | permissive | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `channel_quotas` | users insert own quotas | INSERT | authenticated | permissive |  | `auth.uid() = user_id` |
| `contact_touchpoints` | auth read touchpoints | SELECT | authenticated | permissive | `true` |  |
| `contact_touchpoints` | operators write touchpoints | INSERT | authenticated | permissive |  | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `contact_touchpoints` | operators update touchpoints | UPDATE | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `campaign_targets` | sm operators can read targets | SELECT | authenticated | permissive | `public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')` |  |
| `campaign_targets` | sm operators can write targets | ALL | authenticated | permissive | `public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')` | `public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')` |
| `campaign_target_events` | target events readable by roles | SELECT | authenticated | permissive | `public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')` |  |
| `cadence_rules` | cadence presets readable by all authed | SELECT | authenticated | permissive | `owner_id IS NULL OR owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin')` |  |
| `sender_health` | sender_health readable by roles | SELECT | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |  |
| `sender_health` | sender_health writable by admins | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin')` | `public.has_role(auth.uid(),'admin')` |
| `signal_weights` | signal_weights readable | SELECT | authenticated | permissive | `true` |  |
| `signal_weights` | signal_weights writable by admins | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin')` | `public.has_role(auth.uid(),'admin')` |
| `agent_eval_cases` | eval cases readable by roles | SELECT | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |  |
| `agent_eval_cases` | eval cases writable by admins | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin')` | `public.has_role(auth.uid(),'admin')` |
| `agent_eval_runs` | eval runs readable by roles | SELECT | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |  |
| `agent_eval_runs` | eval runs writable by admins | INSERT | authenticated | permissive |  | `public.has_role(auth.uid(),'admin')` |
| `message_templates` | users read own templates | SELECT | authenticated | permissive | `auth.uid() = created_by` |  |
| `message_templates` | users insert own templates | INSERT | authenticated | permissive |  | `auth.uid() = created_by` |
| `message_templates` | users update own templates | UPDATE | authenticated | permissive | `auth.uid() = created_by` | `auth.uid() = created_by` |
| `message_templates` | users delete own templates | DELETE | authenticated | permissive | `auth.uid() = created_by` |  |
| `storage.objects` | authenticated read message-media | SELECT | authenticated | permissive | `bucket_id = 'message-media'` |  |
| `storage.objects` | authenticated upload message-media | INSERT | authenticated | permissive |  | `bucket_id = 'message-media' AND auth.uid() = owner` |
| `storage.objects` | owners delete message-media | DELETE | authenticated | permissive | `bucket_id = 'message-media' AND auth.uid() = owner` |  |
| `consent_ledger` | authenticated can read ledger | SELECT | authenticated | permissive | `true` |  |
| `consent_ledger` | operators can insert ledger | INSERT | authenticated | permissive |  | `public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')` |
| `email_deliverability_events` | authenticated can read email events | SELECT | authenticated | permissive | `true` |  |
| `audiences` | audiences_read | SELECT | authenticated | permissive | `true` |  |
| `audience_members` | audience_members_read | SELECT | authenticated | permissive | `true` |  |
| `marketing_campaigns` | mkt_campaigns_read | SELECT | authenticated | permissive | `true` |  |
| `campaign_variants` | campaign_variants_read | SELECT | authenticated | permissive | `true` |  |
| `campaign_sends` | campaign_sends_read | SELECT | authenticated | permissive | `true` |  |
| `audiences` | operators manage audiences | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `audience_members` | operators manage audience_members | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `marketing_campaigns` | operators manage marketing_campaigns | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `campaign_variants` | operators manage campaign_variants | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `campaign_sends` | operators manage campaign_sends | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `ops_alert_notifications` | Autenticados leem alertas | SELECT | authenticated | permissive | `true` |  |
| `campaign_target_events` | operators log their own manual interventions | INSERT | authenticated | permissive |  | `(public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')) AND actor = 'operator:' \|\| auth.uid()::text` |
| `channel_budgets` | channel_budgets_read | SELECT | authenticated | permissive | `true` |  |
| `channel_budgets` | channel_budgets_admin_write | ALL | authenticated | permissive | `public.has_role(auth.uid(), 'admin')` | `public.has_role(auth.uid(), 'admin')` |
| `channel_budgets` | channel_budgets_update | UPDATE | authenticated | permissive | `public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')` | `public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')` |
| `budget_reallocations` | budget_reallocations_read | SELECT | authenticated | permissive | `true` |  |
| `budget_reallocations` | budget_reallocations_insert | INSERT | authenticated | permissive |  | `(public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role)) AND (actor_user_id IS NULL OR actor_user_id = auth.uid())` |
| `journeys` | journeys_read | SELECT | authenticated | permissive | `true` |  |
| `journeys` | journeys_write | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `journey_nodes` | journey_nodes_read | SELECT | authenticated | permissive | `true` |  |
| `journey_nodes` | journey_nodes_write | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `journey_edges` | journey_edges_read | SELECT | authenticated | permissive | `true` |  |
| `journey_edges` | journey_edges_write | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `journey_enrollments` | journey_enrollments_read | SELECT | authenticated | permissive | `true` |  |
| `journey_enrollments` | journey_enrollments_write | ALL | authenticated | permissive | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` | `public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')` |
| `journey_enrollment_events` | journey_enrollment_events_read | SELECT | authenticated | permissive | `true` |  |
| `lead_forms` | lead_forms_public_read | SELECT | anon | permissive | `status = 'published'` |  |
| `lead_forms` | lead_forms_read | SELECT | authenticated | permissive | `true` |  |
| `lead_forms` | lead_forms_write | ALL | authenticated | permissive | `has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role)` | `has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role)` |
| `lead_form_submissions` | lead_form_submissions_read | SELECT | authenticated | permissive | `true` |  |
| `lead_form_submissions` | lead_form_submissions_write | ALL | authenticated | permissive | `has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role)` | `has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role)` |
| `template_preflight_history` | Users can view history of their own templates | SELECT | authenticated | permissive | `EXISTS ( SELECT 1 FROM public.message_templates WHERE id = template_preflight_history.template_id AND created_by = auth.uid() )` |  |
| `template_preflight_history` | Users can insert history for their own templates | INSERT | authenticated | permissive |  | `EXISTS ( SELECT 1 FROM public.message_templates WHERE id = template_preflight_history.template_id AND created_by = auth.uid() )` |
| `compliance_terms` | Owners manage their compliance terms | ALL | authenticated | permissive | `created_by = auth.uid()` | `created_by = auth.uid()` |
| `compliance_terms` | Admins can view all compliance terms | SELECT | authenticated | permissive | `public.has_role(auth.uid(), 'admin')` |  |
| `compliance_violations_log` | Users can view their own compliance logs | SELECT | authenticated | permissive | `auth.uid() = user_id` |  |
| `compliance_violations_log` | Users can insert their own compliance logs | INSERT | authenticated | permissive |  | `auth.uid() = user_id` |
| `channel_roi_stats` | Authenticated users can select ROI stats | SELECT | authenticated | permissive | `true` |  |
| `contact_churn_scores` | Authenticated users can select churn scores | SELECT | authenticated | permissive | `true` |  |

## C. Restrições de dados (obrigatório / único / default / CHECK / FK / calculada)

| Tabela | Coluna | Regra |
|---|---|---|
| `user_roles` | `id` | PK; default gen_random_uuid() |
| `user_roles` | `user_id` | obrigatório; FK → users.id ON DELETE CASCADE |
| `user_roles` | `role` | obrigatório |
| `user_roles` | `created_at` | default now() |
| `user_roles` | `(tabela)` | UNIQUE (user_id, role) |
| `sales_machine_events` | `id` | PK; default gen_random_uuid() |
| `sales_machine_events` | `source` | obrigatório |
| `sales_machine_events` | `event_type` | obrigatório |
| `sales_machine_events` | `payload` | default '{}'::jsonb |
| `sales_machine_events` | `status` | default 'received' |
| `sales_machine_events` | `received_at` | default now() |
| `entity_map` | `id` | PK; default gen_random_uuid() |
| `entity_map` | `kind` | obrigatório; CHECK kind IN ('company','contact') |
| `entity_map` | `metadata` | default '{}'::jsonb |
| `entity_map` | `created_at` | default now() |
| `entity_map` | `updated_at` | default now() |
| `cadence_rules` | `id` | PK; default gen_random_uuid() |
| `cadence_rules` | `name` | obrigatório |
| `cadence_rules` | `steps` | default '[]'::jsonb |
| `cadence_rules` | `owner_id` | FK → users.id ON DELETE SET NULL |
| `cadence_rules` | `is_active` | default true |
| `cadence_rules` | `created_at` | default now() |
| `cadence_rules` | `updated_at` | default now() |
| `cadence_rules` | `preset` | default 'custom' |
| `campaigns_orchestration` | `id` | PK; default gen_random_uuid() |
| `campaigns_orchestration` | `name` | obrigatório |
| `campaigns_orchestration` | `icp_filter` | default '{}'::jsonb |
| `campaigns_orchestration` | `channels` | default '{}' |
| `campaigns_orchestration` | `cadence_rule_id` | FK → cadence_rules.id ON DELETE SET NULL |
| `campaigns_orchestration` | `status` | default 'draft' |
| `campaigns_orchestration` | `owner_id` | FK → users.id ON DELETE SET NULL |
| `campaigns_orchestration` | `requires_human_approval` | default true |
| `campaigns_orchestration` | `created_at` | default now() |
| `campaigns_orchestration` | `updated_at` | default now() |
| `campaigns_orchestration` | `cadence_preset` | default 'standard' |
| `campaigns_orchestration` | `account_cooldown_hours` | default 48 |
| `channel_quotas` | `id` | PK; default gen_random_uuid() |
| `channel_quotas` | `user_id` | obrigatório; FK → users.id ON DELETE CASCADE |
| `channel_quotas` | `channel` | obrigatório |
| `channel_quotas` | `daily_cap` | default 50; CHECK daily_cap >= 0 |
| `channel_quotas` | `current_count` | default 0; CHECK current_count >= 0 |
| `channel_quotas` | `reset_at` | default (date_trunc('day' |
| `channel_quotas` | `updated_at` | default now() |
| `channel_quotas` | `(tabela)` | UNIQUE (user_id, channel) |
| `contact_touchpoints` | `id` | PK; default gen_random_uuid() |
| `contact_touchpoints` | `entity_id` | obrigatório; FK → entity_map.id ON DELETE CASCADE |
| `contact_touchpoints` | `campaign_id` | FK → campaigns_orchestration.id ON DELETE SET NULL |
| `contact_touchpoints` | `channel` | obrigatório |
| `contact_touchpoints` | `direction` | obrigatório |
| `contact_touchpoints` | `status` | default 'queued' |
| `contact_touchpoints` | `payload` | default '{}'::jsonb |
| `contact_touchpoints` | `created_at` | default now() |
| `contact_touchpoints` | `updated_at` | default now() |
| `contact_touchpoints` | `attempts` | default 0 |
| `contact_touchpoints` | `max_attempts` | obrigatório |
| `campaign_targets` | `id` | PK; default gen_random_uuid() |
| `campaign_targets` | `campaign_id` | obrigatório; FK → campaigns_orchestration.id ON DELETE CASCADE |
| `campaign_targets` | `entity_id` | obrigatório; FK → entity_map.id ON DELETE CASCADE |
| `campaign_targets` | `current_step` | default 0 |
| `campaign_targets` | `next_run_at` | default now() |
| `campaign_targets` | `status` | default 'queued'; CHECK status IN ('queued','running','done','failed','paused') |
| `campaign_targets` | `created_at` | default now() |
| `campaign_targets` | `updated_at` | default now() |
| `campaign_targets` | `state` | default 'queued' |
| `campaign_targets` | `attempts` | obrigatório |
| `campaign_targets` | `last_transition_at` | obrigatório |
| `campaign_targets` | `max_attempts` | obrigatório |
| `campaign_targets` | `(tabela)` | UNIQUE (campaign_id, entity_id) |
| `campaign_targets` | `(tabela)` | constraint campaign_targets_status_check CHECK (status IN ('queued','running','done','failed','paused','completed')) |
| `campaign_target_events` | `id` | PK; default gen_random_uuid() |
| `campaign_target_events` | `target_id` | obrigatório; FK → campaign_targets.id ON DELETE CASCADE |
| `campaign_target_events` | `to_state` | obrigatório |
| `campaign_target_events` | `actor` | default 'system' |
| `campaign_target_events` | `payload` | default '{}'::jsonb |
| `campaign_target_events` | `created_at` | default now() |
| `sender_health` | `id` | PK; default gen_random_uuid() |
| `sender_health` | `sender_id` | obrigatório |
| `sender_health` | `day` | default CURRENT_DATE |
| `sender_health` | `sent` | default 0 |
| `sender_health` | `bounced` | default 0 |
| `sender_health` | `replied` | default 0 |
| `sender_health` | `spam_reports` | default 0 |
| `sender_health` | `daily_cap` | default 50 |
| `sender_health` | `created_at` | default now() |
| `sender_health` | `updated_at` | default now() |
| `sender_health` | `(tabela)` | UNIQUE(sender_id, day) |
| `signal_weights` | `event_type` | PK |
| `signal_weights` | `weight` | default 10 |
| `signal_weights` | `half_life_hours` | default 72 |
| `signal_weights` | `updated_at` | default now() |
| `agent_eval_cases` | `id` | PK; default gen_random_uuid() |
| `agent_eval_cases` | `name` | obrigatório |
| `agent_eval_cases` | `signal_json` | obrigatório |
| `agent_eval_cases` | `expected_intent` | obrigatório |
| `agent_eval_cases` | `created_at` | default now() |
| `agent_eval_cases` | `updated_at` | default now() |
| `agent_eval_runs` | `id` | PK; default gen_random_uuid() |
| `agent_eval_runs` | `case_id` | obrigatório; FK → agent_eval_cases.id ON DELETE CASCADE |
| `agent_eval_runs` | `passed` | obrigatório |
| `agent_eval_runs` | `actual_output` | default '{}'::jsonb |
| `agent_eval_runs` | `ran_by` | FK → users.id |
| `agent_eval_runs` | `ran_at` | default now() |
| `message_templates` | `id` | PK; default gen_random_uuid() |
| `message_templates` | `name` | obrigatório |
| `message_templates` | `channel` | obrigatório |
| `message_templates` | `body` | obrigatório; CHECK char_length(body) <= 1000 |
| `message_templates` | `variables` | default '[]'::jsonb |
| `message_templates` | `archived` | default false |
| `message_templates` | `created_by` | FK → users.id ON DELETE SET NULL |
| `message_templates` | `created_at` | default now() |
| `message_templates` | `updated_at` | default now() |
| `message_templates` | `(tabela)` | constraint message_templates_channel_check CHECK (channel = ANY (ARRAY['whatsapp'::sm_channel,'email'::sm_channel,'sms'::sm_channel,'rcs'::sm_channel,'mms'::sm_channel,'linkedin'::sm_channel,'instagram'::sm_channel])) |
| `message_templates` | `(tabela)` | constraint message_templates_body_check CHECK (char_length(body) <= 4000) |
| `message_templates` | `(tabela)` | constraint message_templates_subject_check CHECK (subject IS NULL OR char_length(subject) <= 200) |
| `consent_ledger` | `id` | PK; default gen_random_uuid() |
| `consent_ledger` | `entity_id` | obrigatório; FK → entity_map.id ON DELETE CASCADE |
| `consent_ledger` | `channel` | obrigatório |
| `consent_ledger` | `status` | obrigatório; CHECK status IN ('opt_in','opt_out') |
| `consent_ledger` | `source` | obrigatório; CHECK source IN ('stop_word','unsubscribe_link','manual','bounce','import','webhook') |
| `consent_ledger` | `evidence` | default '{}'::jsonb |
| `consent_ledger` | `created_at` | default now() |
| `email_deliverability_events` | `id` | PK; default gen_random_uuid() |
| `email_deliverability_events` | `touchpoint_id` | FK → contact_touchpoints.id ON DELETE SET NULL |
| `email_deliverability_events` | `entity_id` | FK → entity_map.id ON DELETE CASCADE |
| `email_deliverability_events` | `event_type` | obrigatório; CHECK event_type IN ('hard_bounce','soft_bounce','complaint','unsubscribe','delivered','opened','clicked') |
| `email_deliverability_events` | `provider` | obrigatório |
| `email_deliverability_events` | `raw` | default '{}'::jsonb |
| `email_deliverability_events` | `created_at` | default now() |
| `email_deliverability_events` | `(tabela)` | UNIQUE (provider, external_id) |
| `audiences` | `id` | PK; default gen_random_uuid() |
| `audiences` | `name` | obrigatório |
| `audiences` | `rules` | default '{}'::jsonb |
| `audiences` | `member_count` | default 0 |
| `audiences` | `archived` | default false |
| `audiences` | `created_at` | default now() |
| `audiences` | `updated_at` | default now() |
| `audience_members` | `id` | PK; default gen_random_uuid() |
| `audience_members` | `audience_id` | obrigatório; FK → audiences.id ON DELETE CASCADE |
| `audience_members` | `entity_id` | obrigatório; FK → entity_map.id ON DELETE CASCADE |
| `audience_members` | `snapshot` | default '{}'::jsonb |
| `audience_members` | `created_at` | default now() |
| `audience_members` | `(tabela)` | UNIQUE (audience_id, entity_id) |
| `marketing_campaigns` | `id` | PK; default gen_random_uuid() |
| `marketing_campaigns` | `name` | obrigatório |
| `marketing_campaigns` | `objective` | default 'awareness'; CHECK objective IN ('awareness','engagement','conversion','reactivation','announcement') |
| `marketing_campaigns` | `status` | default 'draft'; CHECK status IN ('draft','scheduled','running','paused','completed','cancelled') |
| `marketing_campaigns` | `channel` | obrigatório |
| `marketing_campaigns` | `audience_id` | FK → audiences.id ON DELETE SET NULL |
| `marketing_campaigns` | `daily_cap` | default 500 |
| `marketing_campaigns` | `requires_human_approval` | default false |
| `marketing_campaigns` | `metadata` | default '{}'::jsonb |
| `marketing_campaigns` | `created_at` | default now() |
| `marketing_campaigns` | `updated_at` | default now() |
| `campaign_variants` | `id` | PK; default gen_random_uuid() |
| `campaign_variants` | `campaign_id` | obrigatório; FK → marketing_campaigns.id ON DELETE CASCADE |
| `campaign_variants` | `label` | default 'A' |
| `campaign_variants` | `body` | obrigatório |
| `campaign_variants` | `split_percent` | default 100; CHECK split_percent BETWEEN 0 AND 100 |
| `campaign_variants` | `created_at` | default now() |
| `campaign_variants` | `updated_at` | default now() |
| `campaign_variants` | `(tabela)` | UNIQUE (campaign_id, label) |
| `campaign_sends` | `id` | PK; default gen_random_uuid() |
| `campaign_sends` | `campaign_id` | obrigatório; FK → marketing_campaigns.id ON DELETE CASCADE |
| `campaign_sends` | `variant_id` | FK → campaign_variants.id ON DELETE SET NULL |
| `campaign_sends` | `entity_id` | obrigatório; FK → entity_map.id ON DELETE CASCADE |
| `campaign_sends` | `touchpoint_id` | FK → contact_touchpoints.id ON DELETE SET NULL |
| `campaign_sends` | `state` | default 'queued'; CHECK state IN ('queued','pending_approval','sending','sent','failed','skipped','opted_out','dead_letter') |
| `campaign_sends` | `attempts` | default 0 |
| `campaign_sends` | `max_attempts` | default 3 |
| `campaign_sends` | `next_run_at` | default now() |
| `campaign_sends` | `created_at` | default now() |
| `campaign_sends` | `updated_at` | default now() |
| `campaign_sends` | `(tabela)` | UNIQUE (campaign_id, entity_id) |
| `ops_alert_notifications` | `id` | PK; default gen_random_uuid() |
| `ops_alert_notifications` | `alert_id` | obrigatório |
| `ops_alert_notifications` | `level` | obrigatório; CHECK level IN ('critical','warning') |
| `ops_alert_notifications` | `title` | obrigatório |
| `ops_alert_notifications` | `detail` | obrigatório |
| `ops_alert_notifications` | `first_notified_at` | default now() |
| `ops_alert_notifications` | `last_notified_at` | default now() |
| `ops_alert_notifications` | `occurrences` | default 1 |
| `ops_alert_notifications` | `created_at` | default now() |
| `ops_alert_notifications` | `updated_at` | default now() |
| `channel_budgets` | `channel` | PK |
| `channel_budgets` | `daily_limit_brl` | default 0; CHECK daily_limit_brl >= 0 |
| `channel_budgets` | `monthly_limit_brl` | default 0; CHECK monthly_limit_brl >= 0 |
| `channel_budgets` | `enabled` | default TRUE |
| `channel_budgets` | `created_at` | default now() |
| `channel_budgets` | `updated_at` | default now() |
| `budget_reallocations` | `id` | PK; default gen_random_uuid() |
| `budget_reallocations` | `applied_at` | default now() |
| `budget_reallocations` | `moved_total_brl` | default 0; CHECK moved_total_brl >= 0 |
| `budget_reallocations` | `total_before_brl` | default 0; CHECK total_before_brl >= 0 |
| `budget_reallocations` | `total_after_brl` | default 0; CHECK total_after_brl >= 0 |
| `budget_reallocations` | `channels_changed` | default 0; CHECK channels_changed >= 0 |
| `budget_reallocations` | `transfers` | default '[]'::jsonb |
| `budget_reallocations` | `changes` | default '[]'::jsonb |
| `budget_reallocations` | `unmet` | default '[]'::jsonb |
| `journeys` | `id` | PK; default gen_random_uuid() |
| `journeys` | `name` | obrigatório |
| `journeys` | `status` | default 'draft' |
| `journeys` | `entry_daily_cap` | default 200; CHECK entry_daily_cap >= 0 |
| `journeys` | `send_window_start` | default 9; CHECK send_window_start BETWEEN 0 AND 23 |
| `journeys` | `send_window_end` | default 19; CHECK send_window_end BETWEEN 0 AND 24 |
| `journeys` | `requires_human_approval` | default false |
| `journeys` | `allow_reentry` | default false |
| `journeys` | `metadata` | default '{}'::jsonb |
| `journeys` | `created_at` | default now() |
| `journeys` | `updated_at` | default now() |
| `journey_nodes` | `id` | PK; default gen_random_uuid() |
| `journey_nodes` | `journey_id` | obrigatório; FK → journeys.id ON DELETE CASCADE |
| `journey_nodes` | `kind` | obrigatório |
| `journey_nodes` | `label` | default '' |
| `journey_nodes` | `config` | default '{}'::jsonb |
| `journey_nodes` | `position_x` | default 0 |
| `journey_nodes` | `position_y` | default 0 |
| `journey_nodes` | `created_at` | default now() |
| `journey_nodes` | `updated_at` | default now() |
| `journey_edges` | `id` | PK; default gen_random_uuid() |
| `journey_edges` | `journey_id` | obrigatório; FK → journeys.id ON DELETE CASCADE |
| `journey_edges` | `from_node_id` | obrigatório; FK → journey_nodes.id ON DELETE CASCADE |
| `journey_edges` | `to_node_id` | obrigatório; FK → journey_nodes.id ON DELETE CASCADE |
| `journey_edges` | `branch` | default 'default' |
| `journey_edges` | `ordinal` | default 0 |
| `journey_edges` | `created_at` | default now() |
| `journey_edges` | `(tabela)` | CHECK (from_node_id <> to_node_id) |
| `journey_edges` | `(tabela)` | UNIQUE (from_node_id, to_node_id, branch) |
| `journey_enrollments` | `id` | PK; default gen_random_uuid() |
| `journey_enrollments` | `journey_id` | obrigatório; FK → journeys.id ON DELETE CASCADE |
| `journey_enrollments` | `entity_id` | obrigatório; FK → entity_map.id ON DELETE CASCADE |
| `journey_enrollments` | `current_node_id` | FK → journey_nodes.id ON DELETE SET NULL |
| `journey_enrollments` | `state` | default 'active' |
| `journey_enrollments` | `next_run_at` | default now() |
| `journey_enrollments` | `attempts` | default 0 |
| `journey_enrollments` | `context` | default '{}'::jsonb |
| `journey_enrollments` | `entered_at` | default now() |
| `journey_enrollments` | `created_at` | default now() |
| `journey_enrollments` | `updated_at` | default now() |
| `journey_enrollment_events` | `id` | PK; default gen_random_uuid() |
| `journey_enrollment_events` | `enrollment_id` | obrigatório; FK → journey_enrollments.id ON DELETE CASCADE |
| `journey_enrollment_events` | `node_id` | FK → journey_nodes.id ON DELETE SET NULL |
| `journey_enrollment_events` | `action` | obrigatório |
| `journey_enrollment_events` | `detail` | default '{}'::jsonb |
| `journey_enrollment_events` | `created_at` | default now() |
| `lead_forms` | `id` | PK; default gen_random_uuid() |
| `lead_forms` | `slug` | obrigatório; único; CHECK slug ~ '^[a-z0-9][a-z0-9-]{1,62}$' |
| `lead_forms` | `name` | obrigatório |
| `lead_forms` | `title` | default '' |
| `lead_forms` | `fields` | default '[]'::jsonb |
| `lead_forms` | `submit_label` | default 'Enviar' |
| `lead_forms` | `success_message` | default 'Recebemos |
| `lead_forms` | `consent_text` | default 'Autorizo |
| `lead_forms` | `double_opt_in` | default true |
| `lead_forms` | `confirm_ttl_hours` | default 48; CHECK confirm_ttl_hours BETWEEN 1 AND 720 |
| `lead_forms` | `channel` | default 'email' |
| `lead_forms` | `journey_id` | FK → journeys.id ON DELETE SET NULL |
| `lead_forms` | `tags` | default '{}' |
| `lead_forms` | `status` | default 'draft'; CHECK status IN ('draft','published','archived') |
| `lead_forms` | `submission_count` | default 0 |
| `lead_forms` | `created_at` | default now() |
| `lead_forms` | `updated_at` | default now() |
| `lead_form_submissions` | `id` | PK; default gen_random_uuid() |
| `lead_form_submissions` | `form_id` | obrigatório; FK → lead_forms.id ON DELETE CASCADE |
| `lead_form_submissions` | `entity_id` | FK → entity_map.id ON DELETE SET NULL |
| `lead_form_submissions` | `payload` | default '{}'::jsonb |
| `lead_form_submissions` | `status` | default 'pending'; CHECK status IN ('pending','confirmed','discarded') |
| `lead_form_submissions` | `confirm_token_hash` | único |
| `lead_form_submissions` | `created_at` | default now() |
| `lead_form_submissions` | `updated_at` | default now() |
| `template_preflight_history` | `id` | PK; default gen_random_uuid() |
| `template_preflight_history` | `template_id` | obrigatório; FK → message_templates.id ON DELETE CASCADE |
| `template_preflight_history` | `score` | obrigatório; CHECK score >= 0 AND score <= 100 |
| `template_preflight_history` | `findings` | default '[]'::jsonb |
| `template_preflight_history` | `created_at` | default now() |
| `template_preflight_history` | `created_by` | FK → users.id |
| `compliance_terms` | `id` | PK; default gen_random_uuid() |
| `compliance_terms` | `term` | obrigatório; CHECK btrim(term) <> '' AND length(term) <= 120 |
| `compliance_terms` | `niche` | default 'custom' |
| `compliance_terms` | `severity` | default 'warning' |
| `compliance_terms` | `reason` | obrigatório; CHECK btrim(reason) <> '' AND length(reason) <= 500 |
| `compliance_terms` | `suggestion` | CHECK suggestion IS NULL OR length(suggestion) <= 500 |
| `compliance_terms` | `is_active` | default true |
| `compliance_terms` | `created_by` | default auth.uid(); FK → users.id ON DELETE CASCADE |
| `compliance_terms` | `created_at` | default now() |
| `compliance_terms` | `updated_at` | default now() |
| `compliance_violations_log` | `id` | PK; default gen_random_uuid() |
| `compliance_violations_log` | `campaign_id` | FK → marketing_campaigns.id ON DELETE SET NULL |
| `compliance_violations_log` | `user_id` | obrigatório; FK → users.id |
| `compliance_violations_log` | `niche` | obrigatório |
| `compliance_violations_log` | `term` | obrigatório |
| `compliance_violations_log` | `severity` | obrigatório |
| `compliance_violations_log` | `reason` | obrigatório |
| `compliance_violations_log` | `text_snapshot` | obrigatório |
| `compliance_violations_log` | `action` | obrigatório |
| `compliance_violations_log` | `created_at` | default now() |
| `channel_roi_stats` | `id` | PK; default gen_random_uuid() |
| `channel_roi_stats` | `channel` | obrigatório |
| `channel_roi_stats` | `date` | default CURRENT_DATE |
| `channel_roi_stats` | `total_spent_brl` | default 0 |
| `channel_roi_stats` | `total_messages_sent` | default 0 |
| … +13 linhas — lista completa em `context.json` | | |

## D. Automações no banco (triggers e funções — regras que rodam sozinhas)

| Trigger | Quando | Tabela | Executa | Condição |
|---|---|---|---|---|
| trg_entity_map_touch | BEFORE UPDATE | `entity_map` | `tg_touch_updated_at` |  |
| trg_cadence_rules_touch | BEFORE UPDATE | `cadence_rules` | `tg_touch_updated_at` |  |
| trg_campaigns_touch | BEFORE UPDATE | `campaigns_orchestration` | `tg_touch_updated_at` |  |
| trg_quotas_touch | BEFORE UPDATE | `channel_quotas` | `tg_touch_updated_at` |  |
| trg_touchpoints_touch | BEFORE UPDATE | `contact_touchpoints` | `tg_touch_updated_at` |  |
| on_auth_user_created | AFTER INSERT | `auth.users` | `handle_new_user` |  |
| tg_campaign_targets_touch | BEFORE UPDATE | `campaign_targets` | `tg_touch_updated_at` |  |
| trg_campaign_targets_state_log | AFTER INSERT OR UPDATE OF STATE | `campaign_targets` | `tg_log_target_state_change` |  |
| trg_campaign_targets_status_sync | BEFORE INSERT OR UPDATE OF STATE | `campaign_targets` | `tg_sync_target_status` |  |
| trg_touch_campaign_targets | BEFORE UPDATE | `campaign_targets` | `tg_touch_updated_at` |  |
| trg_message_templates_touch | BEFORE UPDATE | `message_templates` | `tg_touch_updated_at` |  |
| trg_audiences_touch | BEFORE UPDATE | `audiences` | `tg_touch_updated_at` |  |
| trg_mkt_campaigns_touch | BEFORE UPDATE | `marketing_campaigns` | `tg_touch_updated_at` |  |
| trg_campaign_variants_touch | BEFORE UPDATE | `campaign_variants` | `tg_touch_updated_at` |  |
| trg_campaign_sends_touch | BEFORE UPDATE | `campaign_sends` | `tg_touch_updated_at` |  |
| trg_ops_alert_notifications_touch | BEFORE UPDATE | `ops_alert_notifications` | `tg_touch_updated_at` |  |
| tg_channel_budgets_touch | BEFORE UPDATE | `channel_budgets` | `tg_touch_updated_at` |  |
| journeys_touch | BEFORE UPDATE | `journeys` | `tg_touch_updated_at` |  |
| journey_nodes_touch | BEFORE UPDATE | `journey_nodes` | `tg_touch_updated_at` |  |
| journey_enrollments_touch | BEFORE UPDATE | `journey_enrollments` | `tg_touch_updated_at` |  |
| trg_lead_forms_touch | BEFORE UPDATE | `lead_forms` | `tg_touch_updated_at` |  |
| trg_lead_form_submissions_touch | BEFORE UPDATE | `lead_form_submissions` | `tg_touch_updated_at` |  |
| trg_compliance_terms_updated_at | BEFORE UPDATE | `compliance_terms` | `tg_touch_updated_at` |  |

Erros lançados por funções SQL (`RAISE EXCEPTION` = regra de negócio no banco):

_nenhum item encontrado_

## E. Estados, máquinas de estado e transições

### E.1 Colunas de status no banco

| Tabela | Coluna | Valores permitidos (enum/CHECK) | Default |
|---|---|---|---|
| `sales_machine_events` | `status` | `received`, `processing`, `processed`, `error`, `ignored` | `received` |
| `campaigns_orchestration` | `status` | `draft`, `active`, `paused`, `archived` | `draft` |
| `contact_touchpoints` | `status` | `queued`, `sent`, `delivered`, `read`, `replied`, `failed`, `opted_out`, `dead_letter`, `pending_approval` | `queued` |
| `campaign_targets` | `current_step` | **livre (sem enum/CHECK)** | `0` |
| `campaign_targets` | `status` | `completed`, `done`, `failed`, `paused`, `queued`, `running` | `queued` |
| `campaign_targets` | `state` | `queued`, `running`, `paused`, `replied`, `stopped`, `lost`, `completed`, `dead_letter` | `queued` |
| `campaign_target_events` | `from_state` | `queued`, `running`, `paused`, `replied`, `stopped`, `lost`, `completed`, `dead_letter` |  |
| `campaign_target_events` | `to_state` | `queued`, `running`, `paused`, `replied`, `stopped`, `lost`, `completed`, `dead_letter` |  |
| `consent_ledger` | `status` | `opt_in`, `opt_out` |  |
| `marketing_campaigns` | `status` | `cancelled`, `completed`, `draft`, `paused`, `running`, `scheduled` | `draft` |
| `campaign_sends` | `state` | `dead_letter`, `failed`, `opted_out`, `pending_approval`, `queued`, `sending`, `sent`, `skipped` | `queued` |
| `journeys` | `status` | `draft`, `active`, `paused`, `archived` | `draft` |
| `journey_enrollments` | `state` | `active`, `waiting`, `completed`, `exited`, `goal_reached`, `failed` | `active` |
| `lead_forms` | `status` | `archived`, `draft`, `published` | `draft` |
| `lead_form_submissions` | `status` | `confirmed`, `discarded`, `pending` | `pending` |

### E.2 Mapas de transição declarados no código

_nenhum mapa explícito encontrado — transições só existem implicitamente nos `if`s (veja E.3)_

### E.3 Valores de status usados no código (escreve / compara / filtra)

| Campo | Valor | Uso | Onde |
|---|---|---|---|
| `type` | `button` | compara, escreve | `src/components/email/EmailBlockEditor.tsx`<br>`src/lib/email-blocks.ts`<br>`src/lib/email-preflight.ts` |
| `type` | `checkbox` | compara | `src/lib/lead-forms.ts`<br>`src/routes/f.$slug.tsx` |
| `type` | `dial` | compara | `src/routes/_authenticated/library.tsx` |
| `type` | `divider` | compara, escreve | `src/lib/email-blocks.ts` |
| `type` | `email` | compara, escreve | `src/lib/lead-forms.ts`<br>`src/routes/f.$slug.tsx` |
| `type` | `error` | compara, escreve | `src/components/dashboard/campaign-drilldown.tsx`<br>`src/lib/campaign-diagnostics.ts` |
| `type` | `function` | escreve | `src/integrations/supabase/auth-attacher.ts`<br>`src/integrations/supabase/auth-middleware.ts` |
| `type` | `heading` | compara, escreve | `src/components/email/EmailBlockEditor.tsx`<br>`src/lib/email-blocks.ts`<br>`src/lib/email-preflight.ts` |
| `type` | `image` | compara, escreve | `src/components/email/EmailBlockEditor.tsx`<br>`src/lib/email-blocks.ts`<br>`src/lib/email-preflight.ts` |
| `type` | `info` | compara, escreve | `src/components/dashboard/campaign-drilldown.tsx`<br>`src/lib/campaign-diagnostics.ts` |
| `type` | `none` | compara | `src/components/ui/chart.tsx` |
| `type` | `openUrl` | compara | `src/routes/_authenticated/library.tsx` |
| `type` | `phone` | compara | `src/lib/lead-forms.ts`<br>`src/routes/f.$slug.tsx` |
| `type` | `reply` | escreve | `src/routes/_authenticated/library.tsx` |
| `type` | `rich_card` | escreve | `src/integrations/external/singu.server.ts`<br>`src/routes/_authenticated/library.tsx` |
| `type` | `select` | compara | `src/components/forms/LeadFieldEditor.tsx`<br>`src/lib/lead-forms.ts`<br>`src/routes/f.$slug.tsx` |
| `type` | `spacer` | compara, escreve | `src/components/email/EmailBlockEditor.tsx`<br>`src/lib/email-blocks.ts` |
| `type` | `text` | compara, escreve | `src/components/email/EmailBlockEditor.tsx`<br>`src/lib/email-blocks.ts`<br>`src/lib/email-preflight.ts`<br>`src/lib/lead-forms.ts`<br>`src/routes/_authenticated/forms.$id.tsx` |
| `type` | `textarea` | compara | `src/routes/f.$slug.tsx` |
| `type` | `warning` | compara, escreve | `src/components/dashboard/campaign-drilldown.tsx`<br>`src/lib/campaign-diagnostics.ts` |
| `type` | `whatsapp` | escreve | `src/integrations/external/singu.server.ts` |
| `status` | `active` | compara, escreve | `src/lib/journeys.functions.ts`<br>`src/lib/orchestrator.functions.ts`<br>`src/routes/_authenticated/journeys.$id.tsx`<br>`src/routes/_authenticated/journeys.tsx`<br>`src/routes/api/public/hooks/tick-journeys.ts` |
| `status` | `archived` | filtra | `src/lib/journeys.functions.ts`<br>`src/lib/lead-forms.functions.ts` |
| `status` | `bounced` | compara | `src/lib/ops.functions.ts` |
| `status` | `complaint` | compara | `src/lib/ops.functions.ts` |
| `status` | `completed` | compara, escreve | `src/lib/marketing.functions.ts`<br>`src/routes/api/public/hooks/tick-marketing.ts` |
| `status` | `confirmed` | compara, escreve | `src/lib/lead-forms.server.ts` |
| `status` | `dead_letter` | compara, escreve | `src/lib/analytics-aggregate.ts`<br>`src/routes/api/public/hooks/tick-cadence.ts` |
| `status` | `delivered` | compara | `src/lib/analytics-aggregate.ts` |
| `status` | `disabled` | compara, escreve | `src/components/ops/budget-guardrails.tsx`<br>`src/lib/budget-guard.ts`<br>`src/lib/budget-reallocation.ts`<br>`src/lib/campaign-cost.ts`<br>`src/lib/ops-alerts.ts` |
| `status` | `discarded` | escreve | `src/lib/lead-forms.server.ts` |
| `status` | `draft` | escreve, filtra | `src/lib/orchestrator.functions.ts`<br>`src/routes/_authenticated/forms.tsx` |
| `status` | `exhausted` | compara, escreve | `src/lib/budget-guard.ts`<br>`src/lib/budget-reallocation.ts`<br>`src/lib/campaign-cost.ts`<br>`src/lib/ops-alerts.ts` |
| `status` | `failed` | compara, escreve | `src/integrations/social/types.ts`<br>`src/lib/analytics-aggregate.ts`<br>`src/lib/journey-dispatch.server.ts`<br>`src/lib/orchestrator.functions.ts`<br>`src/routes/api/public/agent-tools/send-message.ts`<br>… +3 |
| `status` | `fulfilled` | compara | `src/lib/orchestrator.functions.ts` |
| `status` | `ignored` | compara, escreve | `src/lib/lead-forms.server.ts`<br>`src/routes/f.$slug.tsx` |
| `status` | `ok` | escreve | `src/lib/budget-guard.ts`<br>`src/lib/campaign-cost.ts`<br>`src/lib/ops-alerts.ts` |
| `status` | `opt_in` | compara, escreve | `src/lib/audience-resolver.server.ts`<br>`src/lib/lead-forms.server.ts`<br>`src/routes/_authenticated/contacts.$id.tsx` |
| `status` | `opt_out` | escreve | `src/routes/api/public/unsubscribe.tsx`<br>`src/routes/api/public/webhooks/fuxico.ts`<br>`src/routes/api/public/webhooks/singu-bounce.ts`<br>`src/routes/api/public/webhooks/singu.ts` |
| `status` | `opted_in` | filtra | `src/lib/ops.functions.ts` |
| `status` | `opted_out` | filtra | `src/lib/ops.functions.ts` |
| `status` | `paused` | compara, escreve | `src/routes/_authenticated/journeys.tsx` |
| `status` | `pending` | compara, escreve | `src/lib/lead-forms.functions.ts`<br>`src/lib/lead-forms.server.ts`<br>`src/routes/f.$slug.tsx` |
| `status` | `pending_approval` | escreve, filtra | `src/lib/orchestrator.functions.ts`<br>`src/routes/api/public/hooks/tick-cadence.ts`<br>`src/routes/api/public/hooks/tick-marketing.ts` |
| `status` | `pending_provider` | escreve | `src/integrations/social/types.ts`<br>`src/routes/api/public/agent-tools/send-message.ts` |
| `status` | `published` | compara, filtra | `src/lib/lead-forms.functions.ts`<br>`src/lib/lead-forms.server.ts`<br>`src/routes/_authenticated/forms.tsx` |
| `status` | `queued` | escreve, filtra | `src/lib/orchestrator.functions.ts`<br>`src/routes/api/public/hooks/tick-cadence.ts`<br>`src/routes/api/public/hooks/tick-marketing.ts` |
| `status` | `read` | compara | `src/lib/analytics-aggregate.ts` |
| `status` | `replied` | compara | `src/lib/analytics-aggregate.ts` |
| `status` | `running` | compara, escreve, filtra | `src/lib/marketing.functions.ts`<br>`src/routes/_authenticated/campaigns.$id.tsx`<br>`src/routes/api/public/hooks/tick-marketing.ts` |
| `status` | `scheduled` | compara | `src/routes/api/public/hooks/tick-marketing.ts` |
| `status` | `sent` | compara, escreve | `src/integrations/social/types.ts`<br>`src/lib/journey-dispatch.server.ts`<br>`src/lib/marketing.functions.ts`<br>`src/lib/orchestrator.functions.ts`<br>`src/lib/templates.functions.ts`<br>… +3 |
| `status` | `skipped` | escreve | `src/lib/journey-dispatch.server.ts` |
| `status` | `warning` | compara, escreve | `src/lib/budget-guard.ts`<br>`src/lib/ops-alerts.ts` |
| `role` | `Orquestrador` | escreve | `src/routes/index.tsx` |
| `role` | `donor` | compara, escreve | `src/components/ops/budget-reallocation.tsx`<br>`src/lib/budget-reallocation.ts` |
| `state` | `active` | compara, escreve, filtra | `src/lib/journeys.functions.ts`<br>`src/lib/lead-forms.server.ts`<br>`src/routes/api/public/hooks/tick-journeys.ts` |
| `state` | `collapsed` | compara | `src/components/ui/sidebar.tsx` |
| `state` | `completed` | escreve | `src/routes/api/public/hooks/tick-cadence.ts`<br>`src/routes/api/public/hooks/tick-journeys.ts` |
| `state` | `dead_letter` | compara, escreve, filtra | `src/lib/analytics.functions.ts`<br>`src/lib/ops-recovery.server.ts`<br>`src/lib/ops.functions.ts`<br>`src/routes/api/public/hooks/tick-cadence.ts` |
| `state` | `expanded` | escreve | `src/components/ui/sidebar.tsx` |
| `state` | `failed` | compara, escreve | `src/lib/analytics.functions.ts`<br>`src/routes/api/public/hooks/tick-journeys.ts`<br>`src/routes/api/public/hooks/tick-marketing.ts` |
| `state` | `pending_approval` | escreve | `src/routes/api/public/hooks/tick-marketing.ts` |
| `state` | `queued` | escreve, filtra | `src/lib/marketing.functions.ts`<br>`src/lib/ops-recovery.server.ts`<br>`src/lib/ops.functions.ts`<br>`src/routes/api/public/hooks/tick-cadence.ts`<br>`src/routes/api/public/hooks/tick-marketing.ts` |
| `state` | `running` | escreve | `src/routes/api/public/hooks/tick-cadence.ts` |
| `state` | `sending` | escreve | `src/routes/api/public/hooks/tick-marketing.ts` |
| `state` | `sent` | escreve, filtra | `src/routes/api/public/hooks/tick-marketing.ts` |
| `state` | `skipped` | escreve, filtra | `src/routes/api/public/hooks/alert-sweep.ts`<br>`src/routes/api/public/hooks/tick-marketing.ts` |
| `state` | `stopped` | escreve, filtra | `src/routes/api/public/hooks/alert-sweep.ts`<br>`src/routes/api/public/hooks/tick-cadence.ts` |
| `state` | `waiting` | compara, escreve | `src/lib/journeys.functions.ts`<br>`src/routes/api/public/hooks/tick-journeys.ts` |
| `sm_campaign_status` | `draft` | escreve | `src/integrations/supabase/types.ts` |
| `sm_event_status` | `received` | escreve | `src/integrations/supabase/types.ts` |
| `sm_journey_status` | `draft` | escreve | `src/integrations/supabase/types.ts` |
| `stage` | `Entregue` | compara | `src/lib/campaign-diagnostics.ts` |
| `stage` | `Entregues` | escreve | `src/lib/analytics-aggregate.ts` |
| `stage` | `Enviadas` | escreve | `src/lib/analytics-aggregate.ts` |
| `stage` | `Enviado` | compara | `src/lib/campaign-diagnostics.ts` |
| `stage` | `Enviados` | escreve | `src/lib/analytics-aggregate.ts` |
| `stage` | `Falhas` | escreve | `src/lib/analytics-aggregate.ts` |
| `stage` | `Fila` | escreve | `src/lib/analytics-aggregate.ts` |
| `stage` | `Materializados` | escreve | `src/lib/analytics-aggregate.ts` |
| `stage` | `Respondidas` | escreve | `src/lib/analytics-aggregate.ts` |
| `stage` | `Respondidos` | escreve | `src/lib/analytics-aggregate.ts` |
| `step` | `config` | escreve | `src/lib/deliverability.functions.ts` |
| `step` | `verify` | escreve | `src/lib/deliverability.functions.ts` |
| `step` | `webhook` | escreve | `src/lib/deliverability.functions.ts` |
| `from_state` | `dead_letter` | escreve | `src/lib/ops-recovery.server.ts` |
| `to_state` | `queued` | escreve | `src/lib/ops-recovery.server.ts` |

### E.4 Enums e listas de valores

| Nome | Valores | Onde |
|---|---|---|
| app_role | `admin`, `operator`, `viewer` | banco |
| sm_source | `lux`, `singu`, `fatorx`, `manual`, `fuxico` | banco |
| sm_channel | `linkedin`, `whatsapp`, `email`, `sms`, `instagram`, `rcs`, `mms` | banco |
| sm_event_status | `received`, `processing`, `processed`, `error`, `ignored` | banco |
| sm_direction | `outbound`, `inbound` | banco |
| sm_campaign_status | `draft`, `active`, `paused`, `archived` | banco |
| sm_touchpoint_status | `queued`, `sent`, `delivered`, `read`, `replied`, `failed`, `opted_out`, `dead_letter`, `pending_approval` | banco |
| sm_target_state | `queued`, `running`, `paused`, `replied`, `stopped`, `lost`, `completed`, `dead_letter` | banco |
| sm_cadence_preset | `aggressive`, `standard`, `enterprise`, `custom` | banco |
| sm_journey_status | `draft`, `active`, `paused`, `archived` | banco |
| sm_journey_node_kind | `trigger`, `send`, `wait`, `condition`, `split`, `goal`, `exit` | banco |
| sm_enrollment_state | `active`, `waiting`, `completed`, `exited`, `goal_reached`, `failed` | banco |
| sm_compliance_niche | `geral`, `saude`, `financeiro`, `juridico`, `apostas`, `suplementos`, `custom` | banco |
| sm_compliance_severity | `error`, `warning`, `info` | banco |
| MetricAccent | cyan \| purple \| lime \| pink \| amber | `src/components/metric-card.tsx` |
| ExternalSystem | lux \| singu \| fatorx \| fuxico | `src/integrations/external/config.server.ts` |
| SinguChannel | whatsapp \| email \| sms | `src/integrations/external/singu.server.ts` |
| SocialChannel | linkedin \| instagram | `src/integrations/social/types.ts` |
| CHANNELS | "whatsapp", "email", "sms", "rcs", "mms", "linkedin", "instagram", | `src/lib/audience-rules.ts` |
| BudgetStatus | ok \| warning \| exhausted \| disabled | `src/lib/budget-guard.ts` |
| ScheduleDecisionCode | apply \| no_plan \| cooldown \| below_min_moved \| exceeds_max_share | `src/lib/budget-reallocation-schedule.ts` |
| SOCIAL_CHANNELS | "linkedin", "instagram" | `src/lib/cadence-engine.ts` |
| PreflightVerdict | ok \| warning \| blocked | `src/lib/campaign-cost.ts` |
| ComplianceSeverity | error \| warning \| info | `src/lib/compliance-terms.ts` |
| ComplianceNiche | geral \| saude \| financeiro \| juridico \| apostas \| suplementos | `src/lib/compliance-terms.ts` |
| CostChannel | whatsapp \| sms \| mms \| rcs \| email \| linkedin \| instagram | `src/lib/cost-model.ts` |
| Align | left \| center \| right | `src/lib/email-blocks.ts` |
| PreflightSeverity | error \| warning \| info | `src/lib/email-preflight.ts` |
| JourneyNodeKind | trigger \| send \| wait \| condition \| split \| goal \| exit | `src/lib/journey-engine.ts` |
| ConditionOp | eq \| neq \| contains \| not_contains \| gt \| gte \| lt \| lte \| exists \| not_exists \| in | `src/lib/journey-engine.ts` |
| JOURNEY_NODE_KINDS | "trigger", "send", "wait", "condition", "split", "goal", "exit", | `src/lib/journey-graph.ts` |
| JOURNEY_STATUSES | "draft", "active", "paused", "archived" | `src/lib/journey-graph.ts` |
| EnrollmentBlockCode | ok \| journey_inactive \| already_enrolled \| reentry_blocked \| cooldown \| entry_cap \| no_consent | `src/lib/journey-triggers.ts` |
| TRIGGER_SOURCES | "lux", "singu", "fatorx", "fuxico", "promo", "manual" | `src/lib/journey-triggers.ts` |
| LEAD_FIELD_TYPES | "text", "email", "phone", "textarea", "select", "checkbox", | `src/lib/lead-forms.ts` |
| LEAD_FORM_STATUSES | "draft", "published", "archived" | `src/lib/lead-forms.ts` |
| MessageSeverity | error \| warning \| info | `src/lib/message-preflight.ts` |
| AlertLevel | critical \| warning | `src/lib/ops-alerts.ts` |
| AUDIT_PERIODS | 1, 7, 30, 90 | `src/lib/ops-audit.server.ts` |
| Sentiment | positive \| neutral \| negative | `src/lib/sentiment.ts` |
| ReplyPriority | hot \| warm \| cold \| blocked \| unknown | `src/lib/sentiment.ts` |

## F. Validações de entrada

### F.1 Schemas Zod

- **audienceRulesSchema** (`src/lib/audience-rules.ts`, z.object):
  ```ts
  { /** company | person — vazio significa todos. */ kinds: z.array(z.enum(["company", "person"])).default([]), /** Busca textual no nome de exibição. */ search: z.string().max(120).default(""), /** Setores (metadata.industry) — vazio significa todos. */ industries: z.array(z.string().min(1)).default([]), /** Score mínimo de sinal (decaimento exponencial já aplicado na view). */ min_signal_score: z.number().min(0).max(1000).default(0), /** Exige consentimento válido no canal informado. */ require_consent_channel: z.enum(CHANNELS).optional(), /** Só quem teve algum toque nos últimos N dias (0 = ignora). */ engaged_within_days: z.number().int().min(0).max(365).default(0), /** Exclui quem recebeu contato nas últimas N horas (0 = ignora). */ exclude_contacted_hours: z.number().int().min(0).max(2 …
  ```
- **nicheEnum** (`src/lib/compliance.functions.ts`, z.enum):
  ```ts
  [ "geral", "saude", "financeiro", "juridico", "apostas", "suplementos", "custom", ]
  ```
- **severityEnum** (`src/lib/compliance.functions.ts`, z.enum):
  ```ts
  ["error", "warning", "info"]
  ```
- **journeySettingsSchema** (`src/lib/journey-graph.ts`, z.object):
  ```ts
  { name: z.string().trim().min(2, "Dê um nome à jornada").max(120), description: z.string().trim().max(500).nullable().default(null), requires_human_approval: z.boolean().default(false), allow_reentry: z.boolean().default(false), entry_daily_cap: z.number().int().min(0).max(100_000).default(200), send_window_start: z.number().int().min(0).max(23).default(0), send_window_end: z.number().int().min(1).max(24).default(24), }
  ```
- **journeyNodeSchema** (`src/lib/journey-graph.ts`, z.object):
  ```ts
  { id: z.string().min(1), kind: z.enum(JOURNEY_NODE_KINDS), label: z.string().trim().max(120).default(""), position_x: z.number().finite().default(0), position_y: z.number().finite().default(0), config: z.record(z.string(), z.unknown()).default({}), }
  ```
- **journeyEdgeSchema** (`src/lib/journey-graph.ts`, z.object):
  ```ts
  { from_node_id: z.string().min(1), to_node_id: z.string().min(1), branch: z.string().trim().min(1).max(40).default("default"), ordinal: z.number().int().min(0).max(999).default(0), }
  ```
- **journeyGraphSchema** (`src/lib/journey-graph.ts`, z.object):
  ```ts
  { id: z.string().uuid(), settings: journeySettingsSchema, nodes: z.array(journeyNodeSchema).max(200), edges: z.array(journeyEdgeSchema).max(400), }
  ```
- **slugInput** (`src/lib/lead-forms.functions.ts`, z.object):
  ```ts
  { slug: z.string().min(2).max(63) }
  ```
- **leadFieldSchema** (`src/lib/lead-forms.ts`, z.object):
  ```ts
  { key: z .string() .min(1) .max(40) .regex(/^[a-z][a-z0-9_]*$/, "Use apenas letras minúsculas, números e _"), label: z.string().min(1).max(120), type: z.enum(LEAD_FIELD_TYPES), required: z.boolean().default(false), placeholder: z.string().max(120).optional(), options: z.array(z.string().min(1).max(80)).default([]), }
  ```
- **leadFormSchema** (`src/lib/lead-forms.ts`, z.object):
  ```ts
  { name: z.string().min(1, "Informe um nome").max(120), slug: z .string() .regex(/^[a-z0-9][a-z0-9-]{1,62}$/, "Endereço inválido (use letras minúsculas, números e -)"), title: z.string().max(160).default(""), description: z.string().max(600).nullable().default(null), fields: z.array(leadFieldSchema).min(1, "Adicione ao menos um campo").max(20), submit_label: z.string().min(1).max(40).default("Enviar"), success_message: z.string().min(1).max(400).default("Recebemos seus dados. Obrigado!"), consent_text: z.string().min(1).max(600), double_opt_in: z.boolean().default(true), confirm_ttl_hours: z.number().int().min(1).max(720).default(48), channel: z .enum(["email", "whatsapp", "sms", "rcs", "mms", "linkedin", "instagram"]) .default("email"), journey_id: z.string().uuid().nullable().default(null …
  ```
- **channelEnum** (`src/lib/marketing.functions.ts`, z.enum):
  ```ts
  CHANNELS
  ```
- **variantSchema** (`src/lib/marketing.functions.ts`, z.object):
  ```ts
  { label: z.string().min(1).max(8), subject: z.string().max(200).nullish(), body: z.string().min(1).max(4000), media_url: z.string().url().nullish(), rcs_payload: z.record(z.string(), z.unknown()).nullish(), split_percent: z.number().int().min(0).max(100), }
  ```
- **RcsPayload** (`src/lib/templates.functions.ts`, z.object):
  ```ts
  { type: z.literal("rich_card").default("rich_card"), title: z.string().max(200).optional(), description: z.string().max(2000).optional(), image_url: z.string().url().optional(), suggestions: z .array( z.object({ type: z.enum(["reply", "openUrl", "dial"]), text: z.string().min(1).max(25), url: z.string().url().optional(), phone: z.string().optional(), }), ) .max(4) .default([]), }
  ```
- **BaseTemplate** (`src/lib/templates.functions.ts`, z.object):
  ```ts
  { name: z.string().trim().min(1).max(120), channel: z.enum(CHANNELS), subject: z.string().trim().max(200).nullish(), body: z.string().trim().min(1).max(4000), media_url: z.string().url().nullish(), rcs_payload: RcsPayload.nullish(), email_blocks: z.array(z.record(z.string(), z.unknown())).max(60).nullish(), variables: z.array(z.string()).default([]).optional(), }
  ```
- **searchSchema** (`src/routes/_authenticated/companies.$id.tsx`, z.object):
  ```ts
  { name: z.string().optional() }
  ```
- **Schema** (`src/routes/api/public/agent-tools/send-message.ts`, z.object):
  ```ts
  { entity_id: z.string().uuid(), channel: z.enum(["whatsapp", "sms", "mms", "rcs", "email", "linkedin", "instagram"]), message: z.string().min(1), campaign_id: z.string().uuid().optional(), fatorx_thread_id: z.string().optional(), sequence_id: z.string().optional(), media_url: z.string().url().optional(), rcs_payload: z.record(z.string(), z.unknown()).optional(), }
  ```
- **FatorxEventSchema** (`src/routes/api/public/webhooks/fatorx.ts`, z.object):
  ```ts
  { event_type: z.string().min(1), external_id: z.string().optional(), payload: z.record(z.unknown()).default({}), }
  ```
- **Schema** (`src/routes/api/public/webhooks/fuxico.ts`, z.object):
  ```ts
  { event: z.string().min(1), timestamp: z.string().optional(), data: z.record(z.unknown()).default({}), metadata: z.record(z.unknown()).optional(), }
  ```
- **LuxEventSchema** (`src/routes/api/public/webhooks/lux.ts`, z.object):
  ```ts
  { event_type: z.string().min(1), external_id: z.string().optional(), payload: z.record(z.unknown()).default({}), }
  ```
- **Schema** (`src/routes/api/public/webhooks/singu-bounce.ts`, z.object):
  ```ts
  { event_type: z.enum(["hard_bounce", "soft_bounce", "complaint", "unsubscribe"]), external_id: z.string().optional(), touchpoint_id: z.string().uuid().optional(), contact_id: z.string().optional(), provider: z.string().default("singu"), raw: z.record(z.unknown()).default({}), }
  ```
- **SinguEventSchema** (`src/routes/api/public/webhooks/singu.ts`, z.object):
  ```ts
  { event_type: z.string().min(1), external_id: z.string().optional(), payload: z.record(z.unknown()).default({}), }
  ```

### F.2 react-hook-form (register/rules)

_nenhum item encontrado_

### F.3 Restrições em inputs HTML (required/min/max/pattern)

| Campo | Restrições | Arquivo |
|---|---|---|
| `score` | type=number, min=0, min | `src/components/audience-rule-builder.tsx` |
| `engaged` | type=number, min=0 | `src/components/audience-rule-builder.tsx` |
| `cooldown` | type=number, min=0 | `src/components/audience-rule-builder.tsx` |
| `limit` | type=number, min=1, max=5000 | `src/components/audience-rule-builder.tsx` |
| `ct-term` | max | `src/components/compliance-terms-manager.tsx` |
| `ct-reason` | max | `src/components/compliance-terms-manager.tsx` |
| `window-start` | type=number, min=0, max=23 | `src/components/journeys/journey-settings-card.tsx` |
| `window-end` | type=number, min=1, max=24 | `src/components/journeys/journey-settings-card.tsx` |
| `entry-cap` | type=number, min=0 | `src/components/journeys/journey-settings-card.tsx` |
| `email` | type=email | `src/routes/auth.tsx` |
| `password` | type=password | `src/routes/auth.tsx` |
| `cap` | type=number, min=1 | `src/routes/_authenticated/campaigns.$id.tsx` |
| `ttl` | type=number, min=1, max=720 | `src/routes/_authenticated/forms.$id.tsx` |

## G. Fórmulas e derivações (como valores são calculados)

### G.1 Colunas calculadas no banco

| Tabela | Coluna | Expressão |
|---|---|---|
| `channel_roi_stats` | `cac_brl` | `CASE WHEN total_conversions > 0 THEN total_spent_brl / total_conversions ELSE NULL END` |
| `channel_roi_stats` | `conversion_rate` | `CASE WHEN total_messages_sent > 0 THEN (total_conversions::DECIMAL / total_messages_sent) * 100 ELSE 0 END` |

### G.2 Views (consultas derivadas)

| View | SELECT |
|---|---|
| `v_contact_profiles` | `SELECT em.id AS entity_id, em.kind, em.display_name, em.lux_id, em.singu_id, em.fatorx_thread_id, em.metadata, em.created_at, public.signal_score(em.id) AS signal_score, (SELECT count(*) FROM public.contact_touchpoints t WHERE t.entity_id = em.id) AS touchpoint_count, (SELECT count(*) FROM public.co …` |

### G.3 Funções de cálculo/decisão no código

- **invalidate()** — `src/components/compliance-terms-manager.tsx`
  ```
  qc.invalidateQueries({ queryKey: ["compliance-terms"] });
  ```
- **buildTotals(rows: TouchpointRow[])** — `src/lib/analytics-aggregate.ts`
  ```
  let sent = 0; let replies = 0; let failed = 0; for (const row of rows) { if (row.direction === "inbound") replies += 1; else if (row.status === "failed" || row.status === "dead_letter") failed += 1; else sent += 1; } return { sent, replies, failed, reply_rate: sent > 0 ? (replies / sent) * 100 : 0 };
  ```
- **round2(n: number)** — `src/lib/budget-guard.ts`
  ```
  Math.round(n * 100) / 100;
  ```
- **round2(n: number)** — `src/lib/budget-reallocation.ts`
  ```
  Math.round(n * 100) / 100;
  ```
- **round2(n: number)** — `src/lib/campaign-cost.ts`
  ```
  Math.round(n * 100) / 100;
  ```
- **round4(n: number)** — `src/lib/campaign-cost.ts`
  ```
  Math.round(n * 10_000) / 10_000;
  ```
- **scoreEmojis(text: string, frequency: Map<string, number>,)** — `src/lib/campaign-diagnostics.ts`
  ```
  positive: number; negative: number; neutral: number
  ```
- **validateCampaign(input: CampaignForValidation)** — `src/lib/campaign-validation.ts`
  ```
  const issues: ValidationIssue[] = []; const { channel, variants } = input; if (!input.name.trim()) { issues.push({ level: "error", scope: "Campanha", message: "Dê um nome à campanha." }); } if (!input.audience_id) { issues.push({ level: "error", scope: "Audiência", message: "Selecione uma audiência antes de lançar.", }); } else if (input.audience_size === 0) { issues.push({ level: "error", scope: "Audiência", message: "A audiência selecionada está vazia — atualize os membros.", }); } if (variant …
  ```
- **round2(n: number)** — `src/lib/cost-model.ts`
  ```
  Math.round(n * 100) / 100;
  ```
- **round4(n: number)** — `src/lib/cost-model.ts`
  ```
  Math.round(n * 10000) / 10000;
  ```
- **validateBlocks(blocks: EmailBlock[])** — `src/lib/email-blocks.ts`
  ```
  const issues: BlockIssue[] = []; if (blocks.length === 0) { issues.push({ blockId: "", message: "Adicione ao menos um bloco ao e-mail." }); } const seen = new Set<string>(); for (const block of blocks) { if (seen.has(block.id)) { issues.push({ blockId: block.id, message: "ID de bloco duplicado." }); } seen.add(block.id); switch (block.type) { case "heading": case "text": if (!block.text.trim()) issues.push({ blockId: block.id, message: "Texto vazio." }); break; case "button": if (!block.text.tri …
  ```
- **scoreLabel(score: number)** — `src/lib/email-preflight.ts`
  ```
  if (score >= 90) return "excelente"; if (score >= 70) return "bom"; if (score >= 45) return "atenção"; return "crítico";
  ```
- **validateJourney(nodes: JourneyNode[], edges: JourneyEdge[])** — `src/lib/journey-engine.ts`
  ```
  const issues: JourneyIssue[] = []; const triggers = nodes.filter((n) => n.kind === "trigger"); if (triggers.length === 0) issues.push({ level: "error", message: "A jornada precisa de um gatilho." }); if (triggers.length > 1) issues.push({ level: "error", message: "A jornada só pode ter um gatilho de entrada." }); const byId = new Map(nodes.map((n) => [n.id, n])); const hasOutgoing = (id: string) => edges.some((e) => e.from_node_id === id); const hasIncoming = (id: string) => edges.some((e) => e. …
  ```
- **validateGraphInput(graph: JourneyGraphInput)** — `src/lib/journey-graph.ts`
  ```
  const issues = validateJourney(toEngineNodes(graph.nodes), toEngineEdges(graph.edges)); for (const node of graph.nodes) { const allowed = branchesForKind(node.kind, node.config); for (const edge of graph.edges.filter((e) => e.from_node_id === node.id)) { if (allowed.length === 0) { issues.push({ level: "error", nodeId: node.id, message: `A etapa "${node.label || node.kind}" é terminal e não pode ter saída.`, }); } else if (!allowed.includes(edge.branch)) { issues.push({ level: "error", nodeId: n …
  ```
- **validateSubmission(fields: LeadField[], raw: Record<string, unknown>, consentGiven: boolean,)** — `src/lib/lead-forms.ts`
  ```
  const errors: Record<string, string> = {}; const values: Record<string, string | boolean> = {}; const isBot = typeof raw[HONEYPOT_KEY] === "string" && raw[HONEYPOT_KEY] !== ""; for (const field of fields) { const input = raw[field.key]; if (field.type === "checkbox") { const checked = input === true || input === "true" || input === "on"; if (field.required && !checked) errors[field.key] = "Campo obrigatório"; values[field.key] = checked; continue; } const text = typeof input === "string" ? input …
  ```
- **computeReplyPriority(signalScore: number, sentiment: LeadSentimentSummary,)** — `src/lib/sentiment.ts`
  ```
  priority: ReplyPriority; probability: number; label: string
  ```
- **applyTemplate(idx: number, tpl: PickedTemplate)** — `src/routes/_authenticated/campaigns.$id.tsx`
  ```
  updateVariant(idx, { body: tpl.body, subject: tpl.subject ?? undefined, media_url: tpl.media_url ?? undefined, }); toast.success(`Template "${tpl.name}" aplicado à variante ${variants[idx]?.label ?? ""}`);
  ```

### G.4 Percentuais e multiplicadores no código

| Trecho | Arquivo |
|---|---|
| `<span>+12% vs mês anterior</span>` | `src/components/dashboard/churn-risk-widget.tsx` |
| `* 4. >= 80% de qualquer teto → alerta` | `src/lib/budget-guard.ts` |
| `* 70% do teto ocioso. O orçamento agregado do dia sobrou, mas o pipeline parou.` | `src/lib/budget-reallocation.ts` |
| `* 3. estimativa consome ≥ 80% do saldo diário → `warning`` | `src/lib/campaign-cost.ts` |
| `} else if (htmlBytes > GMAIL_CLIP_BYTES * 0.8) {` | `src/lib/email-preflight.ts` |
| `severity: untracked === 0 ? "ok" : untracked > sends * 0.1 ? "error" : "warning",` | `src/lib/tracking-integrity.ts` |

## H. Parâmetros de negócio (constantes, prazos, limites)

### H.1 Constantes

| Constante | Valor | Arquivo |
|---|---|---|
| `DUMP` | `".contexto-compartilhado/dump-arquitetura.json"` | `.claude/hooks/pre-tool-index-guard.mjs` |
| `MAX_ACHADOS` | `6` | `.claude/hooks/pre-tool-index-guard.mjs` |
| `SIDEBAR_COOKIE_MAX_AGE` | `60` | `src/components/ui/sidebar.tsx` |
| `SIDEBAR_WIDTH` | `"16rem"` | `src/components/ui/sidebar.tsx` |
| `SIDEBAR_WIDTH_MOBILE` | `"18rem"` | `src/components/ui/sidebar.tsx` |
| `MOBILE_BREAKPOINT` | `768` | `src/hooks/use-mobile.tsx` |
| `REMINDER_COOLDOWN_MS` | `4` | `src/lib/alert-dispatch.ts` |
| `CHUNK` | `200` | `src/lib/analytics.functions.ts` |
| `BUDGET_WARNING_THRESHOLD` | `0.8` | `src/lib/budget-guard.ts` |
| `BUDGET_DEFER_MS` | `60` | `src/lib/budget-guard.ts` |
| `DONOR_MAX_USAGE` | `0.5` | `src/lib/budget-reallocation.ts` |
| `DONOR_SAFETY_USAGE` | `0.7` | `src/lib/budget-reallocation.ts` |
| `RECEIVER_TARGET_USAGE` | `0.75` | `src/lib/budget-reallocation.ts` |
| `MIN_TRANSFER_BRL` | `1` | `src/lib/budget-reallocation.ts` |
| `BUDGET_PAGE_SIZE` | `1` | `src/lib/budget.server.ts` |
| `BUDGET_MAX_ROWS` | `100` | `src/lib/budget.server.ts` |
| `COOLDOWN_DEFER_MS` | `24` | `src/lib/cadence-engine.ts` |
| `EMAIL_CAP_DEFER_MS` | `3` | `src/lib/cadence-engine.ts` |
| `BUDGET_DEFER_MS` | `3` | `src/lib/cadence-engine.ts` |
| `NEGATIVE_THRESHOLD_CRITICAL` | `35` | `src/lib/campaign-diagnostics.ts` |
| `NEGATIVE_THRESHOLD_WARNING` | `20` | `src/lib/campaign-diagnostics.ts` |
| `POSITIVE_THRESHOLD_FOR_SCALING` | `60` | `src/lib/campaign-diagnostics.ts` |
| `GMAIL_CLIP_BYTES` | `102` | `src/lib/email-preflight.ts` |
| `TTL_MS` | `5` | `src/lib/error-capture.ts` |
| `DEFAULT_BRANCH` | `"default"` | `src/lib/journey-engine.ts` |
| `TRUE_BRANCH` | `"true"` | `src/lib/journey-engine.ts` |
| `FALSE_BRANCH` | `"false"` | `src/lib/journey-engine.ts` |
| `BUDGET_DEFER_MS` | `3` | `src/lib/journey-engine.ts` |
| `MAX_WAIT_MS` | `30` | `src/lib/journey-engine.ts` |
| `WHITE` | `0` | `src/lib/journey-engine.ts` |
| `GRAY` | `1` | `src/lib/journey-engine.ts` |
| `BLACK` | `2` | `src/lib/journey-engine.ts` |
| `CONSENT_BLOCK_WARN_RATE` | `10` | `src/lib/ops-alerts.ts` |
| `CONSENT_BLOCK_CRITICAL_RATE` | `25` | `src/lib/ops-alerts.ts` |
| `TRACKING_COVERAGE_FLOOR` | `90` | `src/lib/ops-alerts.ts` |
| `MIN_SAMPLE` | `20` | `src/lib/ops-alerts.ts` |
| `AUDIT_DEFAULT_LIMIT` | `25` | `src/lib/ops-audit.server.ts` |
| `AUDIT_MAX_LIMIT` | `200` | `src/lib/ops-audit.server.ts` |
| `AUDIT_EXPORT_PAGE_SIZE` | `200` | `src/lib/ops-audit.server.ts` |
| `AUDIT_EXPORT_MAX_ROWS` | `5` | `src/lib/ops-audit.server.ts` |
| `DEAD_LETTER_REQUEUE_LIMIT` | `100` | `src/lib/ops-recovery.server.ts` |
| `SPEND_PAGE_SIZE` | `1` | `src/lib/ops-spend.server.ts` |
| `SPEND_MAX_ROWS` | `50` | `src/lib/ops-spend.server.ts` |
| `SPEND_DEFAULT_DAYS` | `30` | `src/lib/ops-spend.server.ts` |
| `GSM7_BASIC` | `"@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"` | `src/lib/sms-segments.ts` |
| `GSM7_EXT` | `"^{}\\[~]\|€"` | `src/lib/sms-segments.ts` |
| `REDELIVERY_WINDOW_MS` | `60` | `src/lib/tracking-integrity.ts` |
| `BATCH_SIZE` | `25` | `src/routes/api/public/hooks/tick-journeys.ts` |
| `MAX_HOPS` | `20` | `src/routes/api/public/hooks/tick-journeys.ts` |
| `LOCK_MS` | `5` | `src/routes/api/public/hooks/tick-journeys.ts` |
| `BATCH_SIZE` | `50` | `src/routes/api/public/hooks/tick-marketing.ts` |

### H.2 Prazos, expirações e janelas de tempo

| Trecho | Arquivo |
|---|---|
| `export const REMINDER_COOLDOWN_MS = 4 * 60 * 60 * 1000;` | `src/lib/alert-dispatch.ts` |
| `let skipped_cooldown = 0;` | `src/routes/api/public/hooks/tick-cadence.ts` |
| `reset_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('day', now()) + interval '1 day'),` | `supabase/migrations/20260720132748_c10bc4b1-46bf-443c-b928-95e2a2291cb7.sql` |
| `(SELECT COUNT(*) FROM public.contact_touchpoints WHERE direction = 'inbound' AND created_at > now() - interval '24 hours') AS replies_24h,` | `supabase/migrations/20260722200744_56c3243d-ab3f-4259-a248-8929ccff9018.sql` |
| `(SELECT COUNT(*) FROM public.contact_touchpoints WHERE direction = 'outbound' AND created_at > now() - interval '24 hours') AS sent_24h,` | `supabase/migrations/20260722200744_56c3243d-ab3f-4259-a248-8929ccff9018.sql` |
| `(SELECT COUNT(DISTINCT entity_id) FROM public.consent_ledger WHERE status = 'opt_out' AND created_at > now() - interval '7 days') AS opt_outs_7d,` | `supabase/migrations/20260722200744_56c3243d-ab3f-4259-a248-8929ccff9018.sql` |
| `$$DELETE FROM public.campaign_target_events WHERE created_at < now() - interval '90 days'$$` | `supabase/migrations/20260726170010_e45b5b84-b961-4a56-ba55-c7a6065a1c74.sql` |

### H.3 Limites de paginação

| Limite | Arquivo |
|---|---|
| 20000 | `src/lib/analytics.functions.ts` |
| 100 | `src/lib/audiences.functions.ts` |
| 200 | `src/lib/audiences.functions.ts` |
| 20 | `src/lib/churn.functions.ts` |
| 500 | `src/lib/compliance.server.ts` |
| 20000 | `src/lib/deliverability.functions.ts` |
| 5000 | `src/lib/deliverability.functions.ts` |
| 50000 | `src/lib/deliverability.functions.ts` |
| 100 | `src/lib/journeys.functions.ts` |
| 50 | `src/lib/journeys.functions.ts` |
| 5000 | `src/lib/journeys.functions.ts` |
| 100 | `src/lib/lead-forms.functions.ts` |
| 50 | `src/lib/lead-forms.functions.ts` |
| 1 | `src/lib/lead-forms.server.ts` |
| 100 | `src/lib/marketing.functions.ts` |
| 500 | `src/lib/marketing.functions.ts` |
| 10 | `src/lib/ops.functions.ts` |
| 100 | `src/lib/ops.functions.ts` |
| 200 | `src/lib/ops.functions.ts` |
| 5000 | `src/lib/ops.functions.ts` |
| 10 | `src/lib/orchestrator.functions.ts` |
| 100 | `src/lib/orchestrator.functions.ts` |
| 50 | `src/lib/orchestrator.functions.ts` |
| 1000 | `src/lib/profile360.functions.ts` |
| 20 | `src/lib/profile360.functions.ts` |
| 25 | `src/lib/profile360.functions.ts` |
| 10 | `src/routes/api/public/hooks/tick-cadence.ts` |
| 1 | `src/routes/api/public/webhooks/fuxico.ts` |

## I. Regras implícitas em mensagens de erro/validação

| Mensagem | Arquivo |
|---|---|
| falha fixture | `scripts/automation.unit.mjs` |
| ${msg}: esperado ${JSON.stringify(b)} obtido ${JSON.stringify(a)} | `scripts/ai-context/cenarios.mjs` |
| Artifact-id sem arquivo correspondente | `scripts/ci/contexto-publicacao.unit.mjs` |
| Download simulado falhou: ${failDownload} | `scripts/ci/contexto-publicacao.unit.mjs` |
| --entrada exige o caminho do arquivo com a resposta do banco.sql | `scripts/inventario/gerar-banco.mjs` |
| Management API ${caminho} respondeu HTTP ${res.status} | `scripts/inventario/gerar-banco.mjs` |
| SUPABASE_PROJECT_REF=${ref} nao e o banco oficial (${PROJETO_OFICIAL}). | `scripts/inventario/gerar-banco.mjs` |
| a resposta nao parece ser do banco oficial: ${comuns} tabelas em comum com os tipos gerados  | `scripts/inventario/gerar-banco.mjs` |
| a resposta nao parece ser do banco oficial: ledger com ${registros} registros e maior versao ${max};  | `scripts/inventario/gerar-banco.mjs` |
| a resposta nao traz resumo.ledger_versao_max/ledger_registros; rode o banco.sql atual. | `scripts/inventario/gerar-banco.mjs` |
| a saida tem algo com cara de credencial; nada foi gravado. Revise banco.sql. | `scripts/inventario/gerar-banco.mjs` |
| entrada sem as chaves: ${faltando.join( | `scripts/inventario/gerar-banco.mjs` |
| entrada sem tabelas | `scripts/inventario/gerar-banco.mjs` |
| format_version ${dado.format_version} desconhecido (esperado 1) | `scripts/inventario/gerar-banco.mjs` |
| sem --entrada e sem SUPABASE_ACCESS_TOKEN: nada para ler (veja o cabecalho do script). | `scripts/inventario/gerar-banco.mjs` |
| types.ts sem o bloco Tables: regere os tipos do banco. | `scripts/inventario/gerar-banco.mjs` |
| types.ts sem tabelas em Tables: regere os tipos do banco. | `scripts/inventario/gerar-banco.mjs` |
| ripgrep (rg) falhou com exit ${status}; o inventário não foi gerado. | `scripts/inventario/gerar-repo.mjs` |
| ripgrep (rg) não encontrado; o inventário não pode ser gerado com segurança. | `scripts/inventario/gerar-repo.mjs` |
| failed | `scripts/maintenance/lib.mjs` |
| missing_dependencies | `scripts/maintenance/lib.mjs` |
| skipped_busy | `scripts/maintenance/lib.mjs` |
| formatter fixture failed | `scripts/maintenance/maintenance.unit.mjs` |
| blocked_network_sandbox | `scripts/maintenance/run.mjs` |
| pending_patch | `scripts/maintenance/run.mjs` |
| O teste offline não permite consultas ao banco | `scripts/supabase_snapshot/test_snapshot.py` |
| banco indisponível na fixture | `scripts/supabase_snapshot/test_snapshot.py` |
| catálogo indisponível na fixture | `scripts/supabase_snapshot/test_snapshot.py` |
| permission denied for schema auth | `scripts/supabase_snapshot/test_snapshot.py` |
| relation  | `scripts/supabase_snapshot/test_snapshot.py` |
| statement timeout simulado | `scripts/supabase_snapshot/test_snapshot.py` |
| view removida depois da consulta ao catálogo | `scripts/supabase_snapshot/test_snapshot.py` |
| view sem permissão na fixture | `scripts/supabase_snapshot/test_snapshot.py` |
| ; import { cn } from  | `src/components/ops/budget-guardrails.tsx` |
| ; import { cn } from  | `src/components/ops/budget-reallocation.tsx` |
|  className={cn(alertVariants({ variant }), className)} {...props} /> )); Alert.displayName =  | `src/components/ui/alert.tsx` |
| useCarousel must be used within a <Carousel /> | `src/components/ui/carousel.tsx` |
| useChart must be used within a <ChartContainer /> | `src/components/ui/chart.tsx` |
| useFormField should be used within <FormField> | `src/components/ui/form.tsx` |
| useFormField should be used within <FormItem> | `src/components/ui/form.tsx` |
| useSidebar must be used within a SidebarProvider. | `src/components/ui/sidebar.tsx` |
| ${system.toUpperCase()}_URL not configured. Add it in project secrets. | `src/integrations/external/config.server.ts` |
| FATORX_AGENT_ID_DEFAULT not set | `src/integrations/external/fatorx.server.ts` |
| [FATORX ${res.status}] ${text.slice(0, 500)} | `src/integrations/external/fatorx.server.ts` |
| FUXICO create-tracking sem trackingId | `src/integrations/external/fuxico.server.ts` |
| [FUXICO ${res.status}] ${text.slice(0, 500)} | `src/integrations/external/fuxico.server.ts` |
| [LUX ${res.status}] ${text.slice(0, 500)} | `src/integrations/external/lux.server.ts` |
| [SINGU ${res.status}] ${text.slice(0, 500)} | `src/integrations/external/singu.server.ts` |
| Unauthorized: Invalid token | `src/integrations/supabase/auth-middleware.ts` |
| Unauthorized: No authorization header provided | `src/integrations/supabase/auth-middleware.ts` |
| Unauthorized: No request headers available | `src/integrations/supabase/auth-middleware.ts` |
| Unauthorized: No token provided | `src/integrations/supabase/auth-middleware.ts` |
| Unauthorized: No user ID found in token | `src/integrations/supabase/auth-middleware.ts` |
| Unauthorized: Only Bearer tokens are supported | `src/integrations/supabase/auth-middleware.ts` |
| Audiência não encontrada | `src/lib/audiences.functions.ts` |
| Falha ao ajustar ${change.channel}: ${error.message} | `src/lib/budget-reallocation.server.ts` |
| Falha ao ler histórico de realocações: ${error.message} | `src/lib/budget-reallocation.server.ts` |
| Tetos ajustados (${applied}), mas o registro de auditoria falhou: ${auditError.message} | `src/lib/budget-reallocation.server.ts` |
| Campanha não encontrada | `src/lib/campaign-cost.server.ts` |
| Este termo já existe neste nicho. | `src/lib/compliance.functions.ts` |
| Jornada não encontrada | `src/lib/journeys.functions.ts` |
| Não é possível ativar: ${blocking.map((i) => i.message).join( | `src/lib/journeys.functions.ts` |
| Formulário não encontrado | `src/lib/lead-forms.functions.ts` |
| Envio não encontrado | `src/lib/lead-forms.server.ts` |
| Formulário não encontrado | `src/lib/lead-forms.server.ts` |
| A audiência está vazia — atualize os membros antes de lançar | `src/lib/marketing.functions.ts` |
| Campanha não encontrada | `src/lib/marketing.functions.ts` |
| Corrija antes de lançar — ${errs.map((i) =>  | `src/lib/marketing.functions.ts` |
| Crie ao menos uma variante | `src/lib/marketing.functions.ts` |
| Pré-voo de custo reprovado — ${preflight.reasons.join( | `src/lib/marketing.functions.ts` |
| Selecione uma audiência antes de lançar | `src/lib/marketing.functions.ts` |
| entity not found | `src/lib/orchestrator.functions.ts` |
| Contato não encontrado | `src/lib/profile360.functions.ts` |
| MMS requer media_url | `src/lib/templates.functions.ts` |
| RCS requer rcs_payload | `src/lib/templates.functions.ts` |
| Templates de e-mail exigem assunto | `src/lib/templates.functions.ts` |
| Variáveis desconhecidas: ${unknown.map((v) =>  | `src/lib/templates.functions.ts` |
| entity não encontrada | `src/lib/templates.functions.ts` |
| entity sem mapeamento SINGU | `src/lib/templates.functions.ts` |
| SM_WEBHOOK_SECRET not configured for unsubscribe tokens | `src/lib/unsubscribe-token.server.ts` |
| Falha no Google Sign In | `src/routes/auth.tsx` |
| Escreva o corpo antes de salvar como template | `src/routes/_authenticated/campaigns.$id.tsx` |
| Selecione ao menos uma empresa | `src/routes/_authenticated/companies.tsx` |
| Selecione uma campanha | `src/routes/_authenticated/companies.tsx` |
| Corpo da mensagem é obrigatório | `src/routes/_authenticated/library.tsx` |
| Dê um nome ao template | `src/routes/_authenticated/library.tsx` |
| Informe o entity_id para teste | `src/routes/_authenticated/library.tsx` |
| Limite de ${CHANNEL_BODY_LIMIT[channel]} caracteres excedido para ${channel} | `src/routes/_authenticated/library.tsx` |
| MMS requer mídia | `src/routes/_authenticated/library.tsx` |
| Pré-voo bloqueou o salvamento: ${blockers[0].message} | `src/routes/_authenticated/library.tsx` |
| Pré-voo bloqueou o salvamento: ${msgBlockers[0].message} | `src/routes/_authenticated/library.tsx` |
| Templates de e-mail exigem assunto | `src/routes/_authenticated/library.tsx` |
| Variáveis desconhecidas: ${unknown.map((v) =>  | `src/routes/_authenticated/library.tsx` |
| sequence_id required for email channel | `src/routes/api/public/agent-tools/send-message.ts` |
| unauthorized | `src/routes/api/public/agent-tools/send-message.ts` |
| unauthorized | `src/routes/api/public/hooks/alert-sweep.ts` |
| unauthorized | `src/routes/api/public/hooks/budget-reallocate.ts` |
| MMS step sem media_url | `src/routes/api/public/hooks/tick-cadence.ts` |
| unauthorized | `src/routes/api/public/hooks/tick-cadence.ts` |
| unauthorized | `src/routes/api/public/hooks/tick-journeys.ts` |
| contato sem vínculo SINGU | `src/routes/api/public/hooks/tick-marketing.ts` |
| email hard_bounce — canal desativado para este contato | `src/routes/api/public/hooks/tick-marketing.ts` |
| unauthorized | `src/routes/api/public/hooks/tick-marketing.ts` |
| variante MMS sem media_url | `src/routes/api/public/hooks/tick-marketing.ts` |
| bad protocol | `src/routes/api/public/track/click.ts` |
| invalid url | `src/routes/api/public/track/click.ts` |
| missing url | `src/routes/api/public/track/click.ts` |
| invalid payload | `src/routes/api/public/webhooks/fatorx.ts` |
| invalid signature | `src/routes/api/public/webhooks/fatorx.ts` |
| invalid json | `src/routes/api/public/webhooks/fuxico.ts` |
| invalid payload | `src/routes/api/public/webhooks/fuxico.ts` |
| invalid signature | `src/routes/api/public/webhooks/fuxico.ts` |
| invalid payload | `src/routes/api/public/webhooks/lux.ts` |
| invalid signature | `src/routes/api/public/webhooks/lux.ts` |
| invalid payload | `src/routes/api/public/webhooks/singu-bounce.ts` |
| invalid signature | `src/routes/api/public/webhooks/singu-bounce.ts` |
| invalid payload | `src/routes/api/public/webhooks/singu.ts` |
| invalid signature | `src/routes/api/public/webhooks/singu.ts` |

## J. Controle de acesso no código (checagens de perfil/permissão)

| Valor comparado | Arquivo |
|---|---|
| `donor` | `src/components/ops/budget-reallocation.tsx` |

## K. Testes como especificação (587 testes em 33 arquivos — nomes completos em `context.json`)

| Arquivo | Testes | Exemplos do que o sistema DEVE fazer |
|---|---|---|
| `src/lib/journey-engine.test.ts` | 67 | readField · lê caminho aninhado · devolve undefined sem lançar em caminho inexistente · evaluateCondition … |
| `src/lib/ops-alerts.test.ts` | 32 | buildOpsAlerts — silêncio quando está tudo bem · sem dados não inventa alertas · operação saudável não gera ruído · alertas de pipeline … |
| `src/lib/cadence-engine.test.ts` | 31 | resolveSteps · usa cadência padrão quando o JSON não é lista · descarta passos malformados sem derrubar o tick · normaliza delay negativo/NaN para zero e preserva mídia … |
| `src/lib/campaign-validation.test.ts` | 26 | validateCampaign — casos felizes · não gera erros para uma campanha bem formada · aceita split A/B somando 100 · validateCampaign — bloqueios estruturais … |
| `src/lib/email-blocks.test.ts` | 24 | safeUrl · aceita http, https e mailto · rejeita javascript: e vazios · validateBlocks … |
| `src/lib/security-tokens.test.ts` | 23 | verifyHmac · aceita assinatura hex crua e com prefixo sha256= · aceita a própria assinatura gerada por signPayload · rejeita corpo adulterado, segredo errado e assinatura de outro corpo … |
| `src/lib/campaign-cost.test.ts` | 22 | allocateRecipients · fecha exatamente com o total mesmo com resto de divisão · distribui igualmente quando todos os pesos são zero · é determinístico entre execuções … |
| `src/lib/email-preflight.test.ts` | 21 | preflightEmail · aprova um e-mail bem construído · exige assunto · sinaliza assunto longo, caixa alta e pontuação excessiva … |
| `src/lib/lead-forms.test.ts` | 21 | slugify · normaliza acentos, espaços e maiúsculas · não deixa hífen sobrando · normalizeEmail / normalizePhone … |
| `src/lib/ops-audit.test.ts` | 21 | normalizeTargetFilter · ignora entradas vazias · rejeita curingas e caracteres fora do alfabeto UUID · normaliza prefixo válido para minúsculas … |
| `src/lib/template-vars.test.ts` | 21 | canonicalVar · resolve aliases conhecidos · devolve null para variáveis fora do catálogo · parseVariables / extractVariables … |
| `src/lib/journey-triggers.test.ts` | 20 | parseTriggerConfig · cai no padrão com JSON inválido · aceita lista, string única e CSV normalizando caixa · descarta cooldown inválido e audiência vazia … |
| `src/routes/api/public/hooks/tick-marketing.test.ts` | 18 | tick-marketing (integração) · rejeita chamadas sem a apikey correta · despacha a variante renderizada e marca o envio como enviado · bloqueia o envio quando há opt-out registrado (LGPD) … |
| `src/lib/tracking-integrity.test.ts` | 17 | buildTrackingIntegrityReport — estado saudável · sem dados devolve zeros e nenhum alerta · cobertura total não gera alertas · cobertura de rastreio … |
| `src/lib/budget-guard.test.ts` | 16 | evaluateChannelBudget · libera quando o gasto está abaixo do teto · alerta a partir de 80% do teto diário · alerta a partir de 80% do teto mensal mesmo com dia tranquilo … |
| `src/routes/api/public/hooks/tick-cadence.test.ts` | 16 | tick-cadence (integração) · rejeita chamadas sem a apikey correta · despacha WhatsApp, renderiza variáveis e avança para o próximo passo · preserva variáveis desconhecidas literais em vez de apagá-las … |
| `src/lib/cost-model.test.ts` | 15 | unitCostFor · usa a tabela padrão por canal · aceita override válido · ignora override inválido (negativo/NaN) … |
| `src/lib/budget-reallocation-schedule.test.ts` | 14 | decideScheduledReallocation · aplica quando o plano é relevante e não há histórico · recusa plano vazio · respeita o cooldown entre execuções … |
| `src/lib/sms-segments.test.ts` | 14 | isGsm7 · aceita texto latino básico e acentos do alfabeto GSM · rejeita emoji e caracteres fora da tabela · aceita a tabela de extensão … |
| `src/lib/csv-export.test.ts` | 13 | escapeCsvValue · devolve vazio para nulo e indefinido · não aspeia valores simples · aspeia e duplica aspas internas … |
| `src/lib/journeys.server.test.ts` | 13 | validateGraphInput · aprova um grafo linear completo · recusa ramo inexistente para o tipo de etapa · recusa saída em etapa terminal … |
| `src/routes/api/public/hooks/tick-journeys.test.ts` | 13 | tick-journeys (integração) · rejeita chamadas sem a apikey correta · atravessa gatilho → envio, renderiza variáveis e registra eventos · NÃO envia quando check_consent retorna false e encerra a inscrição (LGPD) … |
| `src/lib/alert-dispatch.test.ts` | 12 | planAlertDispatch · notifica alertas inéditos · não repete notificação dentro do cooldown · relembra alerta persistente após o cooldown … |
| `src/lib/audience-resolver.test.ts` | 12 | resolveAudience — filtros delegados ao banco · não aplica filtros quando as regras são padrão · respeita o teto de 5000 linhas materializadas · traduz kinds, busca, score e engajamento em predicados SQL … |
| `src/routes/api/public/hooks/alert-sweep.test.ts` | 12 | alert-sweep (integração) · rejeita chamadas sem a apikey correta · atualiza a materialized view antes de avaliar as regras · não abre nada quando o pipeline está saudável … |
| `src/lib/budget-reallocation.test.ts` | 11 | planReallocation · não propõe nada quando todos os canais estão folgados · transfere saldo de canal ocioso para canal bloqueado · preserva margem de segurança do doador … |
| `src/lib/compliance-terms.test.ts` | 11 | normalizeForCompliance · remove acentos e resolve leetspeak · elimina separadores internos usados para ofuscar · auditCompliance … |
| `src/lib/budget.test.ts` | 10 | periodBounds · ancora dia e mês em UTC · buildBudgetReport · separa gasto do dia do gasto do mês … |
| `src/lib/message-preflight.test.ts` | 10 | preflightMessage · aprova uma mensagem de WhatsApp bem escrita · bloqueia corpo vazio · cobra opt-out em SMS e WhatsApp, mas não no LinkedIn … |
| `src/lib/ops-recovery.test.ts` | 9 | requeueDeadLetter · retorna 0 e não escreve quando não há dead-letter · reenfileira apenas alvos em dead_letter, zerando backoff e lock · processa os mais antigos primeiro e respeita o limite do lote … |
| `src/lib/ops-spend.test.ts` | 9 | clampDays · usa 30 dias por padrão e para entradas inválidas · limita a 365 dias · buildSpendReport … |
| `src/lib/budget-reallocation.server.test.ts` | 7 | applyReallocation — trilha de auditoria · grava um registro com o plano efetivamente aplicado · não grava histórico quando não há nada a realocar · aceita ator nulo (execução automatizada) … |
| `src/routes/api/public/agent-tools/send-message.test.ts` | 6 | agent-tools/send-message (integração) · rejeita sem bearer válido · despacha quando o consentimento permite · bloqueia o envio quando há opt-out registrado (LGPD) … |

## L. Eventos de webhook tratados (contratos com sistemas externos)

| Evento | Arquivo |
|---|---|
| `email.opened` | `src/lib/deliverability.functions.ts` |

## M. Efeitos colaterais (e-mail, SMS, cobrança, fila — não são idempotentes por padrão)

| Chamada | Arquivo |
|---|---|
| `sendEmail` | `src/integrations/external/singu.server.ts` |
| `sendSms` | `src/integrations/external/singu.server.ts` |
| `sendWhatsapp` | `src/integrations/external/singu.server.ts` |
| `sendEmail` | `src/lib/deliverability.functions.ts` |
| `sendEmail` | `src/lib/journey-dispatch.server.ts` |
| `sendSms` | `src/lib/journey-dispatch.server.ts` |
| `sendWhatsapp` | `src/lib/journey-dispatch.server.ts` |
| `sendSms` | `src/lib/orchestrator.functions.ts` |
| `sendWhatsapp` | `src/lib/orchestrator.functions.ts` |
| `sendSms` | `src/lib/templates.functions.ts` |
| `enqueue(` | `src/routes/_authenticated/companies.tsx` |
| `sendSms` | `src/routes/api/public/agent-tools/send-message.ts` |
| `sendWhatsapp` | `src/routes/api/public/agent-tools/send-message.ts` |
| `notify_error` | `src/routes/api/public/hooks/alert-sweep.ts` |
| `sendEmail` | `src/routes/api/public/hooks/tick-cadence.ts` |
| `sendSms` | `src/routes/api/public/hooks/tick-cadence.ts` |
| `sendWhatsapp` | `src/routes/api/public/hooks/tick-cadence.ts` |
| `sendEmail` | `src/routes/api/public/hooks/tick-marketing.ts` |
| `sendSms` | `src/routes/api/public/hooks/tick-marketing.ts` |
| `sendWhatsapp` | `src/routes/api/public/hooks/tick-marketing.ts` |

## N. Regras citadas em comentários do código

| Comentário | Arquivo |
|---|---|
| de modo que os módulos puros (`template-vars`, `campaign-validation`) rodam | `vitest.config.ts` |
| * Lista os problemas de autoria da campanha: erros bloqueiam, avisos apenas alertam. */ | `src/components/campaign-validation-panel.tsx` |
| * Exporta o recorte COMPLETO (não apenas as linhas visíveis): a listagem tem | `src/components/ops/manual-interventions.tsx` |
| Must be registered as a global `functionMiddleware` in `src/start.ts`; otherwise | `src/integrations/supabase/auth-attacher.ts` |
| * Linha persistida em `ops_alert_notifications` (apenas o que interessa aqui). */ | `src/lib/alert-dispatch.ts` |
| Resolve os touchpoints em lotes para não estourar o limite da query string. | `src/lib/analytics.functions.ts` |
| sobre a view 360. Nenhum SQL vem do cliente: apenas valores validados. | `src/lib/audience-resolver.server.ts` |
| Ausência de registro = opt-in implícito (mesma regra de check_consent). | `src/lib/audience-resolver.server.ts` |
| * Score mínimo de sinal (decaimento exponencial já aplicado na view). */ | `src/lib/audience-rules.ts` |
| atinge o limite configurado em `channel_budgets`, o worker de cadência deixa | `src/lib/budget-guard.ts` |
| * Princípio de projeto: **fail-open controlado**. Limite ausente ou igual a | `src/lib/budget-guard.ts` |
| * Fração do limite a partir da qual emitimos alerta antes do bloqueio. */ | `src/lib/budget-guard.ts` |
| → intervalo mínimo entre aplicações automáticas. | `src/lib/budget-reallocation-schedule.ts` |
| → valor mínimo movimentado. | `src/lib/budget-reallocation-schedule.ts` |
| o teto autorizado deve passar por um humano. | `src/lib/budget-reallocation-schedule.ts` |
| → limite percentual do total autorizado. | `src/lib/budget-reallocation-schedule.ts` |
| * Intervalo mínimo entre duas aplicações automáticas. */ | `src/lib/budget-reallocation-schedule.ts` |
| * Valor mínimo movimentado para justificar a aplicação. */ | `src/lib/budget-reallocation-schedule.ts` |
| Data inválida no histórico não pode travar a automação para sempre. | `src/lib/budget-reallocation-schedule.ts` |
| 100).toFixed(1)}% do teto autorizado (máximo automático: ${(p.maxMovedShare * 100).toFixed(0)}%). Requer aprovação manual em /ops.`, | `src/lib/budget-reallocation-schedule.ts` |
| mantendo a soma dos tetos diários **constante** — nunca aumenta o gasto máximo | `src/lib/budget-reallocation.ts` |
| autorizado, apenas redistribui. | `src/lib/budget-reallocation.ts` |
| de segurança — realocar não pode bloquear quem estava saudável. | `src/lib/budget-reallocation.ts` |
| 4. Canais sem teto configurado (limite 0) ficam fora dos dois lados: não têm | `src/lib/budget-reallocation.ts` |
| * Atalho para o worker: apenas o conjunto de canais bloqueados. | `src/lib/budget.server.ts` |
| Em caso de erro devolvemos conjunto vazio — um guardrail de custo nunca deve | `src/lib/budget.server.ts` |
| testes determinísticos. O worker apenas coleta os fatos no banco, pergunta | `src/lib/cadence-engine.ts` |
| Guardrail financeiro: nunca é motivo para encerrar o target, apenas para | `src/lib/cadence-engine.ts` |
| Regra anti-inflação: repetições do mesmo emoji na mesma mensagem contam | `src/lib/campaign-diagnostics.ts` |
| no máximo 2 vezes para o score (evita "🔥🔥🔥🔥🔥" distorcer a média). | `src/lib/campaign-diagnostics.ts` |
| * Regras de validação de criativos de campanha. | `src/lib/campaign-validation.ts` |
| * `error` bloqueia o lançamento; `warning` apenas alerta. */ | `src/lib/campaign-validation.ts` |
| * Limite prático de caracteres por canal. */ | `src/lib/campaign-validation.ts` |
| Pré-voo de entregabilidade reaproveitado do Compositor (somente e-mail). | `src/lib/campaign-validation.ts` |
| * Nichos ativos do cliente. Padrão: apenas `geral`. */ | `src/lib/compliance-terms.ts` |
| * Termos proibidos cadastrados pelo usuário (RLS: apenas os próprios). */ | `src/lib/compliance.functions.ts` |
| `geral` é sempre aplicado como piso mínimo. | `src/lib/compliance.server.ts` |
| Falha de leitura não pode derrubar o lançamento: aplica-se o piso `geral`. | `src/lib/compliance.server.ts` |
| que o operador enxergue no painel /ops não apenas "quantos falharam" mas | `src/lib/cost-model.ts` |
| Não expõe segredos: apenas se está configurado e a URL de webhook a cadastrar. | `src/lib/deliverability.functions.ts` |
| com validação de formato da URL. | `src/lib/deliverability.functions.ts` |
| * Aceita apenas esquemas seguros; caso contrário devolve `null`. */ | `src/lib/email-blocks.ts` |
| * Identificador estável da regra (útil para testes e telemetria). */ | `src/lib/email-preflight.ts` |
| * Limite a partir do qual o Gmail corta o corpo com "[Mensagem aparada]". */ | `src/lib/email-preflight.ts` |
| * Campanhas antigas guardam apenas `body`; o motor de heurísticas trabalha com | `src/lib/email-preflight.ts` |
| Nunca lança — tracking jamais deve bloquear um disparo. | `src/lib/email-tracking.server.ts` |
| * Executa o envio real no canal pedido. Lança apenas erros inesperados. */ | `src/lib/journey-dispatch.server.ts` |
| contato, e devolve a próxima ação. O worker `tick-journeys` apenas coleta | `src/lib/journey-engine.ts` |
| * Passo máximo de espera aceito num nó `wait` (30 dias), como guarda de sanidade. */ | `src/lib/journey-engine.ts` |
| Guardrail financeiro nunca encerra a jornada — apenas adia. | `src/lib/journey-engine.ts` |
| Validação do grafo (antes de publicar) | `src/lib/journey-engine.ts` |
| * Ramos válidos de saída para cada tipo — guia a interface e a validação. */ | `src/lib/journey-graph.ts` |
| * Validação completa do grafo: regras do motor + coerência dos ramos por tipo | `src/lib/journey-graph.ts` |
| * O worker apenas coleta os fatos e obedece. Mesma disciplina de | `src/lib/journey-triggers.ts` |
| Data inválida no histórico não pode travar a jornada para sempre. | `src/lib/journey-triggers.ts` |
| para que a validação seja idêntica nos três lugares. | `src/lib/lead-forms.ts` |
| $/, "Use apenas letras minúsculas, números e _"), | `src/lib/lead-forms.ts` |
| * Nome do campo-armadilha: preenchido apenas por robôs. */ | `src/lib/lead-forms.ts` |
| Validação de autoria: erros bloqueiam a gravação de criativos inválidos. | `src/lib/marketing.functions.ts` |
| Autoridade final: a mesma validação do editor roda aqui antes de materializar. | `src/lib/marketing.functions.ts` |
| Devolvemos apenas os valores de variáveis já resolvidos (strings serializáveis). | `src/lib/marketing.functions.ts` |
| * Segmentos calculados apenas para SMS; `null` nos demais canais. */ | `src/lib/message-preflight.ts` |
| * Máximo de links tolerado por canal antes de virar sinal de spam. */ | `src/lib/message-preflight.ts` |
| Cada regra responde a uma pergunta que o operador faria de manhã: | `src/lib/ops-alerts.ts` |
| * Exportação: a UI lista no máximo 200 linhas, mas a auditoria externa precisa | `src/lib/ops-audit.server.ts` |
| * Lê apenas eventos cujo autor é `operator:<uid>` — o índice parcial | `src/lib/ops-audit.server.ts` |
| * `true` quando batemos o teto — o CSV está incompleto e a UI deve avisar. */ | `src/lib/ops-audit.server.ts` |
| * Limite defensivo: reprocessa em lotes, nunca a fila inteira de uma vez. */ | `src/lib/ops-recovery.server.ts` |
| não desfaz o requeue (os alvos já voltaram à fila); apenas não silenciamos | `src/lib/ops-recovery.server.ts` |
| apenas `channel` + `status` (duas colunas curtas). Evitamos ~35 queries | `src/lib/ops-spend.server.ts` |
| Required: nested routes render here. Removing <Outlet /> breaks all child routes. */} | `src/routes/__root.tsx` |
| Devolve o criativo para a Biblioteca, reaproveitando as mesmas regras de validação. | `src/routes/_authenticated/campaigns.$id.tsx` |
| Resolve entity (singu mapping only required for singu-backed channels) | `src/routes/api/public/agent-tools/send-message.ts` |
| Falha do RPC não pode virar envio silencioso a quem deu opt-out (fail-closed, mesmo | `src/routes/api/public/agent-tools/send-message.ts` |
| (cooldown, valor mínimo e teto percentual) e só então grava. `dry_run: true` | `src/routes/api/public/hooks/budget-reallocate.ts` |
| * Regra inviolável: `check_consent` é avaliado ANTES de qualquer despacho. | `src/routes/api/public/hooks/tick-cadence.ts` |
| ---- Coleta de fatos (somente leitura) -------------------------------- | `src/routes/api/public/hooks/tick-cadence.ts` |
| Falha do RPC não pode virar envio silencioso a quem deu opt-out: | `src/routes/api/public/hooks/tick-cadence.ts` |
| * Regra inviolável: `check_consent` é avaliado ANTES de qualquer despacho e | `src/routes/api/public/hooks/tick-journeys.ts` |
| Excedeu o limite de saltos: solta o lock e retoma no próximo tick. | `src/routes/api/public/hooks/tick-journeys.ts` |
| Consentimento (LGPD) — bloqueia opt-outs por canal. Falha do RPC não pode virar | `src/routes/api/public/hooks/tick-marketing.ts` |
