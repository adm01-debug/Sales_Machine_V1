# Contexto do projeto para agentes de IA

GERADO AUTOMATICAMENTE por scripts/ai-context/gerar.mjs — não editar à mão; será sobrescrito.
Publicado em `docs/contexto/codigo/` na branch `contexto` (gerada, nunca abra PR dela) a cada push em `main` e a cada hora pelo workflow `contexto.yml`; índice único das três fontes em `docs/contexto/00-INDEX.md`. Gere local com `node scripts/ai-context/gerar.mjs`. Commit-base: `bbb55e3e671bdc20573f3cbba656d5fda26e69bf` (2026-11-24T05:52:55-03:00).

## Como usar (leia antes de planejar ou executar qualquer tarefa)
1. **Tela/rota/menu** → `rotas.json` (url/vista/menu → arquivo → hooks → tabelas → edges; `rotas_http_backend` para APIs) e `modulos.json` (módulo inteiro + dependências entre módulos).
2. **Hook/serviço/lógica** → `hooks.json`, `logica.json` (quem usa, o que toca, se tem teste).
3. **Edge function / serverless** → `edge-functions.json` (verify_jwt, tabelas, env, quem chama, órfãs).
4. **Banco** → `banco.json` (colunas, RLS, policies, índices, FKs, triggers, cron jobs, buckets, drift migration×types, uso no código) — visão do código; para o banco vivo use o MCP.
5. **Antes de criar arquivo** → `convencoes.json` (onde ficam as coisas, nomenclatura, alias), `componentes.json` (nomes duplicados, órfãos), `grafo.json` (hubs, ciclos de import) e `grafo-graphify.json` (grafo por AST: comunidades, símbolos mais chamados, comunidade de cada arquivo).
6. **CI/scripts/deploy/env/integrações/permissões/flags** → `ferramentas.json` e `scripts.json`.
7. **Antes de abrir PR** → `testes.json` (o que tem e não tem teste, onde os testes ficam), `baseline.json` (alertas, TODOs, hotspots, últimos commits).
Os JSONs são grandes: filtre com `grep`/`jq` pelo caminho/arquivo/tabela da sua tarefa; não carregue tudo.

## Stack
- linguagens: TypeScript (227), SQL (46), Markdown (40), JSON (29), JavaScript (25), YAML (7), Python (6), Shell (3)
- linguagem_principal: TypeScript
- framework: React
- backend_http: n/d
- bundler: Vite
- roteador: tanstack-router
- banco: Supabase
- testes: vitest
- ui: tailwind, radix/shadcn
- estado: react-query
- gerenciador_pacotes: bun
- node: n/d
- python: n/d
- deploy: vercel
- monorepo: n/d
- pastas_fonte: src

## Números
| item | qtd |
|---|---|
| arquivos_total | 390 |
| arquivos_codigo | 258 |
| linhas_codigo | 52026 |
| rotas | 40 |
| rotas_http_backend | 27 |
| vistas_por_id | 0 |
| itens_menu | 13 |
| modulos | 18 |
| componentes | 98 |
| hooks | 4 |
| edge_functions | 0 |
| tabelas | 38 |
| migrations | 45 |
| cron_jobs | 4 |
| testes | 48 |
| workflows | 6 |
| scripts | 18 |
| docs_md | 40 |

## Onde ficam as coisas
- telas: src/routes (40)
- componentes: src/components (70), src/routes (28)
- hooks: src/components (2), scripts/ai-context (1), src/hooks (1)
- servicos_logica: src/lib (60), src/integrations (12), scripts/regras_negocio (2)
- testes: co-localizado (*.test) (33), outro (15)
- edge_functions: n/d
- migrations: supabase/migrations
- scripts: scripts/inventario (4), scripts/maintenance (4), scripts/regras_negocio (3)
- docs: docs (4), (raiz) (2)
- nomenclatura: {"componentes":"camelCase (56%)","hooks":"use + PascalCase","servicos":"outro (47%)","edge_functions":null,"tabelas":"snake_case (89%)"}
- instruções para agentes no repo: AGENTS.md, CLAUDE.md

