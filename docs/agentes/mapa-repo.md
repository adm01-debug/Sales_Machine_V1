# Mapa do repositório — referência para agentes

Ler quando precisar saber onde fica algo **antes** de buscar por texto.

## Onde olhar primeiro

| Precisa de | Leia |
|---|---|
| Regras de trabalho (git, banco, comunicação, autonomia) | `AGENTS.md` na raiz + `docs/agentes/<tema>.md` |
| As 12 leis inegociáveis, Definition of Done, matriz de autonomia | `00-governanca/01-leis-do-agente.md`, `02-definition-of-done.md`, `03-matriz-de-autonomia.md` |
| **Índice estrutural do código e do schema — antes de qualquer grep** | **`.contexto-compartilhado/dump-arquitetura.json`** (tabelas, colunas, enums, funções, rotas de API, páginas, jobs de cron; gerado por `scripts/gerar-dump-arquitetura.py`) |
| Semântica das tabelas e marcação de PII | `.contexto-compartilhado/dicionario-dados.md` |
| O que já é débito conhecido (não "descobrir" de novo) | `.contexto-compartilhado/pendencias-conhecidas.md` |
| Por que a arquitetura é assim | `02-arquitetura-engenharia/` (stack, C4, modelagem, segurança, contratos, observabilidade) + `adr/` |
| Requisitos, glossário do funil, personas | `01-contexto-negocio/` |
| Histórico e auditorias | `docs/qa-report-2026-07-22.md`, `docs/benchmark-sales-machine.md`, `docs/SCHEMA_REFERENCE.md` (**desatualizado** — ver pendências), `.lovable/plan.md` — contexto, **não** fonte de verdade |

## Mapa rápido

| Onde | O que tem |
|---|---|
| `src/routes/` | rotas TanStack Start (file-based). `__root.tsx`, `index.tsx`, `auth.tsx`, `confirmar.tsx`, `f.$slug.tsx` (lead form público) |
| `src/routes/_authenticated/` | 21 arquivos — telas autenticadas: `dashboard`, `campaigns(.$id)`, `contacts(.$id)`, `companies(.$id)`, `audiences(.$id)`, `journeys(.$id)`, `forms(.$id)`, `approvals`, `compliance`, `deliverability`, `evals`, `library`, `prospecting`, `ops(+ops/index)` |
| `src/routes/api/public/` | **toda** a superfície HTTP pública: `webhooks/{lux,singu,singu-bounce,fatorx,fuxico}`, `hooks/{tick-cadence,tick-journeys,tick-marketing,alert-sweep,budget-reallocate}`, `track/{open[.]gif,click}`, `unsubscribe.tsx`, `agent-tools/send-message` |
| `src/lib/` | 87 arquivos — domínio e server functions. Sufixos: `*.functions.ts` (server fn chamada pela UI), `*.server.ts` (só servidor), `*.test.ts` (teste colocado ao lado). Engines: `cadence-engine`, `journey-engine`, `journey-dispatch.server`, `budget*`, `compliance*`, `message-preflight`, `email-preflight`, `ops-*`, `sentiment`, `audience-resolver.server`, `hmac.server`, `unsubscribe-token.server` |
| `src/integrations/external/` | `config.server.ts` (lê env em **request time**) + clients `lux.server.ts`, `singu.server.ts`, `fatorx.server.ts`, `fuxico.server.ts` |
| `src/integrations/supabase/` | `client.ts` (browser), `client.server.ts` (servidor), `auth-attacher.ts`, `auth-middleware.ts`, `types.ts` |
| `src/integrations/social/` | `types.ts` — **stub**: LinkedIn/Instagram sem envio real (adapter `SocialSender` pendente) |
| `src/components/` | 11 na raiz + `ui/` (46, shadcn/new-york) + `ops/` (7) + `dashboard/`, `email/`, `journeys/`, `campaigns/`, `forms/` |
| `src/test/fake-supabase.ts` | fake do client usado pelos testes (não é `setupFiles`; é importado pelo teste) |
| `src/routeTree.gen.ts` | **gerado** pelo router — nunca editar |
| `supabase/migrations/` | 45 `.sql` aplicados (`20260720132748_…` → `20260802125202_…`) |
| `supabase/functions/migrate-helper/` | edge function Deno **residual e perigosa** — ver `docs/agentes/banco.md` antes de tocar |
| `scripts/gerar-dump-arquitetura.py` | gerador do índice de contexto (Python 3, stdlib) |
| `scripts/ci/check-agents-md-integrity.mjs` | guarda das instruções de agente — roda no CI (`.github/workflows/agents-md-guard.yml`) e à mão |
| `.claude/`, `.agents/`, `.codex/` | skills, hooks (`session-start.sh`, `pre-tool-index-guard.mjs`) e baseline multi-agente |
| `.github/workflows/` | **um** workflow: `agents-md-guard.yml` (integridade das instruções de agente) |

