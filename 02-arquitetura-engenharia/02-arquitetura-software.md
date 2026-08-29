# Arquitetura de Software — Sales_Machine_V1

> Estilo: **modular monolith full-stack** (TanStack Start) + Postgres como fila e motor de estado. Fonte: código real.

## C4 — Nível 1 (Contexto)

```
                         ┌──────────────┐
                         │    LUX       │ descoberta ICP
                         └──────┬───────┘
                                │ webhook HMAC
┌───────────┐  gera msg  ┌──────▼───────────────────────────────┐
│  FATOR X  │◀──────────▶│         SALES MACHINE                │
│   (IA)    │  decisões  │  TanStack Start + Supabase Postgres  │
└───────────┘            │                                      │
                         │  cadence engine · journey engine     │
┌───────────┐  envios ◀──│  compliance · budget · consent gate  │──▶ OPERADOR (UI)
│   SINGU   │            └──────┬───────────────────┬───────────┘
│ (executor/│──▶ eventos ───────┘                   │
│   CRM)    │  (reply/bounce)                       │ handoff deal
└───────────┘                              ┌────────▼────────┐
┌───────────┐  tracking open/click         │ PROMO CHAMPIONS │
│  FUXICO   │◀─────────────────────────────│  (fechamento)   │
└───────────┘                              └─────────────────┘
```

## C4 — Nível 2 (Containers/módulos internos)

| Módulo | Onde | Responsabilidade |
|---|---|---|
| **Webhooks** | `src/routes/api/public/webhooks/` | Ingestão HMAC: lux, singu, singu-bounce, fatorx, fuxico |
| **Workers (hooks)** | `src/routes/api/public/hooks/` | `tick-cadence` (1:1, 1min), `tick-journeys` (1min), `tick-marketing` (5min), `alert-sweep` (15min), `budget-reallocate` — chamados por pg_cron com `apikey` |
| **Engines puras** | `src/lib/*-engine.ts` | `cadence-engine` (decisão de ação), `journey-engine`/`journey-graph` — **puras e testáveis**, separadas do I/O |
| **Server functions** | `src/lib/*.functions.ts` | API da UI: `requireSupabaseAuth` + Zod |
| **Integrações** | `src/integrations/{external,social,supabase,lovable}` | clients + `config.server.ts` (env em request time) |
| **UI** | `src/routes/_authenticated/` | 20+ telas operacionais |
| **Banco** | `supabase/migrations/` | 36 tabelas, 14 enums, máquina de estados em triggers, RLS total |

## Decisões estruturais chave

1. **Postgres como fila** (SKIP LOCKED + `locked_until` + `next_run_at`) em vez de broker externo — ver ADR-0001 e benchmark ("fora do radar: Trigger.dev/Inngest").
2. **Engines puras separadas do I/O**: a decisão (o que fazer com um target) é função pura; a execução (chamar SINGU) fica no worker. Facilita os 478 testes.
3. **Máquina de estados no banco** (triggers `tg_*`): transição inválida falha na transação, não no código de aplicação.
4. **TSS é a única fonte de endpoints** (edge functions Deno foram descontinuadas — ver pendências).
5. **Fail-open apenas onde seguro**: budget guard falha aberto; consentimento falha **fechado** (erro ao checar consentimento = não envia) `[CONFIRMAR implementação exata do fail-closed]`.

## Diagrama do fluxo 1:1 (tick-cadence)

```
pg_cron ─▶ POST /api/public/hooks/tick-cadence (apikey)
  └▶ SELECT campaign_targets elegíveis (state IN queued/running, next_run_at<=now, lock livre, LIMIT 10)
     └▶ por target: lock 5min → fatos (check_consent, cooldown conta, bounce, cap email, budget)
        └▶ cadence-engine decide: enviar | esperar | dead_letter | completed
           └▶ enviar → FATOR X (mensagem) → [approval gate?] → adapter canal (SINGU/social stub)
              └▶ touchpoint gravado; backoff em falha; replied vem via webhook-singu
```
