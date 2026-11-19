# 10 · ACESSO E SEGURANÇA — quem pode o quê

> Gerado automaticamente por AI Context Sync v1.3.2 · commit `40909e5de0` · branch `main` · 2026-11-19 22:14 UTC
> Não edite à mão — regras humanas vão em `manual/`.

## Perfis / roles identificados

`admin`, `donor`, `operator`, `viewer`

- Tabelas de perfil/permissão: `user_roles`, `audience_members`
- Colunas de perfil: `user_roles.role` (public.app_role NOT NULL)
- Claims do JWT usados em políticas/funções: nenhum
- Funções usadas dentro de políticas RLS (a regra real está no corpo delas — veja `06`): `has_role`

## Matriz tabela × operação → quem pode (derivada das políticas RLS)

| Tabela | RLS | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| `agent_eval_cases` | enabled | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')<br>authenticated: public.has_role(auth.uid(),'admin') | authenticated: public.has_role(auth.uid(),'admin') | authenticated: public.has_role(auth.uid(),'admin') | authenticated: public.has_role(auth.uid(),'admin') |
| `agent_eval_runs` | enabled | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') | — | — |
| `audience_members` | enabled | authenticated: true<br>authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') |
| `audiences` | enabled | authenticated: true<br>authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') |
| `budget_reallocations` | enabled | authenticated: true | authenticated: (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role)) AND (actor_user_id IS N | — | — |
| `cadence_rules` | enabled | authenticated: true<br>authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')<br>authenticated: owner_id IS NULL OR owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') |
| `campaign_sends` | enabled | authenticated: true<br>authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') |
| `campaign_target_events` | enabled | authenticated: public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') | authenticated: (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')) AND actor = 'operator:' \|\| auth.uid()::text | — | — |
| `campaign_targets` | enabled | authenticated: public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')<br>authenticated: public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') | authenticated: public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') | authenticated: public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') | authenticated: public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') |
| `campaign_variants` | enabled | authenticated: true<br>authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') |
| `campaigns_orchestration` | enabled | authenticated: true<br>authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') |
| `channel_budgets` | enabled | authenticated: true<br>authenticated: public.has_role(auth.uid(), 'admin') | authenticated: public.has_role(auth.uid(), 'admin') | authenticated: public.has_role(auth.uid(), 'admin')<br>authenticated: public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') | authenticated: public.has_role(auth.uid(), 'admin') |
| `channel_quotas` | enabled | authenticated: auth.uid() = user_id | authenticated: auth.uid() = user_id | authenticated: auth.uid() = user_id | — |
| `channel_roi_stats` | enabled | authenticated: true | — | — | — |
| `compliance_terms` | enabled | authenticated: created_by = auth.uid()<br>authenticated: public.has_role(auth.uid(), 'admin') | authenticated: created_by = auth.uid() | authenticated: created_by = auth.uid() | authenticated: created_by = auth.uid() |
| `compliance_violations_log` | enabled | authenticated: auth.uid() = user_id | authenticated: auth.uid() = user_id | — | — |
| `consent_ledger` | enabled | authenticated: true | authenticated: public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') | — | — |
| `contact_churn_scores` | enabled | authenticated: true | — | — | — |
| `contact_touchpoints` | enabled | authenticated: true | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | — |
| `email_deliverability_events` | enabled | authenticated: true | — | — | — |
| `entity_map` | enabled | authenticated: true | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | — |
| `journey_edges` | enabled | authenticated: true<br>authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') |
| `journey_enrollment_events` | enabled | authenticated: true | — | — | — |
| `journey_enrollments` | enabled | authenticated: true<br>authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') |
| `journey_nodes` | enabled | authenticated: true<br>authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') |
| `journeys` | enabled | authenticated: true<br>authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') |
| `lead_form_submissions` | enabled | authenticated: true<br>authenticated: has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) | authenticated: has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) | authenticated: has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) | authenticated: has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) |
| `lead_forms` | enabled | anon: status = 'published'<br>authenticated: true<br>authenticated: has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) | authenticated: has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) | authenticated: has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) | authenticated: has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) |
| `marketing_campaigns` | enabled | authenticated: true<br>authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') |
| `message_templates` | enabled | authenticated: auth.uid() = created_by | authenticated: auth.uid() = created_by | authenticated: auth.uid() = created_by | authenticated: auth.uid() = created_by |
| `ops_alert_notifications` | enabled | authenticated: true | — | — | — |
| `sales_machine_events` | enabled | authenticated: public.has_role(auth.uid(), 'admin') | — | — | — |
| `sender_health` | enabled | authenticated: public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator')<br>authenticated: public.has_role(auth.uid(),'admin') | authenticated: public.has_role(auth.uid(),'admin') | authenticated: public.has_role(auth.uid(),'admin') | authenticated: public.has_role(auth.uid(),'admin') |
| `signal_weights` | enabled | authenticated: true<br>authenticated: public.has_role(auth.uid(),'admin') | authenticated: public.has_role(auth.uid(),'admin') | authenticated: public.has_role(auth.uid(),'admin') | authenticated: public.has_role(auth.uid(),'admin') |
| `template_preflight_history` | enabled | authenticated: EXISTS ( SELECT 1 FROM public.message_templates WHERE id = template_preflight_history.template_id AND created_by = auth.uid() | authenticated: EXISTS ( SELECT 1 FROM public.message_templates WHERE id = template_preflight_history.template_id AND created_by = auth.uid() | — | — |
| `user_roles` | enabled | authenticated: auth.uid() = user_id | — | — | — |
| `v_contact_profiles` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |
| `v_pipeline_health` | não encontrado | sem RLS | sem RLS | sem RLS | sem RLS |

> `—` com RLS ligado = ninguém além de service_role. `sem RLS` = qualquer chave anon lê/escreve tudo.

## Onde o RLS é IGNORADO (service_role) — 28 arquivo(s)

- `scripts/ai-context/cenarios.mjs`
- `scripts/ai-context/gerar.unit.mjs`
- `scripts/inventario/gerar-banco.mjs`
- `scripts/regras_negocio/generate.py`
- `scripts/supabase_snapshot/snapshot.py`
- `src/integrations/supabase/client.server.ts`
- `supabase/migrations/20260720132748_c10bc4b1-46bf-443c-b928-95e2a2291cb7.sql`
- `supabase/migrations/20260720132837_7b6906af-c38e-4649-aff5-f1bb8079a150.sql`
- `supabase/migrations/20260720150001_6bbccb50-d5f3-47b2-815d-18d970877ab8.sql`
- `supabase/migrations/20260720181807_3bda158c-9273-4892-aa48-c833f37fac9d.sql`
- `supabase/migrations/20260720182029_f17d6bf5-d788-40ec-aa16-5aa5be861de6.sql`
- `supabase/migrations/20260722193244_78152eba-58c5-41f9-a9e4-3da82471f470.sql`
- `supabase/migrations/20260722200408_810b0704-8917-45fe-872f-34ad95c20b06.sql`
- `supabase/migrations/20260722200557_1817b23e-199b-4699-8a47-19a41d432710.sql`
- `supabase/migrations/20260722200744_56c3243d-ab3f-4259-a248-8929ccff9018.sql`
- `supabase/migrations/20260726144821_9bc55f77-0452-4276-9831-18179fda02a7.sql`
- `supabase/migrations/20260726162911_843efbb2-71b5-474d-bcc0-e99ec1e2478b.sql`
- `supabase/migrations/20260726164407_4c2ecdbe-a9c9-401b-96d1-89d68e9c815a.sql`
- `supabase/migrations/20260726170010_e45b5b84-b961-4a56-ba55-c7a6065a1c74.sql`
- `supabase/migrations/20260726174932_6d46bce8-9104-4fce-9c19-bfa9bc2457ba.sql`
- `supabase/migrations/20260726180549_54a43d43-fb92-4efb-a982-ac22f3bdbdf5.sql`
- `supabase/migrations/20260726182455_7e8f6c52-22a0-4ed1-8a61-d5426b4a6a8b.sql`
- `supabase/migrations/20260726185354_bc78dd3f-6ea5-4be2-86d1-a40f8bf81283.sql`
- `supabase/migrations/20260802111602_2a558c0f-0e67-4457-bccd-c5cdbf474034.sql`
- `supabase/migrations/20260802121142_9906b653-8ded-491a-9115-8a2659487779.sql`
- `supabase/migrations/20260802123233_26c8cfdc-0f1b-4f9f-9798-02dfa4777ef9.sql`
- `supabase/migrations/20260802124518_be42ee28-381a-41c1-8b90-19d41d7bba5e.sql`
- `supabase/migrations/20260802125202_8d7bc5b1-c4b2-4f75-9151-ddf9ed5d31b0.sql`

## Funções SQL `SECURITY DEFINER` (rodam com privilégio do dono, ignoram RLS)

- `fn_calculate_churn_risk`
- `fn_refresh_roi_stats`
- `handle_new_user`
- `has_role`

## Edge functions públicas (sem JWT — qualquer um chama)

_nenhuma declarada em config.toml_

## Rotas protegidas no front

| Rota | Guard | Roles | Arquivo |
|---|---|---|---|
| /app | ProtectedRoute |  | `scripts/ai-context/gerar.unit.mjs` |

Guards usados: Protected, ProtectedRoute

Middleware matcher (Next.js): nenhum

## Grants / Revokes (agrupados por role e privilégio)

| Ação | Para/De | Privilégios | Objetos |
|---|---|---|---|
| grant | anon | select | `lead_forms` |
| grant | authenticated | insert | `campaign_target_events` |
| grant | authenticated | select | `user_roles`, `sales_machine_events`, `campaign_target_events`, `signal_weights`, `email_deliverability_events`, `v_contact_profiles`, `ops_alert_notifications`, `v_pipeline_health`, `journey_enrollment_events`, `channel_roi_stats`, `contact_churn_scores` |
| grant | authenticated | select, insert | `agent_eval_runs`, `consent_ledger`, `budget_reallocations`, `template_preflight_history`, `compliance_violations_log` |
| grant | authenticated | select, insert, update | `entity_map`, `channel_quotas`, `contact_touchpoints`, `sender_health` |
| grant | authenticated | select, insert, update, delete | `cadence_rules`, `campaigns_orchestration`, `campaign_targets`, `agent_eval_cases`, `message_templates`, `audiences`, `audience_members`, `marketing_campaigns`, `campaign_variants`, `campaign_sends`, `journeys`, `journey_nodes`, `journey_edges`, `journey_enrollments`, `lead_forms` … +2 |
| grant | authenticated | select, update | `channel_budgets` |
| grant | authenticated, service_role | execute | `has_role`, `check_consent`, `refresh_pipeline_health`, `has_role` |
| grant | authenticated, service_role | select | `v_pipeline_health` |
| grant | service_role | all | `user_roles`, `sales_machine_events`, `entity_map`, `cadence_rules`, `campaigns_orchestration`, `channel_quotas`, `contact_touchpoints`, `campaign_targets`, `campaign_target_events`, `sender_health`, `signal_weights`, `agent_eval_cases`, `agent_eval_runs`, `message_templates`, `consent_ledger` … +22 |
| grant | service_role | execute | `check_consent`, `compute_daily_cap`, `has_recent_account_touchpoint`, `signal_score`, `refresh_pipeline_health` |
| grant | service_role | select | `v_contact_profiles` |
| revoke | PUBLIC, anon | all | `has_role` |
| revoke | PUBLIC, anon, authenticated | all | `handle_new_user`, `tg_touch_updated_at`, `check_consent`, `compute_daily_cap`, `has_recent_account_touchpoint`, `signal_score`, `refresh_pipeline_health`, `tg_log_target_state_change`, `tg_sync_target_status` |
| revoke | PUBLIC, anon, authenticated | execute | `handle_new_user` |
| revoke | anon | all | `v_pipeline_health` |
| revoke | authenticated | all | `v_pipeline_health` |

## Riscos de acesso detectados

| Tabela | Problema | Arquivos |
|---|---|---|
| `sales_machine_events` | front faz INSERT mas nenhuma política RLS permite INSERT → vai falhar/retornar vazio para usuários | `src/lib/lead-forms-delivery.server.ts`<br>`src/lib/orchestrator.functions.ts` |
| `v_contact_profiles` | acessada do front (2 arquivo(s)) sem RLS (não encontrado) | `src/lib/audience-resolver.server.ts`<br>`src/lib/profile360.functions.ts` |

## Multi-tenancy

_nenhuma coluna de tenant identificada — sistema single-tenant ou isolamento por usuário (auth.uid())_

## Soft delete (registros 'apagados' continuam na tabela — filtre!)

| Tabela | Coluna |
|---|---|
| `cadence_rules` | `is_active` |
| `message_templates` | `archived` |
| `audiences` | `archived` |
| `compliance_terms` | `is_active` |

## Auditoria (colunas de rastreio)

| Tabela | Colunas |
|---|---|
| `user_roles` | `created_at` |
| `entity_map` | `created_at`, `updated_at` |
| `cadence_rules` | `created_at`, `updated_at` |
| `campaigns_orchestration` | `created_at`, `updated_at` |
| `channel_quotas` | `updated_at` |
| `contact_touchpoints` | `created_at`, `updated_at` |
| `campaign_targets` | `created_at`, `updated_at` |
| `campaign_target_events` | `created_at` |
| `sender_health` | `created_at`, `updated_at` |
| `signal_weights` | `updated_at` |
| `agent_eval_cases` | `created_at`, `updated_at` |
| `message_templates` | `created_at`, `created_by`, `updated_at` |
| `consent_ledger` | `created_at` |
| `email_deliverability_events` | `created_at` |
| `audiences` | `created_at`, `created_by`, `updated_at` |
| `audience_members` | `created_at` |
| `marketing_campaigns` | `created_at`, `created_by`, `updated_at` |
| `campaign_variants` | `created_at`, `updated_at` |
| `campaign_sends` | `created_at`, `updated_at` |
| `ops_alert_notifications` | `created_at`, `updated_at` |
| `channel_budgets` | `created_at`, `updated_at` |
| `journeys` | `created_at`, `created_by`, `updated_at` |
| `journey_nodes` | `created_at`, `updated_at` |
| `journey_edges` | `created_at` |
| `journey_enrollments` | `created_at`, `updated_at` |
| `journey_enrollment_events` | `created_at` |
| `lead_forms` | `created_at`, `created_by`, `updated_at` |
| `lead_form_submissions` | `created_at`, `updated_at` |
| `template_preflight_history` | `created_at`, `created_by` |
| `compliance_terms` | `created_at`, `created_by`, `updated_at` |
| `compliance_violations_log` | `created_at` |
| `channel_roi_stats` | `created_at`, `updated_at` |
| `contact_churn_scores` | `created_at` |
| `v_contact_profiles` | `created_at` |

## Dados pessoais / sensíveis (LGPD — cuidado em logs, exports, prompts de IA)

| Tabela | Coluna |
|---|---|
| `lead_form_submissions` | `email` |
| `lead_form_submissions` | `phone` |

## Colunas de dinheiro (tipo importa: numeric ✅ / float ❌)

| Tabela | Coluna | Tipo |
|---|---|---|
| `budget_reallocations` | `total_before_brl` | `NUMERIC(12,2)` |
| `budget_reallocations` | `total_after_brl` | `NUMERIC(12,2)` |
| `channel_roi_stats` | `total_spent_brl` | `DECIMAL(12,` |
| `channel_roi_stats` | `total_messages_sent` | `INTEGER` |
| `channel_roi_stats` | `total_conversions` | `INTEGER` |
| `v_pipeline_health` | `total` | `number` |