## Módulos (menu → domínio)
| módulo | itens de menu | telas/rotas | arquivos | hooks locais | edges | tabelas |
|---|---|---|---|---|---|---|
| components | 0 | 0 | 11 | 0 | 8 | 5 |
| components/ops | 0 | 0 | 7 | 0 | 0 | 8 |
| components/ui | 0 | 0 | 46 | 3 | 0 | 0 |
| integrations/external | 0 | 0 | 5 | 0 | 17 | 0 |
| integrations/supabase | 0 | 0 | 5 | 0 | 0 | 0 |
| lib | 0 | 0 | 60 | 0 | 17 | 31 |
| routes | 0 | 4 | 5 | 0 | 0 | 6 |
| routes/_authenticated | 13 | 22 | 22 | 0 | 17 | 31 |
| routes/api | 0 | 29 | 14 | 0 | 14 | 22 |

## Rotas (url → arquivo)
- `/` [tela] → src/routes/index.tsx
- `/_authenticated` [layout] → src/routes/_authenticated/route.tsx (protegida)
- `/api/public/agent-tools/send-message` [api] → src/routes/api/public/agent-tools/send-message.ts
- `/api/public/hooks/alert-sweep` [api] → src/routes/api/public/hooks/alert-sweep.ts
- `/api/public/hooks/budget-reallocate` [api] → src/routes/api/public/hooks/budget-reallocate.ts
- `/api/public/hooks/tick-cadence` [api] → src/routes/api/public/hooks/tick-cadence.ts
- `/api/public/hooks/tick-journeys` [api] → src/routes/api/public/hooks/tick-journeys.ts
- `/api/public/hooks/tick-marketing` [api] → src/routes/api/public/hooks/tick-marketing.ts
- `/api/public/track/click` [api] → src/routes/api/public/track/click.ts
- `/api/public/track/open.gif` [api] → src/routes/api/public/track/open[.]gif.ts
- `/api/public/unsubscribe` [api] → src/routes/api/public/unsubscribe.tsx
- `/api/public/webhooks/fatorx` [api] → src/routes/api/public/webhooks/fatorx.ts
- `/api/public/webhooks/fuxico` [api] → src/routes/api/public/webhooks/fuxico.ts
- `/api/public/webhooks/lux` [api] → src/routes/api/public/webhooks/lux.ts
- `/api/public/webhooks/singu` [api] → src/routes/api/public/webhooks/singu.ts
- `/api/public/webhooks/singu-bounce` [api] → src/routes/api/public/webhooks/singu-bounce.ts
- `/approvals` [tela] → src/routes/_authenticated/approvals.tsx (protegida)
- `/audiences` [tela] → src/routes/_authenticated/audiences.tsx (protegida)
- `/audiences/:id` [tela] → src/routes/_authenticated/audiences.$id.tsx (protegida)
- `/auth` [tela] → src/routes/auth.tsx
- `/campaigns` [tela] → src/routes/_authenticated/campaigns.tsx (protegida)
- `/campaigns/:id` [tela] → src/routes/_authenticated/campaigns.$id.tsx (protegida)
- `/companies` [tela] → src/routes/_authenticated/companies.tsx (protegida)
- `/companies/:id` [tela] → src/routes/_authenticated/companies.$id.tsx (protegida)
- `/compliance` [tela] → src/routes/_authenticated/compliance.tsx (protegida)
- `/confirmar` [tela] → src/routes/confirmar.tsx
- `/contacts` [tela] → src/routes/_authenticated/contacts.tsx (protegida)
- `/contacts/:id` [tela] → src/routes/_authenticated/contacts.$id.tsx (protegida)
- `/dashboard` [tela] → src/routes/_authenticated/dashboard.tsx (protegida)
- `/deliverability` [tela] → src/routes/_authenticated/deliverability.tsx (protegida)
- `/evals` [tela] → src/routes/_authenticated/evals.tsx (protegida)
- `/f/:slug` [tela] → src/routes/f.$slug.tsx
- `/forms` [tela] → src/routes/_authenticated/forms.tsx (protegida)
- `/forms/:id` [tela] → src/routes/_authenticated/forms.$id.tsx (protegida)
- `/journeys` [tela] → src/routes/_authenticated/journeys.tsx (protegida)
- `/journeys/:id` [tela] → src/routes/_authenticated/journeys.$id.tsx (protegida)
- `/library` [tela] → src/routes/_authenticated/library.tsx (protegida)
- `/ops` [tela] → src/routes/_authenticated/ops.tsx (protegida)
- `/ops` [tela] → src/routes/_authenticated/ops/index.tsx (protegida)
- `/prospecting` [tela] → src/routes/_authenticated/prospecting.tsx (protegida)

