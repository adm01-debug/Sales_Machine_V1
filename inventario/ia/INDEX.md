# Contexto do projeto para agentes de IA

GERADO AUTOMATICAMENTE por scripts/ai-context/gerar.mjs — não editar à mão; será sobrescrito.
Publicado em `docs/contexto/codigo/` na branch `contexto` (gerada, nunca abra PR dela) a cada push em `main` e a cada hora pelo workflow `contexto.yml`; índice único das três fontes em `docs/contexto/00-INDEX.md`. Gere local com `node scripts/ai-context/gerar.mjs`. Commit-base: `06887bf71cb2b9150581c610e33faff060462107` (2026-11-09T00:38:34+00:00).

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
- linguagens: TypeScript (225), SQL (46), Markdown (35), JSON (24), JavaScript (15), Python (6), TOML (2), YAML (2)
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
- deploy: n/d
- monorepo: n/d
- pastas_fonte: src

## Números
| item | qtd |
|---|---|
| arquivos_total | 361 |
| arquivos_codigo | 246 |
| linhas_codigo | 44372 |
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
| testes | 44 |
| workflows | 2 |
| scripts | 11 |
| docs_md | 35 |

## Onde ficam as coisas
- telas: src/routes (40)
- componentes: src/components (70), src/routes (28)
- hooks: src/components (2), scripts/ai-context (1), src/hooks (1)
- servicos_logica: src/lib (59), src/integrations (12), scripts/regras_negocio (2)
- testes: co-localizado (*.test) (32), outro (12)
- edge_functions: n/d
- migrations: supabase/migrations
- scripts: scripts/inventario (4), scripts/regras_negocio (3), scripts/ai-context (2)
- docs: docs (3), (raiz) (2)
- nomenclatura: {"componentes":"camelCase (56%)","hooks":"use + PascalCase","servicos":"outro (48%)","edge_functions":null,"tabelas":"snake_case (89%)"}
- instruções para agentes no repo: AGENTS.md, CLAUDE.md

## Módulos (menu → domínio)
| módulo | itens de menu | telas/rotas | arquivos | hooks locais | edges | tabelas |
|---|---|---|---|---|---|---|
| components | 0 | 0 | 11 | 0 | 8 | 5 |
| components/ops | 0 | 0 | 7 | 0 | 0 | 8 |
| components/ui | 0 | 0 | 46 | 3 | 0 | 0 |
| integrations/external | 0 | 0 | 5 | 0 | 17 | 0 |
| integrations/supabase | 0 | 0 | 5 | 0 | 0 | 0 |
| lib | 0 | 0 | 59 | 0 | 17 | 31 |
| routes | 0 | 4 | 5 | 0 | 0 | 6 |
| routes/_authenticated | 13 | 22 | 22 | 0 | 17 | 31 |
| routes/api | 0 | 29 | 14 | 0 | 14 | 22 |

## Rotas (url → arquivo)
- `/` [layout] → src/routes/_authenticated/route.tsx (protegida)
- `/` [tela] → src/routes/index.tsx
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
- hosts mais citados: a.com, acme.com.br, bit.ly, x.supabase.co, api.resend.com, api.supabase.com, api.x.com, cdn.acme.com, cloudflare-dns.com, ex.com, hooks.example, open-receipt-ace.lovable.app, pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev
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
- ciclos_de_import: 0
- possiveis_segredos_no_codigo: 2 — ex.: scripts/ai-context/cenarios.mjs:102, scripts/ci/inventario-banco.unit.mjs:138

## Grafo de código (graphify)
- não gerado neste run. uvx --from "graphifyy[sql]" graphify update .  (ou: bun run graph:update); saída em graphify-out/ — graph.json e graph.html NÃO são versionados (dezenas de MB); use `graphify query/path/explain` localmente

## Hotspots (arquivos mais alterados, 90 dias)
- CLAUDE.md (2)
- inventario/estado/edges.json (2)
- scripts/ci/inventario-banco.unit.mjs (2)
- scripts/ci/inventario-repo.unit.mjs (2)
- scripts/inventario/gerar-banco.mjs (2)
- scripts/inventario/gerar-repo.mjs (2)
- supabase/config.toml (2)
- .github/workflows/contexto.yml (1)
- .github/workflows/inventario-estado-semanal.yml (1)
- 00-governanca/01-leis-do-agente.md (1)
- 00-governanca/02-definition-of-done.md (1)
- 00-governanca/03-matriz-de-autonomia.md (1)
- 00-governanca/04-changelog-prompts.md (1)
- 01-contexto-negocio/01-visao-produto.md (1)
- 01-contexto-negocio/02-requisitos-funcionais.md (1)

