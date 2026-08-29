# Changelog de Prompts & Contexto — Sales_Machine_V1

> Histórico versionado de mudanças nos artefatos de contexto e governança (não confundir com CHANGELOG de produto).
> Formato: versão · data · o que mudou · por quê.

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
