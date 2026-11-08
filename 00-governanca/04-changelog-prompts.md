# Changelog de Prompts & Contexto — Sales_Machine_V1

> Histórico versionado de mudanças nos artefatos de contexto e governança (não confundir com CHANGELOG de produto).
> Formato: versão · data · o que mudou · por quê.

## v2.1 — 2026-11-08 — Fecha as duas lacunas do padrão (hook PreToolUse + CI)

**Contexto:** a v2.0 deixou de fora dois itens que o `Zapp_Web_V2` tem. O dono pediu os dois.

**Criado:**
- `.claude/hooks/pre-tool-index-guard.mjs` + hook `PreToolUse` (`Bash|Grep`) no
  `.claude/settings.json` — equivalente local do `graphify hook-guard search` do Zapp, que aqui não
  existe: quando uma busca por texto procura nome de tabela, coluna, enum, função SQL, rota, job ou
  integração que o `dump-arquitetura.json` conhece, devolve o que o índice diz via
  `additionalContext`. **Não bloqueia** (nenhum `permissionDecision`) e é no-op para termo
  desconhecido, comando que não é busca, stdin inválido ou dump ilegível.
- `.github/workflows/agents-md-guard.yml` — **primeiro workflow do repo**. Roda o guard das
  instruções em PR e push na `main` (só quando o diff toca as instruções), Node 22, sem instalar
  dependências, actions pinadas por SHA, `permissions: contents: read`. Sem required check: é sinal,
  não bloqueio.

**Modificado:** `AGENTS.md`, `docs/agentes/{github-ci,mapa-repo,deploy-lovable}.md`, `.codex/AGENTS.md`,
`scripts/ci/check-agents-md-integrity.mjs` e `pendencias-conhecidas.md` — todas as afirmações de que
"não há `.github/`" / "não existe CI" foram trocadas pelo que passa a ser verdade: existe **um**
workflow, e ele vigia só as instruções; lint, teste, typecheck, migration e eval continuam sem CI.

**Achado da implementação (não corrigido — fora de escopo):** o gerador do índice casa
`ALTER TABLE … ADD COLUMN` uma vez por statement (`scripts/gerar-dump-arquitetura.py:80`), então um
`ALTER TABLE` com vários `ADD COLUMN` registra só a primeira coluna. É por isso que
`campaign_targets` aparece sem `locked_until`, `attempts`, `max_attempts` e `last_transition_at`
(`supabase/migrations/20260720181807_….sql:8-12`). O hook avisa dessa ressalva no próprio texto, e a
limitação está documentada em `docs/agentes/mapa-repo.md`.

**Continua fora do padrão do Zapp:** `.claude/commands/` (lá é um slash command de projeto) e
`.claude/ecc-tools.json` + `.claude/homunculus/` (artefatos gerados por ferramenta externa).

## v2.0 — 2026-11-08 — Padrão de instruções de agente do Zapp Web V2

**Contexto:** o dono padronizou as instruções de agente no `Zapp_Web_V2` e pediu a réplica aqui. O
padrão inverte a hierarquia: `AGENTS.md` passa a ser a fonte única das regras (lido por Claude Code,
Codex e qualquer outro agente) e `CLAUDE.md` vira só o ponteiro `@AGENTS.md`; o detalhe por tema sai
do arquivo-mãe para `docs/agentes/<tema>.md`.

**Criado:**
- `docs/agentes/` — `banco.md`, `github-ci.md`, `mapa-repo.md`, `regras-dominio.md`, `integracoes.md`,
  `deploy-lovable.md` (análogos a `banco/github-ci/mapa-repo/regras-dominio/evolution-go/vercel-deploy` do Zapp)
- `.claude/` — `settings.json` (hook `SessionStart`), `hooks/session-start.sh` (confere se o
  `dump-arquitetura.json` ainda bate com o código, em diretório temporário), `skills/sales-machine-v1/SKILL.md`
  (convenções de código e commit), `identity.json`
