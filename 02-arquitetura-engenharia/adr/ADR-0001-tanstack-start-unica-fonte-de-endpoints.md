# ADR-0001: TanStack Start como única fonte de endpoints (Postgres como fila)

> Status: aceito (retroativo — documentado em 2026-08-29 a partir do código e do QA report) · Data original: ~2026-07 `[CONFIRMAR]`

## Contexto

O sistema nasceu com edge functions Deno em `supabase/functions/` (webhook-*, tick-*, singu-send...) e migrou para server routes do TanStack Start. Restou duplicidade. Em paralelo, precisava-se de fila para os workers de cadência/journey/marketing, com a opção óbvia de broker externo (Trigger.dev/Inngest) ou Postgres puro.

## Decisão

1. **TanStack Start (`src/routes/api/`) é a única fonte da verdade de endpoints.** As edge functions Deno legadas foram removidas (verificado 2026-08-29); pg_cron e webhooks externos apontam apenas para rotas TSS.
2. **Postgres é a fila**: `campaign_targets.next_run_at` + `locked_until` + `FOR UPDATE SKIP LOCKED`, acionado por pg_cron chamando os hooks TSS. Sem broker externo.

## Alternativas rejeitadas

- **Manter edge functions Deno** — duplicidade de código diverge; dois lugares para a mesma regra violam a Lei 9.
- **Trigger.dev/Inngest** — volume esperado não justifica a dependência operacional e de billing; pg_cron + tick endpoint já entrega idempotência e retentativa (benchmark: "fora do radar por enquanto").
- **Fila dedicada (SQS/BullMQ)** — adiciona infra para um problema que o Postgres resolve com garantias transacionais superiores (estado e fila na mesma transação).

## Consequências

**Positivas:** stack menor; deploy único; fila e estado na mesma transação (sem dual-write); testes rodam contra a mesma superfície que produção usa.
**Negativas:** throughput de fila limitado ao batch por tick (10 targets/min no cadence); pg_cron é pouco observável nativamente; se o volume explodir, a decisão precisa ser revista; Nitro 3 em beta é risco de plataforma.

## Gatilho de revisão

- Fila de targets elegíveis consistentemente maior que a capacidade do tick (backlog crescente por >24h).
- Necessidade de retries com jitter/orquestração visual complexa.
- Nitro/TanStack Start quebrar compatibilidade em upgrade major.