## Workflows
- `contexto.yml` — Contexto para agentes de IA (horário) (push, schedule, workflow_dispatch; cron 7 * * * *)
- `inventario-estado-semanal.yml` — Inventário do estado real (semanal) (schedule, workflow_dispatch; cron 23 10 * * 1)

## Scripts npm
- `dev`: `vite dev`
- `build`: `vite build`
- `build:dev`: `vite build --mode development`
- `preview`: `vite preview`
- `lint`: `eslint .`
- `format`: `prettier --write .`
- `test`: `vitest run`
- `guards`: `node --test "scripts/ci/*.unit.mjs"`
- `contexto:ia`: `node scripts/ai-context/gerar.mjs --out docs/contexto/codigo`
- `contexto:ia:test`: `node --test scripts/ai-context/gerar.unit.mjs`
- `contexto:regras`: `python3 scripts/regras_negocio/generate.py --repo . --out docs/contexto/regras --profile regras --schema-snapshot docs/contexto/supabase --index-path docs/contexto/00-INDEX.md --no-pointer`
- `contexto:indice`: `python3 scripts/regras_negocio/indice.py --repo . --out docs/contexto/00-INDEX.md --fonte "banco real=docs/contexto/supabase" --fonte "código=docs/contexto/codigo" --fonte "regras de negócio=docs/contexto/regras"`
- `inventario:repo`: `node scripts/inventario/gerar-repo.mjs`
- `inventario:banco`: `node scripts/inventario/gerar-banco.mjs`

## Documentos (raiz e docs/)
- `AGENTS.md` — AGENTS.md — Sales_Machine_V1 (33 linhas)
- `CLAUDE.md` — Instruções para Agentes — Sales_Machine_V1 (96 linhas)
- `docs/SCHEMA_REFERENCE.md` — SALES MACHINE — Schema Reference (350 linhas)
- `docs/benchmark-sales-machine.md` — Benchmark SALES MACHINE vs. OSS de referência (132 linhas)
- `docs/qa-report-2026-07-22.md` — QA Exhaustive Audit — 2026-07-22 (97 linhas)
- subpastas de docs/: docs/contexto (7)


## Últimos commits
- 2026-11-09 `06887bf` fix(inventario): corrige ENOENT em edgesNoRepo quando supabase/functions/ ausente
- 2026-11-08 `99936f3` security(functions): remove migrate-helper (vazava service_role e DB_URL sem auth real)
- 2026-11-08 `b5428f0` feat(contexto): porta os scripts autônomos de contexto do Zapp_Web_V2
- 2026-08-30 `ae912a3` docs(contexto): atualiza ref de commit no decisoes-recentes e regera dump pós-rebase
- 2026-08-30 `34453a0` docs(contexto): corrige enums no dicionario de dados — sm_channel ganhou rcs/mms e sm_source ganhou fuxico via ALTER TYP
- 2026-08-30 `f2f9939` docs(negocio+arquitetura): 01-contexto-negocio/ (visao, 32 RFs reais, RNFs, glossario LUX/SINGU/FATORX/FUXICO, personas 
- 2026-08-30 `59425bf` docs(governanca): 00-governanca/ — 12 leis do agente, definition of done (adaptado a baseline vermelha), matriz de auton
- 2026-08-30 `7372541` docs(contexto): memoria operacional PromptOps — CLAUDE.md (formato 3.2, stack real, env vars reais), AGENTS.md (ponte Pr
- 2026-08-30 `5609fa4` docs(contexto): decodifica CLAUDE.md e SCHEMA_REFERENCE.md de base64 para markdown
- 2026-08-28 `338899a` Visual edit in Lovable
- 2026-08-18 `51f658f` chore(hermes): adiciona .hermes.md (regras da casa Hermes)
- 2026-08-02 `388dc5f` Adicionou suporte a emojis
- 2026-08-02 `1fcf792` Changes
- 2026-08-02 `7235600` Changes
- 2026-08-02 `84f8e41` Changes

## Arquivos deste diretório
- `inventario/ia/rotas.json`
- `inventario/ia/modulos.json`
- `inventario/ia/componentes.json`
- `inventario/ia/hooks.json`
- `inventario/ia/edge-functions.json`
- `inventario/ia/banco.json`
- `inventario/ia/ferramentas.json`
- `inventario/ia/scripts.json`
- `inventario/ia/testes.json`
- `inventario/ia/logica.json`
- `inventario/ia/grafo.json`
- `inventario/ia/grafo-arestas.json`
- `inventario/ia/convencoes.json`
- `inventario/ia/grafo-graphify.json`
- `inventario/ia/baseline.json`
- `inventario/ia/manifest.json` (commit, data, hashes, erros — único arquivo com data/hora)
