---
name: sales-machine-v1
description: Convenções de código e commit do Sales_Machine_V1 (TypeScript, TanStack Start, Conventional Commits). Use ao alterar código, criar testes ou escrever mensagem de commit neste repositório; as regras operacionais ficam em AGENTS.md.
---

# Sales Machine V1 — convenções

As regras de trabalho (banco, fluxo Git, PR, comunicação) estão em `AGENTS.md` na raiz — este skill só
resume convenções de código e commit.

## Commits

Conventional Commits em PT-BR, modo imperativo, primeira linha curta: `<tipo>(<escopo>): <descrição>`.
Escopo opcional e minúsculo; assunto sem ponto final. Tipos em uso no histórico:
`feat fix docs chore refactor test perf ci security revert`.
**Não há hook `commit-msg` neste repo** (não há `.husky/`; `git config core.hooksPath` vazio) — nada
cobra o padrão automaticamente, siga-o mesmo assim.

Exemplo: `docs(contexto): corrige enums no dicionario de dados`

## Código

- TypeScript strict (`tsconfig.json`), React 19, TanStack Start. Import por alias `@/` (= `src/`).
- Sufixos que valem como contrato: `*.server.ts` = só servidor (o ESLint proíbe importar
  `server-only`, do Next; use o sufixo ou `@tanstack/react-start/server-only`),
  `*.functions.ts` = server functions (sempre `requireSupabaseAuth` + validador Zod),
  `*.test.ts` = teste colocado ao lado do módulo.
- Funções `camelCase`, componentes `PascalCase`, constantes `SCREAMING_SNAKE_CASE`, exports nomeados.
- Banco em `snake_case`; datas `timestamptz` em UTC.
- `src/routeTree.gen.ts` é gerado pelo router — nunca editar à mão.
- Prettier é erro de lint (`eslint-plugin-prettier` por último em `eslint.config.js`):
  `printWidth: 100`, `semi: true`, `singleQuote: false`, `trailingComma: "all"`.
- Testes: `vitest run`; o include é `src/**/*.test.ts` (`.test.tsx` **não** é coletado). Fake do
  Supabase em `src/test/fake-supabase.ts` (importado pelo teste; não há `setupFiles`).
- Siga o padrão do módulo vizinho; não desvie sem registrar o motivo na PR.
