# SALES MACHINE — CLAUDE.md
> Instruções para Claude Code e agentes de IA trabalhando neste projeto

## Identidade do projeto
- **Repo:** `adm01-debug/social-sales-symphony`
- **Stack:** Vite/React/Supabase + Edge Functions (Deno/TypeScript)
- **Banco:** Supabase Cloud, 10 migrations aplicadas (001–010)
- **Branch principal:** `main`

## Arquitetura

```
LUX (ICP discovery) ──webhook-lux──▶ entity_map (upsert)
                                            │
                        pg_cron ──tick-cadence──▶ fn_claim_cadence_batch (SKIP LOCKED)
                                            │ check_consent() ✓ has_recent_account_touchpoint() ✓
                                            │
                                      FATOR X API ──▶ mensagem gerada
                                            │
                              pending_approval ──approve-touchpoint──▶ operator
                              queued           ──singu-send──────────▶ SINGU API
                                            │
               SINGU webhook ──webhook-singu──▶ consent_ledger (opt-out) ▶ campaign_target state
                                            │
                              state='replied' ──handoff-deal──▶ PROMO CHAMPIONS
                                            │
                              state='completed' (TERMINAL)
```

## Variáveis de ambiente necessárias (Supabase Secrets)

```bash
# Core
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# Webhooks (HMAC-SHA256)
SM_WEBHOOK_SECRET=<global_fallback>
SM_WEBHOOK_SECRET_LUX=<lux_specific>
SM_WEBHOOK_SECRET_SINGU=<singu_specific>
SM_WEBHOOK_SECRET_FATORX=<fatorx_specific>

# SINGU (canal executor)
SINGU_API_URL=https://api.singu.com.br
SINGU_API_KEY=<key>

# FATOR X (geração de mensagem IA)
FATORX_API_URL=https://api.fatórx.com.br
FATORX_API_KEY=<key>
FATORX_DEFAULT_AGENT_ID=<agent_uuid>

# PROMO CHAMPIONS (handoff)
PROMO_CHAMPIONS_API_URL=https://api.promochampions.com.br
PROMO_CHAMPIONS_API_KEY=<key>
```

## Regras críticas do banco (NUNCA violar)

1. **check_consent() OBRIGATÓRIO** antes de qualquer `singu-send`
2. **SKIP LOCKED obrigatório** no tick — `fn_claim_cadence_batch` já garante
3. **UNIQUE(source, external_id)** em sales_machine_events — usar `ON CONFLICT DO NOTHING`
4. **entity_map upsert** — `ON CONFLICT (kind, lux_id) DO UPDATE` — nunca INSERT direto
5. **State machine** — transições via trigger `tg_validate_target_state_transition`
6. **LGPD** — `delete_entity_personal_data()` é a única forma de apagar dados pessoais
7. **disclosure_text** — sempre injetar na primeira mensagem (agent_identity_config)
8. **stop_word_lists** — detectar em webhook-singu → consent_ledger imediatamente

## Edge functions disponíveis

| Função | Trigger | Propósito |
|---|---|---|
| `webhook-lux` | HTTP POST (HMAC) | Ingestão LUX |
| `webhook-singu` | HTTP POST (HMAC) | Eventos de canal |
| `webhook-fatorx` | HTTP POST (HMAC) | Decisão do agente |
| `tick-cadence` | pg_cron (1min) | Orquestrador 1:1 |
| `tick-marketing` | pg_cron (5min) | Broadcast 1:many |
| `singu-send` | Internal | Despacha mensagem |
| `approve-touchpoint` | HTTP POST (JWT) | Gate humano |
| `handoff-deal` | Internal | Handoff PROMO |

## pg_cron — configurar após deploy

```sql
-- Descomentar e adaptar na migration 010 após deploy:
SELECT cron.schedule('sm-cadence-tick', '* * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/tick-cadence',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
  )$$
);

SELECT cron.schedule('sm-marketing-tick', '*/5 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/tick-marketing',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
  )$$
);

SELECT cron.schedule('sm-quota-reset', '0 0 * * *', 'SELECT public.fn_reset_daily_quotas()');
SELECT cron.schedule('sm-archive-events', '0 3 * * 0', 'SELECT public.fn_archive_old_target_events()');
```

## Monitoramento

```sql
-- Dashboard de saúde em tempo real:
SELECT * FROM public.v_security_audit;

-- Targets travados:
SELECT id, state, locked_until FROM campaign_targets WHERE state='running' AND locked_until < now();

-- Opt-outs recentes:
SELECT entity_id, channel, opted_out_at FROM consent_ledger WHERE status='opted_out' ORDER BY opted_out_at DESC LIMIT 20;
```