## Comandos

O repo usa **bun** (`bunfig.toml`; `bun.lock`). Há também `package-lock.json` versionado — não deletar
(pendência aberta do dono); **não** usar npm/yarn para instalar.

```bash
bun install                 # deps (bunfig: minimumReleaseAge 86400 — pacote com <24h é recusado)
bun run dev                 # vite dev
bun run build               # vite build (nitro, target cloudflare pelo preset do Lovable)
bun test                    # vitest run — include: src/**/*.test.ts (.test.tsx NÃO é coletado)
bun run lint                # eslint . (prettier é erro de lint)
bun run format              # prettier --write .
bunx tsc --noEmit           # typecheck — NÃO existe script dedicado
python3 scripts/gerar-dump-arquitetura.py             # regerar o índice (Lei 12)
node scripts/ci/check-agents-md-integrity.mjs         # guarda das instruções (o mesmo que o CI roda)
```

Só o que você tocou: `bunx vitest run src/lib/<arquivo>.test.ts`, `bunx eslint <arquivos>`.

- **`node_modules` não vem no clone** e não há lockfile de CI: em sessão nova, `bun install` antes de
  prometer lint/teste/typecheck. Sem isso, o honesto é `NÃO VERIFICADO (deps não instaladas)`.
- **Não há `packageManager` nem `engines` no `package.json`** — a versão de Node/bun não é travada pelo repo.
- **Não há hook de git** (`.husky/` ausente, `core.hooksPath` vazio): nada roda lint, teste ou lint de
  mensagem de commit automaticamente. A régua é você.

## Contexto gerado (equivalente ao grafo de código)

Não há grafo AST neste repo. O índice de contexto é o `dump-arquitetura.json`, gerado por análise
estática das migrations + `src/routes` + `src/integrations`:

- consulte-o **antes** de `grep`/`find` para achar tabela, coluna, enum, função SQL, rota ou job;
- regere e commite no mesmo ciclo em que mudar tabela, rota ou dependência (Lei 12);
- `.claude/hooks/session-start.sh` confere no início da sessão se o dump ainda bate com o código
  (regeneração em diretório temporário, nunca no working tree) e avisa quando está desatualizado.

O dump **não** consulta o banco ao vivo (o MCP do Supabase já apontou para o projeto errado — ver
`docs/agentes/banco.md`): ele descreve o que as migrations dizem, que é o contrato do repo.

**Bug corrigido em 2026-11-08:** até esta data, o gerador só casava `ALTER TABLE … ADD COLUMN` uma
vez por statement (`scripts/gerar-dump-arquitetura.py:80`), então num
`ALTER TABLE x ADD COLUMN a …, ADD COLUMN b …` só a primeira coluna entrava — `campaign_targets`
aparecia sem `locked_until`, `attempts`, `max_attempts` e `last_transition_at`
(`supabase/migrations/20260720181807_….sql:8-12`), e `contact_touchpoints` sem `max_attempts`,
`next_retry_at`, `email_in_reply_to` e `email_references`. Agora o gerador extrai o statement
completo (até o `;`) e procura cada `ADD COLUMN` dentro dele; as 8 colunas passaram a aparecer no
índice sem mudar nenhum outro campo (enums, funções, rotas, páginas, integrações e jobs ficaram
idênticos — conferido comparando o dump antigo com o novo). Mesmo assim, para o estado real da
produção a melhor pista continua sendo `src/integrations/supabase/types.ts` (gerado do banco), já
que o dump descreve as migrations, não o banco ao vivo.

O hook `PreToolUse` (`.claude/hooks/pre-tool-index-guard.mjs`) usa esse índice: quando uma busca por
texto procura nome de tabela, coluna, enum, função SQL, rota, job ou integração que o dump conhece,
ele devolve o que o índice diz, junto ao resultado da busca. Não bloqueia nada (só
`additionalContext`) e é no-op se o termo for desconhecido, se o comando não for busca ou se o dump
não puder ser lido.
