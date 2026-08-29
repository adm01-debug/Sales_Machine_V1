# Requisitos Não-Funcionais — Sales_Machine_V1

> Fonte: código/migrations reais + QA report. `[CONFIRMAR]` = alvo a formalizar com o dono.

## RNF-01 Segurança

- **AuthN:** Supabase Auth; sessão via middleware (`auth-middleware.ts`); telas sob `_authenticated/`.
- **AuthZ:** RBAC `app_role` (admin/operator/viewer) via `user_roles` + `has_role()` SECURITY DEFINER; **RLS em 100% das tabelas** (QA: 13/13 suítes verdes).
- **Webhooks públicos:** HMAC-SHA256 timing-safe (`verifyHmac`), um secret por sistema; anti-replay por `UNIQUE(source, external_id)`.
- **Hooks internos (pg_cron):** autenticados por header `apikey` = publishable key.
- **Segredos:** lidos em request time, nunca em module scope (`config.server.ts`); nunca commitados.
- **Tokens de unsubscribe/confirm:** assinados com `SM_WEBHOOK_SECRET`; confirm com expiração.

## RNF-02 LGPD / Privacidade

- Consentimento como **gate obrigatório** pré-envio (`check_consent`); opt-out por stop-word com efeito imediato.
- Double opt-in em formulários públicos; evidência (`ip_hash`, `user_agent`, `consent_ledger.evidence`).
- Direito de apagamento/exportação por funções dedicadas (Art. 18); apagamento restrito a admin.
- Disclosure de IA na primeira mensagem do agente.
- Dados pessoais mapeados com tag `[PII]` em `.contexto-compartilhado/dicionario-dados.md`.

## RNF-03 Confiabilidade

- **Idempotência:** locks (`locked_until`, 5min), SKIP LOCKED, `ON CONFLICT` — nenhum envio duplicado por retry/tick concorrente.
- **Degradação:** retry com backoff exponencial → `dead_letter` (nunca loop infinito); budget guard **fail-open** (não derruba o tick se a checagem falhar).
- **Append-only:** `sales_machine_events` e `campaign_target_events` preservam auditoria; cleanup somente >1 ano.
- **Locks órfãos:** recuperação de locks travados >10min (função dedicada) `[CONFIRMAR: está agendada?]`.

## RNF-04 Performance

- Tick de cadência processa batch de **10 targets/minuto** `[CONFIRMAR se é teto de design ou default operacional]`; tick-journeys a cada minuto; marketing a cada 5min; alert-sweep a cada 15min.
- Cap de email por sender: 50/dia inicial, ramp +10/dia, teto 500/dia.
- Índices parciais e GIN documentados nas migrations (entity_map metadata, eventos por status...).

## RNF-05 Disponibilidade & SLA

- `[CONFIRMAR]` alvos formais não definidos. Arquitetura depende de: Supabase Cloud (banco + auth + cron), Vite/Nitro host da app, e 4+ sistemas externos (LUX, SINGU, FATOR X, FUXICO, PROMO CHAMPIONS).
- Falha de sistema externo NÃO pode derrubar endpoints (erros 5xx de provider → retry/dead-letter).

## RNF-06 Observabilidade

- Ver `02-arquitetura-engenharia/06-observabilidade.md`: alertas via `ops_alert_notifications` + alert-sweep; auditoria via tabelas append-only; error capture centralizado (`error-capture.ts`, `lovable-error-reporting.ts`).

## RNF-07 Manutenibilidade & processo

- Padrão PromptOps v2.0 (este repo): governança + contexto versionado; mudança estrutural atualiza o dump no mesmo ciclo.
- Testes Vitest colocados junto ao código; baseline atual: 478 testes (61 falhas pré-existentes a sanar — ver pendências).
