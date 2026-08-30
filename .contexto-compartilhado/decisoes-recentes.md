# Decisões Recentes — Sales_Machine_V1

> Log rolling das decisões com justificativa. Mais recentes primeiro. Decisões estruturais viram ADR em `02-arquitetura-engenharia/adr/`.

## 2026-08-29 — Adoção do padrão PromptOps v2.0 (fundação)

- **Contexto podre eliminado:** `CLAUDE.md` e `docs/SCHEMA_REFERENCE.md` estavam gravados em base64 (ilegível para agentes). Decodificados para markdown. O SCHEMA tinha 1 char extra no stream base64 (desalinhamento); recuperação byte-exata exceto 2 trechos de transição reconstruídos semanticamente (regras 3 e 5 da lista crítica). Detalhes no commit `5609fa4`.
- **bun declarado gerenciador canônico.** O repo tem dois lockfiles (`bun.lock` + `package-lock.json`) e `bunfig.toml`. Decisão: bun é canônico; `package-lock.json` **não** foi deletado (Lei 8 — reversibilidade) e a remoção ficou como pendência a decidir pelo dono.
- **Dump de arquitetura gerado por análise estática** (migrations + `src/routes`), não por introspecção do banco: o MCP Supabase disponível está conectado ao banco errado. Gerador versionado em `scripts/gerar-dump-arquitetura.py` — rodar após qualquer mudança estrutural (Lei 12).
- **Identidade do repo corrigida** no CLAUDE.md: era `social-sales-symphony` / "Vite/React, 10 migrations"; real: `adm01-debug/Sales_Machine_V1`, TanStack Start, 45 migrations.

## 2026-07-26 → 2026-08-02 — Stack LGPD/consentimento construída

- Após o QA report de 22/07 (que apontou ausência da stack LGPD — F5), migrations de 26/07+ criaram `consent_ledger`, `check_consent()`, compliance terms/preflight e funções LGPD. Referência: `dicionario-dados.md`.

## 2026-07-22 — QA audit full-stack (score médio 9/10)

- Migration 013 corrigiu: CHECK de `campaign_targets.status` sem `'completed'` (F1), triggers duplicados (F2). Patches: canal email era no-op no tick (F10), upsert faltando em `enqueueBatchProspection` (F8). Fonte: `docs/qa-report-2026-07-22.md`.

## Decisões de arquitetura históricas (extraídas de artefatos — benchmark/QA)

- **TanStack Start (TSS) é a fonte da verdade dos endpoints** (ADR-0001). As edge functions Deno duplicatas (F9 do QA) foram **removidas** — `supabase/functions/` ausente no working tree (verificado 2026-08-29).
- **pg_cron + tick endpoints em vez de Trigger.dev/Inngest.** Decisão registrada no benchmark: volume esperado não justifica a complexidade; mantém a stack simples.
- **SINGU é o CRM.** Não construir CRM próprio (retrabalho).
- **Canais sociais (LinkedIn/Instagram) são stubs por design** aguardando adapter pattern `SocialSender` (Unipile/Phantombuster) — benchmark item 7.
- **Não copiar código do OIE** (licença não permite) — usar apenas como referência de padrões.
