# As 12 Leis do Agente — Sales_Machine_V1

> Cópia local da Parte 1 do Guia PromptOps v2.0, com ancoragem neste repo.
> Estas leis se aplicam a **toda** interação. Violação de qualquer uma **invalida o trabalho**.
> Em conflito entre qualquer template/prompt e estas leis, **as leis vencem**.

## Lei 1 — Verdade acima de validação
- Nunca afirme que testou algo que não executou. Nunca reporte "✅ funcionando" sem evidência (output de teste, response HTTP, row no banco).
- Se falhou, o relatório começa com a falha, não com o que "quase deu certo".
- "Não sei" e "não consegui verificar" são respostas legítimas e obrigatórias quando verdadeiras.
- *Neste repo:* a baseline de lint/test está vermelha (ver `pendencias-conhecidas.md`) — reporte sempre "baseline pré-existente" vs. "o que EU mudei".

## Lei 2 — Diagnóstico antes de patch
- Em qualquer bug: primeiro **reproduzir ou evidenciar** (logs, estado do banco, request real), depois nomear a causa raiz, só então propor o fix.
- Um fix sem causa raiz identificada é um chute. Chutes são proibidos em produção.
- Máximo 3 tentativas na mesma hipótese; depois, pare e reporte com as hipóteses vivas.

## Lei 3 — Diff mínimo
- Corrija a causa raiz com a menor mudança possível. Não refatore, não renomeie, não "melhore" código adjacente.
- Não reescreva um arquivo inteiro para mudar 5 linhas. Cada linha alterada deve ser justificável pela tarefa.

## Lei 4 — Ler antes de escrever
- Nunca edite um arquivo sem ter lido seu conteúdo atual. Nunca crie função sem verificar se já existe equivalente.
- Nunca assuma schema de banco: consulte `dump-arquitetura.json`, `dicionario-dados.md` e as migrations reais — e desconfie de docs marcados como desatualizados (`docs/SCHEMA_REFERENCE.md`).

## Lei 5 — Segurança por padrão
- Todo endpoint nasce autenticado; exposição pública (em `src/routes/api/public/`) exige HMAC-SHA256 com timing-safe compare.
- Todo input é hostil até validado (Zod). Segredos nunca em código, log, commit ou resposta de chat.
- Toda tabela nasce com RLS habilitado.

## Lei 6 — Código completo ou nada
- Proibido `// TODO: implementar`, `// ... resto da lógica ...` em entregas finais.
- Escopo grande demais? Divida em entregas completas e funcionais, não em esqueletos.

## Lei 7 — Contratos primeiro
- Schema do banco antes do código que o consome; tipos Zod antes da lógica; mudança de contrato atualiza todos os consumidores no mesmo diff.
- *Neste repo:* server functions usam Zod validators; mudou o validator, revise os chamadores.

## Lei 8 — Reversibilidade
- Toda mudança destrutiva (DROP, DELETE em massa, migration irreversível, force-push) exige: 1) confirmação explícita do humano, 2) backup ou plano de rollback declarado, 3) transação quando possível.
- *Neste repo:* histórico publicado NUNCA é reescrito (Lovable). Migrations aplicadas NUNCA são editadas — sempre migration nova.

## Lei 9 — Uma fonte de verdade por fato
- Cada regra de negócio/constante/config vive em exatamente um lugar.
- *Neste repo:* endpoints = rotas TSS (`src/routes/api/`); schema = migrations + `.contexto-compartilhado/`; os docs antigos em `docs/` são histórico.
- Duplicação detectada é **reportada**, não silenciosamente mantida nem corrigida fora de escopo.

## Lei 10 — Verificação é parte da entrega
- A tarefa só termina quando o critério de verificação definido no início foi executado e passou.
- "Compilou" não é verificação. `bun test` / request 200 / query retornando o esperado — isso é verificação.

## Lei 11 — Escopo é sagrado
- Descobriu problema fora do escopo? Reporte em uma linha e siga. Não conserte sem pedir.
- Exceção única: vulnerabilidade de segurança ativa ou perda de dados iminente — pare e alerte imediatamente.
- *Exemplo real:* descobrir que a baseline de lint tem 2.639 problemas não autoriza um `lint --fix` gigante no meio de outra tarefa.

## Lei 12 — Contexto é ativo gerenciado
- Mudança estrutural (nova tabela, rota, dependência) ⇒ atualizar `dump-arquitetura.json` (`python3 scripts/gerar-dump-arquitetura.py`) e, se afetar operação, `AGENTS.md` / `dicionario-dados.md` / `pendencias-conhecidas.md` **no mesmo ciclo**.
- Descobriu uma armadilha nova? Adicione em `AGENTS.md` > Armadilhas no mesmo commit (desde 2026-11-08, `CLAUDE.md` é só `@AGENTS.md` — a seção vive lá). Conhecimento que fica só na conversa morre com a sessão.
