# GitHub, git e CI — referência para agentes

Ler antes de commitar, abrir PR, mergear ou prometer que "o CI está verde".

## Escrita no GitHub

- Repo **`adm01-debug/Sales_Machine_V1`**, branch padrão `main`, **privado**.
- Escrita pelo MCP **`GITHUB - MCP - FOREVER`** (`github_push_files`: aceita `files` e `delete` no
  mesmo commit atômico). O MCP padrão do GitHub devolve **403 em write** nos repos `adm01-debug`.
  `git push` só funciona se este repo estiver entre as fontes autorizadas da sessão.
- `github_push_files` **sobrescreve** o arquivo: mande o conteúdo integral com apenas a mudança
  semântica e confira depois que o arquivo remoto é o que você testou.
- Listar PRs abertas com os arquivos que cada uma toca, numa chamada:
  `github_graphql` com `pullRequests(states:OPEN){ nodes { number headRefName files { nodes { path } } } }`.
  `github_list_pull_requests` devolve o repositório inteiro em cada nó e estoura o contexto.

## Regras de branch e commit

- **Nunca commite em `main`.** Toda mudança nasce em branch própria.
- Só escreva em branch que **você** criou nesta sessão. Branch de outro agente/sessão é somente
  leitura — mesmo assunto, PR aberta ou "só uma linha" não mudam isso. Antes de cada push, confirme
  que o último commit da branch é seu.
- Nome: `claude/<fix|feat|chore|infra>-<slug>-<AAMMDD-HHMM>`, a partir de `main` atualizado. Quando a
  plataforma já abre a sessão numa branch designada (`claude_NN/...`), trabalhe nela — é a branch
  da sessão — e não crie outra por cima.
- Uma tarefa = uma branch = uma PR. Commits curtos em PT-BR, Conventional Commits, de preferência 1
  atômico: `<tipo>(<escopo>): <assunto>`. Tipos em uso: `feat fix docs chore refactor test perf ci security revert`.
- **Histórico publicado nunca é reescrito**: sem force-push, rebase, amend ou squash de commits já
  enviados — o repo está conectado ao Lovable e isso destrói o histórico de lá (bloco `LOVABLE` no
  topo do `AGENTS.md`). Em conflito, resolva com merge/commit novo, nunca reescrevendo.
- Antes de começar: liste as PRs abertas. PR aberta tocando os mesmos arquivos → pare e avise o dono.

## PR e merge

- PR sempre, mesmo em mudança pequena. Título = o que muda. Corpo = causa/por quê + o que foi
  verificado de verdade, com evidência (`arquivo:linha`, saída de comando, query).
- Mergeie sem pedir aprovação a PR **sua**, pronta e de escopo comum (front, server route, server
  function, docs, config): sem conflito com `main`, com o que você tocou verificado. Squash-merge e
  apague a branch.
- **Deixe a PR aberta e chame o dono** quando envolver: DDL/migration em produção; segredos ou
  rotação de chave; criação de workflow de CI (`.github/`); deleção de dado; mudança de arquitetura
  ou de custo; remoção das pendências travadas pelo dono (`package-lock.json`, edge function
  residual); qualquer coisa que afrouxe consentimento, RLS ou LGPD; conflito com PR de outro agente.

## CI: não existe

- **Não há `.github/`** neste repo: nenhum workflow, nenhum check obrigatório, nenhum required status.
  Nada roda lint, teste, typecheck, migration-replay ou auditoria automaticamente.
- Consequência direta: **"CI verde" não é critério de merge aqui, porque não há CI.** O critério é o
  que você executou e colou como evidência. Nunca escreva "CI verde" numa PR deste repo.
- `agent_eval_cases` (harness de eval do FATOR X) também não roda em lugar nenhum por isso.
- Criar o primeiro workflow é mudança de perímetro → **PR aberta + chamar o dono** (matriz de
  autonomia). Enquanto não houver, estes guards rodam **à mão** antes de fechar a tarefa:

```bash
bun install                                              # uma vez por sessão
bunx tsc --noEmit                                        # typecheck (não há script)
bunx vitest run <arquivos que você tocou>
bunx eslint <arquivos que você tocou>
node scripts/ci/check-agents-md-integrity.mjs            # se tocou AGENTS.md/docs/agentes/00-governanca
AGENTS_MD_BASE=origin/main node scripts/ci/check-agents-md-integrity.mjs   # comparando com a main
```

## Baseline vermelha: o que conta como seu erro

Medida em 2026-08-29 (ver `.contexto-compartilhado/pendencias-conhecidas.md`): **lint com 2.639
problemas** e **61 de 478 testes falhando**. Isso é herança da `main`, não regressão sua.

- A régua é **não piorar**: o seu diff não adiciona nenhuma falha nova de lint ou teste.
- Erro herdado da `main` vai para "Próximos passos", nunca para dentro da sua PR.
- `lint --fix` global ou conserto em massa dos 61 testes é **escopo próprio** e exige autorização do
  dono — não pega carona em outra tarefa (Lei 11).
- Como as deps não vêm no clone, diga sempre contra o que você mediu: sem `bun install`, a resposta
  honesta é `NÃO VERIFICADO (deps não instaladas)`.

## Deploy

Não há deploy por workflow. Merge em `main` sincroniza com o Lovable e é o que chega perto de
produção — ver `docs/agentes/deploy-lovable.md` antes de dizer que algo "está no ar".
