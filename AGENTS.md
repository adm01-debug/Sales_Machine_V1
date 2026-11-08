<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS.md — Sales_Machine_V1

Regras do dono para qualquer agente de IA; vencem `docs/` (histórico). Detalhe em
`docs/agentes/<tema>.md`; divergiu da realidade → corrija no mesmo PR do fix. As 12 leis em
`00-governanca/01-leis-do-agente.md` continuam valendo e são o detalhe normativo desta página
(Definition of Done em `02-definition-of-done.md`, autonomia em `03-matriz-de-autonomia.md`).
`.hermes.md` é suplemento operacional da casa (barreiras de escrita, subpasta por sessão).
Responda sempre em PT-BR.

**O que é este sistema:** prospecção outbound com IA (SaaS B2B). LUX (descoberta de ICP) →
cadências multicanal 1:1 (WhatsApp, email, SMS; LinkedIn/Instagram em stub) → SINGU (executor/CRM) →
FATOR X (mensagem por IA) → PROMO CHAMPIONS (handoff). Mais um módulo broadcast 1:many (journeys,
audiências, lead forms). **Envia mensagem real para pessoa real:** erro = spam, bloqueio de sender e
violação de LGPD.

## Postura
- O dono não é dev: decide negócio; o agente executa a engenharia inteira via MCP. Nunca passo manual
  do dono nem pedir que ele revise diff.
- Qualidade + velocidade, mínimo de tokens. Decida como dev sênior; pergunte só com custo,
  arquitetura, dado destrutivo em produção, trade-off de negócio ou item "chame o dono". Para ler,
  não peça permissão.
- Verdade acima de validação: não sabe → diga; falhou → diga. Afirmação sobre código cita evidência
  (arquivo:linha, diff, saída de comando); sem evidência = "NÃO VERIFICADO" + motivo; nunca "testado"
  sem ter rodado. Branch/commit/PR não provam nada — leia o código. Aqui isso é literal: a doc antiga
  deste repo afirmava coisas que o código desmente (ver "Armadilhas").
- Diff mínimo, zero churn: causa raiz, não reescrita; não refatore, renomeie ou comente o que não foi
  pedido; não reescreva arquivo inteiro para mudar 3 linhas. Dependência nova ou bump major só se
  indispensável (avise na PR).
- `APROVADO` = execute o plano como descrito, sem reconfirmar.
- Uma tarefa por vez, cada uma com sua branch/PR. Outro bug → "Próximos passos". Travou → reporte o
  erro exato e pare; não contorne regra. Releia o pedido antes de concluir.
- Tokens: leia só o trecho necessário; `.contexto-compartilhado/dump-arquitetura.json` antes de busca
  por texto; exploração ampla → subagente; nenhuma tool "por garantia"; não gere código que não será
  aplicado.
- Segredos nunca em código, commit ou resposta — só em variável de ambiente do serviço. `.env` está
  **versionado** neste repo (hoje só com dados públicos do Supabase): nunca escreva chave de servidor
  nele. Nada de `service_role`, `*_SERVICE_KEY`, `*_WEBHOOK_SECRET` ou `AGENT_TOOL_TOKEN` em arquivo.
  PAT exposto em chat → rotacionar na hora.

## Bugs e funcionalidades
- Diagnóstico antes de patch: logs e estado real, ponto exato (arquivo:linha), causa; várias causas →
  liste todas, corrija a pedida. Máximo 3 tentativas na mesma hipótese; depois pare e reporte.
- Antes da PR: typecheck/lint/testes do que tocou (`bun install` primeiro — o clone vem sem
  `node_modules`). Só erro seu conta; erro herdado da `main` → "Próximos passos". A baseline é
  vermelha de propósito (2.639 problemas de lint, 61 testes falhando): a régua é **não piorar**.
- "Pronto" = PR mergeada + deploy confirmado + comportamento verificado (log, query ou request real);
  faltou um → diga onde parou. Aqui não há CI nem check de deploy: ver `docs/agentes/deploy-lovable.md`.
- Funcionalidade pronta = integrada ponta a ponta (rota registrada, entrada na UI, server fn/hook
  chamados, tabela com RLS, estados erro/loading/vazio, submit), sem mock, hardcode ou TODO. Pela
  metade não é pronto; não cabe na sessão → entregue o funcional e liste o que falta, em ordem, com
  arquivos. Nunca deixe código morto ou feature "quase" sem dizer.