## Rotas HTTP de backend
- `GET /{t}` → scripts/ai-context/cenarios.mjs
- `GET /a` → scripts/ai-context/cenarios.mjs
- `GET /a` → scripts/ai-context/cenarios.mjs
- `POST /api/public/agent-tools/send-message` → src/routes/api/public/agent-tools/send-message.ts
- `POST /api/public/hooks/alert-sweep` → src/routes/api/public/hooks/alert-sweep.ts
- `POST /api/public/hooks/budget-reallocate` → src/routes/api/public/hooks/budget-reallocate.ts
- `POST /api/public/hooks/tick-cadence` → src/routes/api/public/hooks/tick-cadence.ts
- `POST /api/public/hooks/tick-journeys` → src/routes/api/public/hooks/tick-journeys.ts
- `POST /api/public/hooks/tick-marketing` → src/routes/api/public/hooks/tick-marketing.ts
- `GET /api/public/track/click` → src/routes/api/public/track/click.ts
- `GET /api/public/track/open.gif` → src/routes/api/public/track/open[.]gif.ts
- `GET /api/public/unsubscribe` → src/routes/api/public/unsubscribe.tsx
- `POST /api/public/unsubscribe` → src/routes/api/public/unsubscribe.tsx
- `POST /api/public/webhooks/fatorx` → src/routes/api/public/webhooks/fatorx.ts
- `POST /api/public/webhooks/fuxico` → src/routes/api/public/webhooks/fuxico.ts
- `POST /api/public/webhooks/lux` → src/routes/api/public/webhooks/lux.ts
- `POST /api/public/webhooks/singu` → src/routes/api/public/webhooks/singu.ts
- `POST /api/public/webhooks/singu-bounce` → src/routes/api/public/webhooks/singu-bounce.ts
- `POST /b` → scripts/ai-context/cenarios.mjs
- `POST /b` → scripts/ai-context/cenarios.mjs
- `DELETE /c` → scripts/ai-context/cenarios.mjs
- `PUT /d` → scripts/ai-context/cenarios.mjs
- `GET /items` → scripts/ai-context/gerar.unit.mjs
- `GET /u` → scripts/ai-context/cenarios.mjs
- `GET /users` → scripts/ai-context/cenarios.mjs
- `POST /users/:id` → scripts/ai-context/cenarios.mjs
- `GET /x` → scripts/ai-context/cenarios.mjs

## Vistas por id (menu/ViewRouter → arquivo)
- (nenhum)

## Edge functions
- (nenhum)

## Cron jobs (pg_cron / vercel)
- `sm-alert-sweep` */15 * * * * (20260726170010_e45b5b84-b961-4a56-ba55-c7a6065a1c74.sql)
- `sm-prune-target-events` 20 3 * * 0 (20260726170010_e45b5b84-b961-4a56-ba55-c7a6065a1c74.sql)
- `sm-tick-journeys` * * * * * (20260726184515_4bf8c992-fb49-4971-8a81-708b6f0fa051.sql)
- `sm-tick-marketing` */5 * * * * (20260726145822_0809391e-18de-4ad8-abb1-3020b2670db8.sql)

