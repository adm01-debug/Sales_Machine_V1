# Deploy, Lovable e "está no ar?" — referência para agentes

Ler antes de dizer que algo foi entregue, ou ao mexer em build, env de execução ou histórico de git.

## Como este projeto chega perto de produção

- O repo é **conectado ao Lovable** (`.lovable/project.json`: template `tanstack_start_ts_current`).
  Commits enviados à branch conectada (`main`) sincronizam de volta para o editor do Lovable e
  aparecem lá — por isso `main` precisa ficar sempre em estado funcional.
- **Não há workflow de deploy** (não há `.github/`), nem Vercel, nem `deploy-functions`. Não existe
  pipeline neste repo: merge em `main` é o que publica, pelo lado do Lovable.
- Build: `vite build` com o preset `@lovable.dev/vite-tanstack-config`, que já inclui `tanstackStart`,
  `viteReact`, `tailwindcss`, `tsConfigPaths` e **nitro com target cloudflare por padrão**
  (`vite.config.ts:1-6`). Não adicione esses plugins à mão: duplicar plugin quebra o app.
- A entrada do servidor é redirecionada para `src/server.ts` (wrapper de erro SSR) via
  `tanstackStart: { server: { entry: "server" } }`.

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
| Deploy | o Lovable publicou a `main`? | **não há check automático**; se não houver como confirmar, diga "deploy não confirmado" |
| Comportamento | log, query no banco, request real | sem MCP apontando para `twkajyybcwvideusutsb` nesta sessão, verificação no banco é `NÃO VERIFICADO` |

Faltou um dos três: diga em que ponto parou. Nunca "deveria funcionar".
