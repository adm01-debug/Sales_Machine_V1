# ai-context — contexto de código para agentes de IA

**O que faz:** `gerar.mjs` lê o repositório (zero dependências, Node ≥ 18) e escreve JSONs + `INDEX.md`
com rotas, menu, módulos, componentes, hooks, edge functions, banco (migrations/types), testes, CI, scripts,
convenções e baseline. Genérico: React/Next/Vue/Svelte/Nuxt/Remix/Astro, Express/Hono/Fastify/Nest,
FastAPI/Flask/Django, Supabase/Prisma/Drizzle/TypeORM/SQL. Saída determinística (só `manifest.json` tem data).

**Como rodar:** `node scripts/ai-context/gerar.mjs [--root <dir>] [--out <dir>] [--quiet]`
(padrão de saída `inventario/ia`, ou `ai-context.config.json → out`, ou env `AI_CONTEXT_DIR`).
Testes: `node --test scripts/ai-context/gerar.unit.mjs`. Cenários: `cenarios.mjs`.
O CI obrigatório também executa a mesma suíte pelo adaptador `scripts/ci/ai-context-generator.unit.mjs`.

**Config opcional** (`ai-context.config.json` na raiz): `out`, `skipDirs`, `srcDirs`, `menuFiles`,
`routeFiles`, `aliases`, `typesFile`, `maxFileMB`, `publicacao` (texto do rodapé do `INDEX.md` dizendo
onde o contexto é publicado neste repo; env `AI_CONTEXT_PUBLICACAO` tem precedência).

**Neste repo:** o workflow `.github/workflows/contexto.yml` roda o gerador a cada push em `main` e a cada
hora e publica em `docs/contexto/codigo/` na branch `contexto` (índice único em `docs/contexto/00-INDEX.md`).
O roteador por arquivos do TanStack Start (`createFileRoute`/`createServerFileRoute` em `src/routes/`) é
extraído na seção `rotas-fs`: segmento `_layout` não vira URL, `$param` vira `:param` e rota com
`handlers: { GET, POST }` entra em `rotas_http_backend` com os métodos reais.

**Secrets:** nenhum (lê só arquivos do repo e `git log`).

## Alcance dos alertas

- O schema reconstruído ignora os diretórios `_foreign/` e `_superseded/`: são histórico, não migrations
  vigentes. Os demais SQLs e diretórios de migrations continuam sendo considerados.
- Alertas de tabela/RPC/edge inexistente e o mapa de chamadores da aplicação excluem testes, stories e
  raízes de ferramentas/documentação (`scripts/`, `bin/`, `tools/`, `.github/`, `docs/`, `inventario/`,
  `analise/`, `examples/`, `samples/`, inclusive sob pacotes de monorepo). Esses arquivos continuam nos
  inventários próprios. Uma raiz desse tipo que contenha aplicação pode ser declarada em `srcDirs`.
- As relações são extraídas estaticamente: referência encontrada não prova execução; ausência de
  chamador no mapa não prova que uma edge não tenha consumidor externo. Marcadores `TODO` também são
  candidatos para revisão — texto em português sem pontuação pode ser ambíguo.