## Integrações externas
- SDKs: Supabase, react-query, zod
- hosts mais citados: a.com, acme.com.br, bit.ly, x.supabase.co, api.resend.com, api.supabase.com, api.x.com, cdn.acme.com, cloudflare-dns.com, ex.com, hooks.example, maintenance.invalid, open-receipt-ace.lovable.app, production.invalid, production.supabase.co
- webhooks recebidos: POST /api/public/hooks/alert-sweep, POST /api/public/hooks/budget-reallocate, POST /api/public/hooks/tick-cadence, POST /api/public/hooks/tick-journeys, POST /api/public/hooks/tick-marketing, POST /api/public/webhooks/fatorx, POST /api/public/webhooks/fuxico, POST /api/public/webhooks/lux, POST /api/public/webhooks/singu, POST /api/public/webhooks/singu-bounce
- env de integração (só nomes): AGENT_TOOL_TOKEN, FATORX_WEBHOOK_SECRET, FUXICO_WEBHOOK_SECRET, LUX_WEBHOOK_SECRET, OPS_ALERT_WEBHOOK_SECRET, OPS_ALERT_WEBHOOK_URL, PHANTOMBUSTER_API_KEY, SINGU_WEBHOOK_SECRET, SM_WEBHOOK_SECRET, UNIPILE_API_KEY

## Permissões / papéis
- papéis no código: admin (2), donor (2), presentation (2), Orquestrador (1), agent (1), alert (1), button (1), group (1), link (1), navigation (1), region (1), separator (1), status (1), sup (1)
- enums de papel: app_role: admin|operator|viewer
- guards: src/components/ops/budget-guardrails.tsx · rotas protegidas: 22 · públicas: /, /auth, /confirmar, /f/:slug
- feature flags: FEATURE_X, nova-tela, novo-inbox

## Alertas (baseline.json → alertas)
- rotas_sem_arquivo: 0
- componentes_ambiguos: 0
- menu_sem_destino: 0
- edges_orfas: 0
- edges_chamadas_sem_pasta: 17 — ex.: agent-workflow-runner, cerebro-query, create-tracking
- tabelas_sem_rls: 0
- tabelas_usadas_sem_definicao: 1 — ex.: v_pipeline_health
- tabelas_com_drift_migration_vs_types: 0
- rpcs_sem_definicao: 0
- componentes_orfaos: 27 — ex.: src/components/ui/accordion.tsx, src/components/ui/alert-dialog.tsx, src/components/ui/avatar.tsx
- componentes_com_nome_duplicado: 1 — ex.: Route
- scripts_orfaos: 0
- env_usadas_nao_declaradas: 27 — ex.: AGENT_TOOL_TOKEN, FATORX_AGENT_ID_DEFAULT, FATORX_SERVICE_KEY
- ciclos_de_import: 1
- possiveis_segredos_no_codigo: 2 — ex.: scripts/ai-context/cenarios.mjs:102, scripts/ci/inventario-banco.unit.mjs:138

## Grafo de código (graphify)
- 3077 nós · 6712 arestas · 198 comunidades · grafo do commit `bbb55e3e`
- comunidades maiores: generate.py (103), snapshot.py (102), test_snapshot.py (92), gerar.mjs (81), routeTree.gen.ts (68), cn (60), react (59), journey-engine.ts (58), lib.mjs (56), dependencies (55), package.json (51), fake-supabase.ts (50)
- símbolos mais chamados: cn() (src/lib/utils.ts), q() (scripts/supabase_snapshot/snapshot.py), .collect() (scripts/supabase_snapshot/test_snapshot.py), excluded_sql() (scripts/supabase_snapshot/snapshot.py), fail() (scripts/automation.mjs), fail() (scripts/graphify-local.mjs), .metadata() (scripts/supabase_snapshot/test_snapshot.py), MaintenanceError (scripts/maintenance/lib.mjs), header() (scripts/regras_negocio/generate.py), uniq() (scripts/ai-context/gerar.mjs), readText() (scripts/ai-context/gerar.mjs), fail() (scripts/maintenance/lib.mjs)
- consulta local: `graphify query "<pergunta>"`, `graphify path "<A>" "<B>"`, `graphify explain "<X>"`

