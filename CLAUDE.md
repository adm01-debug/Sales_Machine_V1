# Instruções para Agentes — Sales_Machine_V1

> Memória operacional do repo (Guia PromptOps v2.0, sec. 3.2). Governança em `00-governanca/` sobrepõe qualquer instrução aqui. Snapshot estrutural em `.contexto-compartilhado/dump-arquitetura.json`.

## O que é este sistema

Sistema de **prospecção outbound com IA** (SaaS B2B). Funil: **LUX** (descoberta de ICP/leads) → orquestração de cadências multicanal 1:1 (WhatsApp, email, SMS; LinkedIn/Instagram em stub) → **SINGU** (canal executor/CRM) → **FATOR X** (geração de mensagens com IA) → **PROMO CHAMPIONS** (handoff de deals quentes). Também tem módulo broadcast 1:many (journeys, audiências, lead forms).
**Criticidade:** envia mensagens reais para pessoas reais. Erro = spam, bloqueio de sender e violação de LGPD. Consentimento (`check_consent`) e disclosure de IA são inegociáveis.

## Stack (versões exatas)

- **Runtime/linguagem:** TypeScript 5.8 (strict) · React 19.2 · Node 22 (tipos) · **bun** (gerenciador canônico — `bunfig.toml` presente; nunca npm/yarn)
- **Framework:** TanStack Start 1.168 + Router 1.170 + Query 5.101 · Vite 8 · Nitro 3 (beta)
- **UI:** Tailwind CSS 4.2 + shadcn/ui (Radix) · formulários: react-hook-form 7 + Zod 3.24
- **Banco:** PostgreSQL (Supabase Cloud), schema `public`, RLS em todas as tabelas, pg_cron
- **Testes:** Vitest 4.1 · Lint: ESLint 9 + Prettier 3
- **Cliente Supabase:** @supabase/supabase-js 2.110

## Comandos canônicos

```bash
bun install          # instalar deps
bun run dev          # dev server (vite dev)
bun run build        # build de produção
bun test             # testes (vitest run)
bun run lint         # eslint .
bun run format       # prettier --write .
bunx tsc --noEmit    # typecheck (não há script dedicado)
python3 scripts/gerar-dump-arquitetura.py   # regerar dump após mudança estrutural (Lei 12)
```

## Convenções que NÃO se discutem

- **TSS é a fonte da verdade dos endpoints.** As edge functions Deno legadas já foram removidas (`supabase/functions/` ausente desde antes de 2026-08-29); reintroduzi-las exige ADR.
- **Server functions** (`src/lib/*.functions.ts`): sempre `requireSupabaseAuth` + validador Zod.
- **Webhooks públicos** (`src/routes/api/public/`): sempre verificação HMAC-SHA256 com timing-safe compare.
- **Banco:** snake_case; datas `timestamptz` UTC; migrations sempre **novas** (nunca editar aplicada).
- **Imports:** alias `@/` para `src/`.

### As 10 regras críticas do banco (NUNCA violar)

1. **SKIP LOCKED** no tick de cadência (`FOR UPDATE SKIP LOCKED LIMIT 100`)
2. **`check_consent()` obrigatório** antes de qualquer envio (singu-send, sms, email...)
3. **`UNIQUE(source, external_id)`** em `sales_machine_events` → `INSERT ... ON CONFLICT DO NOTHING`
4. **`entity_map` upsert** — `ON CONFLICT (kind, lux_id) DO UPDATE`; nunca INSERT direto
5. **Nunca** UPDATE em `campaign_targets.state` fora da máquina de estados (triggers `tg_*`)
6. **`locked_until`** — sempre setar ao pegar um target; sempre limpar ao terminar
7. **`campaign_target_events` / `sales_machine_events` são append-only** (cleanup só >1 ano)
8. **Disclosure de IA** na primeira mensagem do agente
9. **Stop words de opt-out** detectadas no webhook SINGU → `consent_ledger` imediatamente
10. **LGPD** — apagamento de dados pessoais só via função dedicada (admin), nunca DELETE manual

## Mapa do código

