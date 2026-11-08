# Codex CLI — baseline deste repositório

Suplemento ao `AGENTS.md` da raiz (que é a fonte das regras). Aqui fica só o que é específico do
Codex CLI.

## Repo skill

- Skill para o Codex: `.agents/skills/sales-machine-v1/SKILL.md`
- Skill equivalente para o Claude Code: `.claude/skills/sales-machine-v1/SKILL.md`
- Credenciais e MCPs privados ficam em `~/.codex/config.toml`, **nunca** neste repo.

## MCP baseline

Trate `.codex/config.toml` como o baseline seguro para trabalho neste repositório. Os MCPs de
GitHub e Supabase usados de verdade no fluxo do dono estão nomeados no `AGENTS.md` da raiz —
o MCP do Supabase deste projeto precisa apontar para `twkajyybcwvideusutsb`; confira antes de
confiar em qualquer introspecção (ver `docs/agentes/banco.md`).

## Multi-agente

- Explorer: levantamento de evidência, somente leitura
- Reviewer: correção, segurança e regressão
- Docs researcher: verificação de API e release notes

## CI

Um único workflow (`.github/workflows/agents-md-guard.yml`) vigia a integridade das instruções de
agente. Lint, teste e typecheck não rodam em CI — rode local o que tocou.

## Ordem de leitura

`AGENTS.md` → `docs/agentes/<tema>.md` do tema que você vai tocar → `00-governanca/01-leis-do-agente.md`
→ `.contexto-compartilhado/dump-arquitetura.json`.