- `.agents/skills/sales-machine-v1/` (`SKILL.md` + `agents/openai.yaml`) e `.codex/` (`AGENTS.md`,
  `config.toml`, `agents/{explorer,reviewer,docs-researcher}.toml`) — mesmo conteúdo para agentes não-Claude
- `scripts/ci/check-agents-md-integrity.mjs` — guarda contra wipe/esvaziamento das instruções por
  sessão paralela: exige as 8 seções do `AGENTS.md`, barra encolhimento >30% do conjunto
  (`AGENTS.md` + `CLAUDE.md` + `docs/agentes/*.md` + `00-governanca/*.md`) e >50% por arquivo.
  **Roda à mão** (não há `.github/`): `AGENTS_MD_BASE=origin/main node scripts/ci/check-agents-md-integrity.mjs`

**Modificado:**
- `AGENTS.md` — reescrito no padrão (Postura · Bugs e funcionalidades · Comunicação · Fluxo Git ·
  Banco · Serviços · Stack e comandos · Contexto gerado), preservando o bloco `LOVABLE`
- `CLAUDE.md` — agora é só `@AGENTS.md`; o conteúdo operacional migrou para `AGENTS.md` + `docs/agentes/`
- `.contexto-compartilhado/dicionario-dados.md` — regras críticas 1, 7, 8 e 9 corrigidas para o que o
  código faz de verdade
- `.contexto-compartilhado/pendencias-conhecidas.md` — nova seção 🔴 de segurança/integridade com 13
  achados verificados; corrigida a afirmação falsa de que `supabase/functions/` não existia mais

**Divergências entre a doc antiga e o código, encontradas na validação (evidência nas pendências):**
3 migrations em base64 nunca aplicadas · `migrate-helper` expondo `service_role` · `send-message` sem
`check_consent` · `tick-marketing` fail-open · disclosure de IA inexistente · sem cron para
`tick-cadence` · `SKIP LOCKED` fora do caminho de execução · `.env` versionado.

**Diferenças deliberadas em relação ao Zapp:** não há grafo `graphify` (o índice é o
`dump-arquitetura.json`, e a seção equivalente chama-se "Contexto gerado"); não há hooks `PreToolUse`
(dependeriam do graphify); não há workflow de CI rodando o guard — criar `.github/` é decisão do dono.

**Fora de escopo (continua pendente):** corrigir os achados de segurança acima, workflows de CI,
`README.md`, `.env.example`, saneamento da baseline de lint/test.

## v1.0 — 2026-08-29 — Fundação PromptOps

**Contexto:** adoção do padrão PromptOps v2.0 (escopo aprovado: Fatias 1–4 — fundação completa).

**Criado:**
- `00-governanca/` — leis do agente (12), definition of done, matriz de autonomia, este changelog
- `.contexto-compartilhado/` — `dump-arquitetura.json` (gerado de 45 migrations + `src/routes` via `scripts/gerar-dump-arquitetura.py`), `dicionario-dados.md`, `decisoes-recentes.md`, `pendencias-conhecidas.md`
- `01-contexto-negocio/` — visão, RFs, RNFs, glossário, personas
- `02-arquitetura-engenharia/` — stack, arquitetura, modelagem, segurança, contratos, observabilidade, `adr/ADR-0001` + template
- `scripts/gerar-dump-arquitetura.py` — gerador reproduzível do dump

**Modificado:**
- `CLAUDE.md` — decodificado de base64 e **reescrito** no formato 3.2 (identidade do repo corrigida: era `social-sales-symphony`, stack "Vite/React, 10 migrations"; real: TanStack Start, 45 migrations)
- `AGENTS.md` — mantido bloco Lovable; adicionada ponte para a estrutura PromptOps
- `docs/SCHEMA_REFERENCE.md` — decodificado de base64 (recuperação com 2 reconstruções mínimas documentadas); marcado como desatualizado nas pendências

**Decisões registradas:** bun como gerenciador canônico · dump estático por indisponibilidade do MCP Supabase · `package-lock.json` preservado (Lei 8).

**Fora de escopo (futuro):** biblioteca de prompts (`03-`–`05-`), workflows de CI (`.github/`), saneamento da baseline de lint/test.