- **Páginas (UI autenticada):** `src/routes/_authenticated/` (dashboard, campaigns, approvals, journeys, audiences, forms, compliance, deliverability, evals, ops...)
- **Endpoints públicos (API):** `src/routes/api/public/` — `webhooks/{lux,singu,singu-bounce,fatorx,fuxico}`, `hooks/{tick-cadence,tick-journeys,tick-marketing,alert-sweep,budget-reallocate}`, `track/{open.gif,click}`, `unsubscribe`, `agent-tools/send-message`
- **Lógica de domínio:** `src/lib/` — engines: `cadence-engine`, `journey-engine`, `budget*`, `compliance*`, `message-preflight`, `email-preflight`, `ops-*`, `sentiment`; server fns: `*.functions.ts`
- **Integrações:** `src/integrations/{supabase,external,lovable,social}` — clients LUX/SINGU/FATOR X em `external/`
- **Banco:** `supabase/migrations/` (45 aplicadas) · referência de schema: `.contexto-compartilhado/dicionario-dados.md`
- **Testes:** `*.test.ts` colocados junto ao código + `src/test/` (fake-supabase)

## Armadilhas conhecidas deste repo

- **Baseline de qualidade vermelha (pré-existente, 2026-08-29):** lint com 2.639 problemas e 61 testes falhando. Não piore; saneamento é pendência registrada (ver `.contexto-compartilhado/pendencias-conhecidas.md`).
- **`docs/SCHEMA_REFERENCE.md` está desatualizado** (diz "009 migrations", cita enums/tabelas aspiracionais). Fonte canônica: `.contexto-compartilhado/dump-arquitetura.json` + `dicionario-dados.md`.
- **Dois lockfiles:** bun é canônico; **não delete** `package-lock.json` (pendência aberta do dono).
- **MCP Supabase pode apontar para o banco errado** — valide o schema antes de confiar na introspecção.
- **Não há CI** (`.github/` inexistente): testes e lint não rodam automaticamente — rodar local é obrigação sua.
- **`.env` existe mas não há `.env.example`** — variáveis documentadas abaixo; nunca commitar valores.

### Variáveis de ambiente (nomes REAIS, conferidos no código em 2026-08-29)

```bash
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY  # core (publishable autentica os hooks pg_cron via header `apikey`)
LUX_URL / LUX_SERVICE_KEY / LUX_WEBHOOK_SECRET                       # por sistema externo,
SINGU_URL / SINGU_SERVICE_KEY / SINGU_WEBHOOK_SECRET                 # mesmo padrão
FATORX_URL / FATORX_SERVICE_KEY / FATORX_WEBHOOK_SECRET / FATORX_AGENT_ID_DEFAULT
FUXICO_URL / FUXICO_SERVICE_KEY / FUXICO_WEBHOOK_SECRET              # tracking
SM_WEBHOOK_SECRET                                                    # assinatura de unsubscribe tokens
UNIPILE_* (stubs sociais — ver src/integrations/social/types.ts)     # ainda não configurado
```

> ⚠️ O CLAUDE.md antigo (pré-2026-08-29) citava nomes errados (`SINGU_API_KEY`, `SM_WEBHOOK_SECRET_LUX`...). A fonte é `src/integrations/external/config.server.ts` — lidos em `process.env` **em request time**, nunca em module scope.

## O que o agente NUNCA faz aqui

- Bypassar `check_consent()` ou qualquer gate de consentimento — **em hipótese nenhuma**
- UPDATE direto em `campaign_targets.state`; INSERT direto em `entity_map`; DELETE em tabelas append-only
- Apagar dados pessoais por DELETE manual (só função LGPD dedicada)
- Alterar migration já aplicada; desabilitar RLS "temporariamente"
- Commitar segredos ou `.env`; expor valores de env em logs/respostas
- Force-push, rebase ou squash de histórico publicado (repo conectado ao Lovable — ver `AGENTS.md`)
- Criar endpoints públicos sem HMAC/auth explícito
- "Corrigir" a baseline de lint/test em massa sem autorização (escopo próprio)