## Comunicação
- Resultado primeiro, só o que muda decisão do dono. Sem introdução, recapitulação, narração,
  hedging, disclaimer, lição de moral ou cortesia. Efeito no negócio; técnica só se perguntarem.
  Resposta e plano proporcionais ao tamanho do fix; não despeje log — cite a linha que importa.
  Caminhos, comandos e links completos. Destrutivo de verdade: uma linha ("isso apaga X, sem volta —
  confirma?").
- Toda execução fecha com exatamente 3 "Próximos passos" (`N. [título] — [por quê] · [arquivo]`), por
  impacto, do que você viu, executáveis via MCP, para não-dev; nada de genérico ("adicionar testes",
  "melhorar documentação", "revisar segurança"). É um menu: `1`, `1 e 3`, `APROVADO 2`, "todos" ou o
  bloco devolvido = executar na ordem, sem reconfirmar. Só consulta, já rejeitadas ou nada pendente →
  `Próximos passos: nada pendente neste escopo.`

## Fluxo Git — detalhe em `docs/agentes/github-ci.md`
- Repo `adm01-debug/Sales_Machine_V1`, branch `main`, **privado**. Escrita no GitHub: MCP
  **`GITHUB - MCP - FOREVER`** (`github_push_files`: `files` + `delete` num commit); o MCP padrão do
  GitHub devolve 403 em write. `git push` só em repo autorizado na sessão.
- Nunca commite em `main`. Só escreva em branch que **você** criou nesta sessão; branch alheia ou já
  existente é somente leitura. Antes do push, confira que o último commit é seu.
- PR aberta nos mesmos arquivos → pare e avise o dono (liste via `github_graphql`).
- Branch de `main` atualizado: `claude/<fix|feat|chore|infra>-<slug>-<AAMMDD-HHMM>`; quando a
  plataforma já abre a sessão numa branch designada, trabalhe nela.
- **Histórico publicado nunca é reescrito** (Lovable): sem force-push, rebase, amend ou squash de
  commit já enviado, nem com `--force-with-lease`. Conflito → merge/commit novo.
- Commit PT-BR, 1 atômico, Conventional Commits `<tipo>(<escopo>): <assunto>`; tipos em uso:
  `feat fix docs chore refactor test perf ci security revert`. Não há hook `commit-msg` — siga o
  padrão mesmo assim.
- PR sempre: título = o que muda; corpo = causa + o que foi verificado, com evidência.
- Mergeie sem aprovação (squash, apague a branch) PR sua pronta: sem conflito, escopo comum (front,
  server route, server function, docs, config) e com o que você tocou verificado. **Não existe CI
  neste repo — nunca escreva "CI verde" numa PR daqui.**
- **Deixe aberta e chame o dono**: DDL/migration em produção; segredos e rotação; criar `.github/`
  (workflows); deleção de dado; arquitetura ou custo; qualquer coisa que afrouxe consentimento, RLS ou
  LGPD; pendências travadas pelo dono (`package-lock.json`, edge function residual); conflito com PR
  de outro agente.
- Merge em `main` = sincroniza com o Lovable. Confira o que der para conferir e reporte. Fim: link da
  PR + estado.

## Banco — ler `docs/agentes/banco.md` antes de SQL, migration ou deploy
- Oficial: Supabase Cloud **`twkajyybcwvideusutsb`** (`supabase/config.toml:1`). Schema `public`,
  snake_case, `timestamptz` UTC, RLS em todas as tabelas (36 com RLS, 82 policies), `pg_cron` + `pg_net`.
- **Nenhum MCP desta sessão aponta para esse projeto** e o MCP do Supabase já veio conectado ao banco
  errado antes: confirme o ref contra uma tabela que só existe aqui (`campaign_targets`) antes de
  confiar em introspecção. Não deu para confirmar → `NÃO VERIFICADO`.
- Migrations: 45 arquivos em `supabase/migrations/`; sempre **arquivo novo**, nunca editar aplicada.
  Ordem: arquivo → PR → merge → aplicar com o dono. **Três migrations (`009`, `010`, `012`) estão
  gravadas em base64 e nunca foram aplicadas** — nada que só exista nelas existe no banco.
- Diagnóstico em produção é **só leitura**. Destrutivo, segredos e rotação: só com o dono.

### As 10 regras críticas (nunca violar) — estado real ao lado
1. **Lock do tick de cadência.** O worker usa lock **otimista** com `locked_until` + `limit(10)`
   (`src/routes/api/public/hooks/tick-cadence.ts:42-49,72-80`), não `FOR UPDATE SKIP LOCKED` — a função
   `fn_claim_cadence_batch`, que faria isso, está numa migration base64 e **nunca é chamada**. Mantenha
   o padrão otimista até alguém decidir migrar; não misture os dois.
2. **`check_consent()` antes de qualquer envio.** Cumprido em `tick-cadence` (L119, fail-closed) e
   `tick-journeys` (L212, fail-closed); **fail-open** em `tick-marketing` (L135) e **ausente** em
   `src/routes/api/public/agent-tools/send-message.ts`. São furos abertos, não licença: nada novo entra sem o gate.
3. **`UNIQUE(source, external_id)` em `sales_machine_events`** → `INSERT … ON CONFLICT DO NOTHING`.
4. **`entity_map` por upsert** — `ON CONFLICT (kind, lux_id)` / `(kind, singu_id)`; nunca INSERT direto.
5. **Nunca `UPDATE` direto em `campaign_targets.state`** fora do fluxo do worker. O trigger de
   validação de transição só existe nas migrations base64: ele **não** vai te impedir.
6. **`locked_until`** — sempre setar ao pegar um target; sempre limpar ao terminar.
7. **`campaign_target_events` e `sales_machine_events` são append-only** (poda só pelo cron
   `sm-prune-target-events`, >90 dias).
8. **Disclosure de IA na primeira mensagem** — regra de negócio **sem implementação**: zero ocorrências
   de `disclosure`/`agent_identity` em `src/`. Não afirme que existe.
9. **Stop words de opt-out** detectadas no webhook do SINGU → `consent_ledger` imediatamente. A lista
   que vale é a do código (`src/lib/unsubscribe-token.server.ts:56`); a do banco não está aplicada.
10. **LGPD** — apagamento de dado pessoal só por função dedicada; nunca `DELETE` manual.

## Serviços
- **Integrações do funil** — ler `docs/agentes/integracoes.md` ao mexer em webhook, client ou token.
  LUX, SINGU, FATOR X e FUXICO em `src/integrations/external/*.server.ts`; env lida **em request
  time**, nunca em module scope (`config.server.ts:1-6`). Os 5 webhooks verificam HMAC-SHA256 com
  `timingSafeEqual` (`src/lib/hmac.server.ts:7-25`); endpoint público novo sem HMAC/bearer não entra.
  Os hooks do pg_cron autenticam por header `apikey` = publishable key (pública) com `!==` simples —
  endurecer isso exige trocar o header nas migrations de cron no mesmo ciclo.
- **Canais sociais** — LinkedIn/Instagram são **stub** (`src/integrations/social/types.ts`); sem
  `UNIPILE_*`/`PHANTOMBUSTER_API_KEY` configurados, são no-op. Não prometa envio social.
- **Lovable / deploy** — ler `docs/agentes/deploy-lovable.md` antes de dizer que algo está no ar. Não
  há workflow de deploy; merge em `main` sincroniza com o Lovable, e os jobs de cron chamam a **URL de
  preview do Lovable** gravada nas migrations.
- **GitHub/CI** — ler `docs/agentes/github-ci.md`. **Não há `.github/`**: nada roda automaticamente;
  criar o primeiro workflow é mudança de perímetro (chamar o dono).
- **Regras de domínio** — ler `docs/agentes/regras-dominio.md` ao mexer em consentimento, opt-out,
  estado de target, tracking ou compliance de texto.

## Stack e comandos — detalhe em `docs/agentes/mapa-repo.md`
- TypeScript 5.8 strict · React 19.2 · TanStack Start 1.168 + Router 1.170 + Query 5.101 · Vite 8 ·
  Nitro 3 beta (pin exato) · Tailwind 4.2 + shadcn/ui (Radix) · Zod 3.24 + react-hook-form 7 ·
  @supabase/supabase-js 2.110 · Vitest 4.1 · ESLint 9 + Prettier 3 · tipos de Node 22.
  `package.json` não declara `packageManager` nem `engines`.
- **bun é canônico** (`bunfig.toml`, `bun.lock`); `package-lock.json` existe e **não deve ser
  deletado** (pendência do dono). `bunfig.toml` recusa pacote publicado há menos de 24h
  (`minimumReleaseAge`) — adicionar exceção exige falar com o dono.
- `bun install` · `bun run dev` · `bun run build` · `bun test` (vitest; include só `src/**/*.test.ts`)
  · `bun run lint` (prettier é erro de lint) · `bun run format` · `bunx tsc --noEmit` (não há script
  de typecheck) · `python3 scripts/gerar-dump-arquitetura.py` ·
  `node scripts/ci/check-agents-md-integrity.mjs`.
- Só o que você tocou: `bunx vitest run <arquivo>.test.ts`, `bunx eslint <arquivos>`.
- `src/routeTree.gen.ts` é gerado — nunca editar. Sufixos com contrato: `*.server.ts` (só servidor),
  `*.functions.ts` (server fn: **sempre** `requireSupabaseAuth` + validador Zod — os 13 arquivos
  cumprem), `*.test.ts` (ao lado do módulo). Alias `@/` = `src/`.
- Endpoints = rotas TanStack Start em `src/routes/api/public/` (ADR-0001). Reintroduzir edge function
  Deno exige ADR — e repare que `supabase/functions/migrate-helper/` **existe** e é perigosa (ver
  `docs/agentes/banco.md`).

## Contexto gerado (índice do repo)
Não há grafo AST aqui. O índice é `.contexto-compartilhado/dump-arquitetura.json`, gerado por análise
estática de `supabase/migrations/*.sql` + `src/routes` + `src/integrations`
(`scripts/gerar-dump-arquitetura.py`, Python stdlib): 45 migrations, 36 tabelas, 14 enums, 12 funções,
14 rotas de API, 4 jobs de cron.

- Consulte-o **antes** de `grep`/`find` para achar tabela, coluna, enum, função, rota ou job.
- Mudou tabela, rota ou dependência → regere e commite no mesmo ciclo (Lei 12), junto com
  `dicionario-dados.md`/`pendencias-conhecidas.md` se a operação mudar.
- `.claude/hooks/session-start.sh` confere no início da sessão se o dump ainda bate com o código
  (regeneração em diretório temporário, nunca no working tree) e avisa quando está desatualizado.
- O dump descreve o que as migrations dizem, **não** o banco ao vivo: `types.ts` (gerado do banco real,
  40 tabelas + 2 views) é a melhor pista do que existe de fato.

## Armadilhas deste repo (verificadas em 2026-11-08)
- **Baseline vermelha pré-existente** (2026-08-29): lint com 2.639 problemas, 61 de 478 testes
  falhando. Não piore; saneamento em massa é escopo próprio e precisa de autorização.
- **`node_modules` não vem no clone** e não há CI: sem `bun install`, lint/teste/typecheck são
  `NÃO VERIFICADO`.
- **Três migrations em base64** (`009`, `010`, `012`) → 4 tabelas, 9 funções e 1 view documentadas que
  **não existem** no banco.
- **`supabase/functions/migrate-helper/`** com `verify_jwt = false`, CORS `*`, chave hardcoded e ação
  que devolve `SUPABASE_SERVICE_ROLE_KEY` — a doc antiga afirmava que `supabase/functions/` não
  existia mais.
- **`.env` versionado** e fora do `.gitignore`; cobre 6 das 26 variáveis lidas em `src/`.
- **`docs/SCHEMA_REFERENCE.md` desatualizado** (diz "009 migrations", documenta tabelas inexistentes).
  Fonte canônica: `dump-arquitetura.json` + `dicionario-dados.md`.
- **Não há `README.md`** na raiz e o `package.json` tem nome genérico (`tanstack_start_ts`).
- **Tracking é forjável**: `track/click` e `track/open.gif` aceitam `tp` não assinado.
- Débito completo e com severidade: `.contexto-compartilhado/pendencias-conhecidas.md`.

## O que o agente NUNCA faz aqui
- Bypassar, afrouxar ou condicionar `check_consent()` ou qualquer gate de consentimento.
- `UPDATE` direto em `campaign_targets.state`; INSERT direto em `entity_map`; `DELETE` em tabela
  append-only; apagar dado pessoal fora da função LGPD.
- Desabilitar RLS "temporariamente"; criar endpoint público sem HMAC/bearer explícito.
- Editar migration já aplicada; aplicar DDL em produção sem o dono.
- Commitar segredo, chave de servidor no `.env`, ou expor valor de env em log/resposta.
- Force-push, rebase, amend ou squash de histórico publicado (Lovable).
- Enviar mensagem real para lead "só para testar".
- "Corrigir" a baseline de lint/test em massa sem autorização.
