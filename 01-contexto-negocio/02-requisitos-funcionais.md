# Requisitos Funcionais — Sales_Machine_V1

> Derivados das rotas/features **reais** do código (não aspiracionais). IDs por módulo. `[CONFIRMAR]` = comportamento inferido a validar.
> Telas reais em `src/routes/_authenticated/`: dashboard, prospecting, campaigns(+:$id), approvals, companies(+:$id), contacts(+:$id), audiences(+:$id), journeys(+:$id), forms(+:$id), library, compliance, deliverability, evals, ops.

## RF — Orquestração outbound 1:1

| ID | Requisito | Evidência |
|---|---|---|
| RF-01 | Ingerir eventos de sistemas externos (LUX/SINGU/FATOR X/FUXICO) via webhooks HMAC, com anti-replay | `webhooks/*.ts`, `UNIQUE(source, external_id)` |
| RF-02 | Manter identidade canônica da entidade entre sistemas (upsert entity_map) | regra de banco #4 |
| RF-03 | Executar cadências multicanal com máquina de estados, lock de 5min, batch de 10/tick | `tick-cadence.ts` |
| RF-04 | Retry com backoff exponencial e dead-letter após max tentativas | `attempts`/`next_retry_at`, benchmark #3 |
| RF-05 | Gate de aprovação humana opcional por campanha (`pending_approval` → tela `/approvals`) | benchmark #4 |
| RF-06 | Cooldown por conta (anti-carpet-bombing) | `has_recent_account_touchpoint()` |
| RF-07 | Presets de cadência (aggressive/standard/enterprise/custom) | `cadence_rules.preset` |
| RF-08 | Fallback de canal social (RCS→?) e detecção de canal social | `isRcsFallbackError`, `isSocialChannel` `[CONFIRMAR detalhes]` |
| RF-09 | Handoff de deal quente para PROMO CHAMPIONS | estado `replied` → handoff `[CONFIRMAR endpoint]` |
| RF-10 | Envio de mensagem manual via agent tool autenticada | `agent-tools/send-message.ts` (Bearer) |

## RF — Marketing broadcast 1:many

| ID | Requisito | Evidência |
|---|---|---|
| RF-11 | Journeys visuais com nós trigger/send/wait/condition/split/goal/exit | `journey_*`, `tick-journeys.ts` |
| RF-12 | Campanhas de marketing com variantes A/B | `marketing_campaigns`, `campaign_variants` |
| RF-13 | Audiências com resolução por regras | `audience-resolver.*`, `audiences`/`audience_members` |
| RF-14 | Biblioteca de templates com variáveis validadas | `library.tsx`, `validate_template_vars()` |
| RF-15 | Preflight de mensagem/template (compliance de termos por nicho) | `message-preflight.ts`, `compliance_terms` |
| RF-16 | Lead forms públicos (`/f/:slug`) com double opt-in (`/confirmar`) | `lead_forms*`, `confirmar.tsx` |
| RF-17 | Descadastro 1-clique com token assinado | `unsubscribe.tsx`, `unsubscribe-token.server.ts` |

## RF — Budgets & Ops

| ID | Requisito | Evidência |
|---|---|---|
| RF-18 | Budget por canal com guarda no envio (fail-open) e realocação automática | `budget*`, `budget-reallocate.ts` |
| RF-19 | Alertas operacionais com sweep periódico, cooldown de notificação e webhook externo | `ops-alerts`, `alert-sweep.ts` |
| RF-20 | Painéis: dashboard, ops, deliverability, compliance, evals, profile360 | telas `_authenticated/` |

## RF — Compliance & LGPD

| ID | Requisito | Evidência |
|---|---|---|
| RF-21 | Gate de consentimento antes de todo envio | `check_consent()` |
| RF-22 | Opt-out por stop-word no reply, gravando consent_ledger imediatamente | `webhooks/singu.ts`, `detectStopWord` |
| RF-23 | Registro de violações de compliance | `compliance_violations_log` |
| RF-24 | Exportação e apagamento de dados pessoais (LGPD Art. 18), apagamento admin-only | funções no dicionário de dados |
| RF-25 | Disclosure de IA na 1ª mensagem do agente | regra de banco #8 |

## RF — Entregabilidade & IA

| ID | Requisito | Evidência |
|---|---|---|
| RF-26 | Warmup de sender com cap diário dinâmico (bounce>5% congela) | `sender_health`, `compute_daily_cap()` |
| RF-27 | Tracking de abertura (pixel) e clique | `track/open.gif`, `track/click` |
| RF-28 | Ingestão de bounce/complaint dedicada | `webhooks/singu-bounce.ts` |
| RF-29 | Scoring de sinais com decay temporal | `signal_weights`, `signal_score()` |
| RF-30 | Churn score de contatos | `contact_churn_scores`, `fn_calculate_churn_risk()` |
| RF-31 | Harness de evals do agente com dataset rotulado | `agent_eval_*`, tela `/evals` |
| RF-32 | Análise de sentimento de respostas | `src/lib/sentiment.ts` |

> User stories e Gherkin: a gerar quando o dono priorizar (template do guia 6.1). Este inventário é a base factual.