## Hotspots (arquivos mais alterados, 90 dias)
- CLAUDE.md (3)
- package.json (3)
- src/lib/orchestrator.functions.ts (3)
- src/routes/_authenticated/deliverability.tsx (3)
- src/routes/_authenticated/ops.tsx (3)
- supabase/config.toml (3)
- .github/workflows/contexto.yml (2)
- 00-governanca/01-leis-do-agente.md (2)
- 00-governanca/03-matriz-de-autonomia.md (2)
- 00-governanca/04-changelog-prompts.md (2)
- AGENTS.md (2)
- scripts/automation.mjs (2)
- scripts/automation.unit.mjs (2)
- scripts/gerar-dump-arquitetura.py (2)
- scripts/graphify-local.mjs (2)

## Workflows
- `agents-md-guard.yml` — Guarda das instrucoes de agente (pull_request, push, workflow_dispatch)
- `automation-local.yml` — Automação local (pull_request, push, workflow_dispatch)
- `ci.yml` — CI (pull_request, push, workflow_dispatch)
- `contexto.yml` — Contexto para agentes de IA (horário) (push, schedule, workflow_dispatch; cron 7 3,15 * * *)
- `dependency-review.yml` — Dependency Review (pull_request)
- `inventario-estado-semanal.yml` — Inventário do estado real (semanal) (schedule, workflow_dispatch; cron 23 10 * * 1)

## Scripts npm
- `dev`: `vite dev`
- `build`: `vite build`
- `build:dev`: `vite build --mode development`
- `preview`: `vite preview`
- `lint`: `eslint .`
- `format`: `prettier --write .`
- `test`: `vitest run`
- `maintenance:doctor`: `sh scripts/maintenance/run.sh doctor --root .`
- `maintenance:check`: `sh scripts/maintenance/run.sh check --root . --ref origin/main`
- `maintenance:heal`: `sh scripts/maintenance/run.sh heal --root . --ref origin/main`
- `test:maintenance`: `node --test scripts/maintenance/maintenance.unit.mjs`
- `automation:doctor`: `node scripts/automation.mjs doctor`
- `automation:test`: `node scripts/automation.mjs test`
- `automation:check`: `node scripts/automation.mjs check --ref HEAD`
- `automation:heal`: `node scripts/automation.mjs heal --ref origin/main`
- `automation:nightly`: `node scripts/automation.mjs nightly --ref origin/main`
- `automation:graph`: `node scripts/automation.mjs graph`
- `automation:status`: `node scripts/automation.mjs graph status`
- `automation:install-hooks`: `node scripts/automation.mjs install-hooks`
- `automation:uninstall-hooks`: `node scripts/automation.mjs uninstall-hooks`
- `guards`: `node --test "scripts/ci/*.unit.mjs"`
- `contexto:ia`: `node scripts/ai-context/gerar.mjs --out docs/contexto/codigo`
- `contexto:ia:test`: `node --test scripts/ai-context/gerar.unit.mjs`
- `contexto:regras`: `python3 scripts/regras_negocio/generate.py --repo . --out docs/contexto/regras --profile regras --schema-snapshot docs/contexto/supabase --index-path docs/contexto/00-INDEX.md --no-pointer`
- `contexto:indice`: `python3 scripts/regras_negocio/indice.py --repo . --out docs/contexto/00-INDEX.md --fonte "banco real=docs/contexto/supabase" --fonte "código=docs/contexto/codigo" --fonte "regras de negócio=docs/contexto/regras"`
- `inventario:repo`: `node scripts/inventario/gerar-repo.mjs`
- `inventario:banco`: `node scripts/inventario/gerar-banco.mjs`

