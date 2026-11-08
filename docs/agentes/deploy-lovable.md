# Deploy (Vercel + Lovable) e "está no ar?" — referência para agentes

Ler antes de dizer que algo foi entregue, ou ao mexer em build, env de execução ou histórico de git.

## Como este projeto chega em produção

Há **dois** destinos, e nenhum deles é workflow deste repo (não existe `.github/`):

| Destino | O que recebe | Evidência |
|---|---|---|
| **Vercel** — projeto `sales-machine-v1` (`prj_oOmURRkxqkN45BrjH5VFzKFbAuXn`), team `juca1` (`team_QyN41X0q8hrqhW80AwokbFLv`) | integração Git: **push em branch gera preview**, **merge em `main` gera deploy de produção** | produção `READY` no SHA `ae912a3` da `main`; preview do push desta sessão criado automaticamente (`mcp__Vercel__list_deployments`) |
| **Lovable** | commits na branch conectada (`main`) sincronizam de volta para o editor | `.lovable/project.json` (template `tanstack_start_ts_current`) |

- Confirme o deploy pelo MCP **`Vercel`** (`list_deployments` filtrando `projectId`), olhando `state`
  (`BUILDING` → `READY`/`ERROR`), `target` (`production` só no da `main`) e `meta.githubCommitSha` —
  é o único jeito de dizer "subiu" com evidência.
- **Limite de evidência medido em 2026-11-08:** neste MCP só `list_projects` e `list_deployments`
  respondem. `get_deployment`, `list_deployment_events` (log de build) e `filter_project_envs`
  devolvem **404 not_found** mesmo com `teamId` correto e para o deployment de produção que o próprio
  `list` acabou de retornar — é escopo do conector, não deployment inexistente. Ou seja: dá para saber
  **se** falhou, não **por quê**. Para a causa, o log fica no `inspectorUrl` do deployment (acesso do
  dono) — não invente a causa a partir do diff.
- **Preview falhando com diff só de documentação** já aconteceu (push de 2026-11-08, SHA `59a1e3f`:
  produção `READY` na `main`, preview da branch `ERROR`). Antes de culpar o seu diff, lembre que o
  preview pode quebrar por falta de variável de ambiente no ambiente *Preview* ou pelo
  `minimumReleaseAge` do `bunfig.toml` durante o `bun install` — e que nada disso foi confirmado.
- O repo declara `homepage: https://sales-machine-v1.vercel.app`. Qual domínio/alias serve a produção
  hoje: **NÃO VERIFICADO** (não listei aliases nesta sessão).
- Build: `vite build` com o preset `@lovable.dev/vite-tanstack-config`, que já inclui `tanstackStart`,
  `viteReact`, `tailwindcss`, `tsConfigPaths` e **nitro, cujo target padrão do preset é cloudflare**
  (`vite.config.ts:1-6`). Não adicione esses plugins à mão: duplicar plugin quebra o app. Qual preset
  do nitro a build da Vercel usa de fato: **NÃO VERIFICADO** — confira o log do deployment antes de
  mexer em target.
- A entrada do servidor é redirecionada para `src/server.ts` (wrapper de erro SSR) via
  `tanstackStart: { server: { entry: "server" } }`.
- Variáveis de execução (as 26 de `src/`, ver `docs/agentes/integracoes.md`) vivem no ambiente do
  destino — no Vercel, em Project Settings → Environment Variables. Nunca segredo de servidor com
  prefixo `VITE_`: `VITE_*` entra no bundle e é público.

## O que o cron chama hoje

Os três `cron.schedule` nas migrations apontam para
`https://project--c4a241c3-45be-40f8-862c-f2e559cf55fe.lovable.app/api/public/hooks/...` — ou seja, para
a **URL de preview do Lovable**, com a publishable key no header `apikey`
(`supabase/migrations/20260726145822_….sql:6-9`). Consequências:

- trocar de domínio, ou publicar em outro host, **não** redireciona os jobs: é migration nova;
- a URL de preview é o que está em produção para efeito de cadência/journeys/alertas;
- `PUBLIC_SITE_URL` é a variável que o código usa para montar links (tracking, unsubscribe): se ela
  divergir do host real, o lead recebe link quebrado.

## Histórico de git: não reescrever

O bloco `LOVABLE` no topo do `AGENTS.md` não é decoração. Force-push, rebase, amend ou squash de
commits já enviados reescreve o histórico do lado do Lovable e o dono perde histórico do projeto.
Em conflito: merge ou commit novo. `--force-with-lease` **não** é exceção aqui.

## "Pronto" neste repo

A régua do `AGENTS.md` é PR mergeada + deploy confirmado + comportamento verificado. Aqui, na prática:

| Etapa | Como confirmar | Limite real |
|---|---|---|
| PR mergeada | link da PR + estado | — |
| Deploy | deployment da Vercel no seu SHA com `state: READY` e `target: production` (MCP `Vercel`) | não dá para confirmar → diga "deploy não confirmado" |
| Comportamento | log, query no banco, request real | sem MCP apontando para `twkajyybcwvideusutsb` nesta sessão, verificação no banco é `NÃO VERIFICADO` |

Faltou um dos três: diga em que ponto parou. Nunca "deveria funcionar".
