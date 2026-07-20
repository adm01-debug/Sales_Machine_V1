## Meta: SALES MACHINE 10/10

Executar sequencialmente todas as 10 melhorias do `docs/benchmark-sales-machine.md`, uma de cada vez, com simulação de cenários e prevenção de falhas antes de cada implementação. Sem pausas, sem perguntas intermediárias.

## Fase 0 — Simulação (antes de cada item)

Para cada melhoria abaixo executo mentalmente:
- Cenários felizes (2–3)
- Cenários de falha (rede, race condition, dados ausentes, RLS, prerender SSR sem sessão, tokens expirados)
- Impacto em dados existentes (backfill? default seguro?)
- Ordem de migração vs código (schema antes, código depois)

## Fase 1 — v1 (schema + orquestração core)

### Item 1 — Máquina de estados em `campaign_targets` + audit log
- Novo enum `sm_target_state`: `queued|running|paused|replied|stopped|lost|completed|dead_letter`
- Migrar coluna `status` → `state` (manter compat, backfill)
- Nova tabela `campaign_target_events` (append-only): `target_id, from_state, to_state, reason, actor, payload, created_at`
- Trigger que registra transição automaticamente
- RLS + GRANTs

### Item 2 — Presets de cadência
- Coluna `preset` em `cadence_rules` (`aggressive|standard|enterprise|custom`)
- Seed 3 presets padrão (5d/10d/21d) com steps multicanal
- Coluna `cadence_preset` em `campaigns_orchestration` como atalho
- UI: seletor de preset na tela de campaigns

### Item 3 — Retry/backoff + dead-letter no tick-cadence
- Colunas em `contact_touchpoints`: `attempts int default 0`, `next_retry_at timestamptz`, `last_error text`
- Nova coluna em `campaign_targets`: `attempts`, `max_attempts` (default 5)
- Lógica no worker: falha → backoff exponencial (1min, 5min, 30min, 2h, 8h) → após max → `dead_letter`
- Endpoint separado `/api/public/hooks/retry-failed` para reprocessar dead-letter manualmente

### Item 4 — Flag `requires_approval` + tela de aprovação
- Coluna `requires_approval bool default false` em `campaigns_orchestration`
- Novo status `pending_approval` em `sm_touchpoint_status`
- Worker: se campanha exige aprovação, cria touchpoint em `pending_approval` sem despachar
- Nova rota `/_authenticated/approvals` com lista + botões aprovar/rejeitar
- Server fn `approveTouchpoint` / `rejectTouchpoint`

### Item 5 — Coordenador por conta (anti-carpet-bombing)
- Função SQL `has_recent_account_touchpoint(entity_id, hours)` que consulta touchpoints da mesma company nas últimas N horas
- Worker: antes de disparar, chama a função; se true → adia 24h ou troca de canal
- Coluna `account_cooldown_hours int default 48` em `campaigns_orchestration`

## Fase 2 — v2 (qualidade + adapters)

### Item 6 — Warmup de sender (mailbox health)
- Nova tabela `sender_health`: `sender_id, date, sent, bounced, replied, spam_reports, daily_cap`
- Função SQL `compute_daily_cap(sender_id)` com ramp-up (50/dia → +10/dia até 500)
- Worker consulta cap antes de disparar email; se atingido → adia
- Endpoint `/api/public/webhooks/singu-mailbox-health` para SINGU reportar métricas

### Item 7 — Adapter pattern para LinkedIn/Instagram
- Interface `SocialSender` em `src/integrations/social/types.ts`
- Implementações `StubSocialSender`, `UnipileSender` (skeleton), `PhantombusterSender` (skeleton)
- Factory `getSocialSender(channel, config)` lê secret/flag para escolher
- Worker chama factory em vez de marcar `pending_provider` fixo

### Item 8 — Scoring com decay sobre `sales_machine_events`
- Função SQL `signal_score(_entity_id uuid)` com meia-vida por tipo (config em tabela `signal_weights`)
- Nova tabela `signal_weights`: `event_type, weight, half_life_hours`
- Seed pesos padrão (reply=100 24h, open=10 48h, click=25 72h, etc.)
- View materializada `entity_hot_scores` refrescada por trigger ou cron
- Worker: prioriza fila por score decrescente

### Item 9 — Eval harness FATOR X
- Nova tabela `agent_eval_cases`: `signal_json, expected_intent, expected_channel, notes`
- Server fn `runEvalSuite` chama FATOR X com cada case e compara
- Rota `/_authenticated/evals` com botão "rodar suite" + resultados
- Seed 10 casos iniciais representativos

### Item 10 — Threading real de email
- Colunas em `contact_touchpoints`: `email_message_id`, `email_in_reply_to`, `email_references text[]`
- Extender wrapper SINGU `sendEmail` para aceitar/retornar headers
- Webhook SINGU de reply: usa `In-Reply-To` para vincular ao touchpoint pai
- Backfill: ok deixar histórico vazio

## Fase 3 — Verificação final

- Rodar `supabase--linter`
- `supabase--slow_queries` sanity check
- Smoke test dos endpoints via `stack_modern--invoke-server-function`
- Atualizar `docs/benchmark-sales-machine.md` marcando cada gap como fechado
- Fechar com resumo do que ficou 10/10

## Detalhes técnicos

- **Ordem**: cada item = 1 migração (se houver schema) → código → verificação. Nunca combinar migração + código no mesmo turno (a migração precisa de aprovação e regenera types).
- **Compat**: manter colunas antigas com default seguro para não quebrar registros vivos. Backfill via UPDATE na mesma migração.
- **RLS**: toda nova tabela → GRANTs + policies scopadas por `user_roles` (admin/operator já existente).
- **Server fns protegidas**: usar `requireSupabaseAuth`; nunca em loader público.
- **Idempotência**: worker precisa ser idempotente (SELECT ... FOR UPDATE SKIP LOCKED via advisory lock ou coluna `locked_until`).

## Fora de escopo
- Migração para Trigger.dev/Inngest
- CRM próprio
- Fork de código dos projetos de referência

Ao aprovar, entro em build mode e executo os 10 itens em sequência sem parar.