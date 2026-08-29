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

Este repo segue o padrão **PromptOps v2.0** (Guia de Desenvolvimento de Sistemas). Ordem de leitura obrigatória para qualquer agente:

1. **`00-governanca/01-leis-do-agente.md`** — as 12 leis inegociáveis (sobrepõem tudo)
2. **`CLAUDE.md`** — memória operacional: stack exata, comandos, regras críticas de banco, armadilhas, lista do que NUNCA fazer
3. **`.contexto-compartilhado/dump-arquitetura.json`** — snapshot estrutural (tabelas, enums, funções, rotas, jobs)
4. **`.contexto-compartilhado/pendencias-conhecidas.md`** — débito técnico reconhecido antes de "descobrir" algo por conta própria
5. **`00-governanca/03-matriz-de-autonomia.md`** — o que você decide sozinho vs. o que exige pergunta

## Regras de git deste repo

- Branch de trabalho: `main` (sincroniza com o Lovable a cada push — manter sempre em estado funcional).
- **Proibido reescrever histórico publicado** (force-push, rebase, amend de commits já pushados) — ver bloco LOVABLE acima.
- Commits atômicos com mensagem descritiva em pt-BR (conventional commits quando aplicável).
- Mudança estrutural (tabela, rota, dependência) ⇒ rodar `python3 scripts/gerar-dump-arquitetura.py` no mesmo ciclo (Lei 12).

## Suplementos

- `.hermes.md` — regras operacionais da casa do Joaquim (barreiras de escrita, subpastas de sessão).
- `docs/` — auditorias históricas: QA report (2026-07-22), benchmark de referência, SCHEMA_REFERENCE (⚠️ desatualizado — usar `.contexto-compartilhado/` como fonte canônica).