## Documentos (raiz e docs/)
- `AGENTS.md` — AGENTS.md — Sales_Machine_V1 (220 linhas)
- `CLAUDE.md` (2 linhas)
- `docs/AUTOMACAO_LOCAL.md` — Automação local — Sales_Machine_V1 (60 linhas)
- `docs/SCHEMA_REFERENCE.md` — SALES MACHINE — Schema Reference (350 linhas)
- `docs/benchmark-sales-machine.md` — Benchmark SALES MACHINE vs. OSS de referência (132 linhas)
- `docs/qa-report-2026-07-22.md` — QA Exhaustive Audit — 2026-07-22 (97 linhas)
- subpastas de docs/: docs/agentes (6), docs/contexto (2)


## Últimos commits
- 2026-11-24 `bbb55e3` chore(ci): reduz cron do contexto para 2x/dia (#17)
- 2026-11-19 `c87ee58` fix: corrige rota do wizard, tipos de error e dual-package do zod nos testes (#24)
- 2026-11-19 `dd28f3e` fix(ci): corrige 6 erros de tipo que quebravam o typecheck do main (#19)
- 2026-11-19 `40909e5` fix(automacao): formata motor recuperado conforme prettier do repo (#18)
- 2026-11-19 `42373d1` chore(security): remove .env do versionamento e adiciona ao .gitignore (#16)
- 2026-11-19 `f1377a4` fix(automacao): recupera motor de automacao local do Sales (PR #3 foi fechada sem merge) (#15)
- 2026-11-19 `978b0c3` Porta os scripts autônomos de contexto do Zapp Web V2 (3 produtores + índice + inventário do estado real) (#2)
- 2026-11-19 `bdc6bab` Replica o padrão de instruções de agente do Zapp Web V2 (AGENTS.md como fonte única + docs/agentes + skills + guard) (#1
- 2026-11-19 `32b0b1a` infra(ci): pipeline de qualidade (bun), dependency review e dependabot agrupado (#8)
- 2026-11-14 `bd9aa1c` fix(ssr): createServerFn usa .validator() — o site de produção dava HTTP 500 (#7)
- 2026-11-14 `fa9a480` chore(lint): zerar erros do ESLint (2649 → 0) (#5)
- 2026-11-13 `ec89dca` Merge pull request #6 from adm01-debug/claude/remove-migrate-helper-261113
- 2026-11-13 `2f1d518` security: remove a edge function migrate-helper
- 2026-11-12 `9ece056` Merge pull request #4 from adm01-debug/claude/fix-vercel-lockfile-261111
- 2026-11-11 `d0d574c` fix(seguranca): atualiza TanStack Start para corrigir CVE-2026-102989

## Arquivos deste diretório
- `docs/contexto/codigo/rotas.json`
- `docs/contexto/codigo/modulos.json`
- `docs/contexto/codigo/componentes.json`
- `docs/contexto/codigo/hooks.json`
- `docs/contexto/codigo/edge-functions.json`
- `docs/contexto/codigo/banco.json`
- `docs/contexto/codigo/ferramentas.json`
- `docs/contexto/codigo/scripts.json`
- `docs/contexto/codigo/testes.json`
- `docs/contexto/codigo/logica.json`
- `docs/contexto/codigo/grafo.json`
- `docs/contexto/codigo/grafo-arestas.json`
- `docs/contexto/codigo/convencoes.json`
- `docs/contexto/codigo/grafo-graphify.json`
- `docs/contexto/codigo/baseline.json`
- `docs/contexto/codigo/manifest.json` (commit, data, hashes, erros — único arquivo com data/hora)
