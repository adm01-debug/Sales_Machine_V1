# Pendências Conhecidas — Sales_Machine_V1

> Débito técnico reconhecido, com severidade e evidência. Atualizar ao resolver ou descobrir (Lei 12).
> Severidade: 🔴 bloqueia/alto · 🟡 médio · 🔵 baixo/aceito.

## 🔴 Qualidade (baseline pré-existente, medida em 2026-08-29)

- **Lint vermelho: 2.639 problemas** (2.630 errors, 9 warnings; ~2.598 fixáveis com `bun run lint --fix`, maioria prettier). Evidência: `bun run lint` na baseline da adoção PromptOps. *Não corrigido de propósito: fora do escopo da fundação; exige varredura própria.*
- **Testes: 61 falhas em 478** (417 pass). Falhas concentram-se em testes de integração (`alert-sweep`, etc.). Evidência: `bun test` na mesma baseline.

## 🟡 Infra & ferramentas

- **MCP Supabase conectado ao banco errado** — o banco acessível via MCP contém apenas `_grant_snapshot_gatea`, não o schema do Sales Machine. Introspecção ao vivo impossível; dump de arquitetura é estático (migrations). *Ação: alinhar conexão MCP com o projeto Supabase correto.*
- **Dois lockfiles** (`bun.lock` + `package-lock.json`). bun declarado canônico em 2026-08-29; remoção do `package-lock.json` aguarda decisão explícita do dono (não deletado por Lei 8).
- **Sem `.env.example`** — existe `.env` (não commitado), mas nenhum template documenta as variáveis. Variáveis esperadas estão documentadas no CLAUDE.md.
- **Sem `README.md`** na raiz (onboarding hoje depende de CLAUDE.md/docs).
- **`package.json` com nome genérico** (`tanstack_start_ts`) e sem `private` description do produto.
- **Confirmar pg_cron em produção**: migrations agendam `sm-tick-marketing` (5min), `sm-alert-sweep` (15min), `sm-prune-target-events` (semanal), `sm-tick-journeys` (1min). O QA de 22/07 citava apenas `sm-tick-cadence` ativo — verificar quais jobs existem de fato no banco de produção e se apontam para as rotas TSS.

## 🟡 Código & dados

- ~~**Edge functions Deno duplicadas** (F9 do QA 2026-07-22)~~ **RESOLVIDA**: `supabase/functions/` não existe mais no working tree (verificado 2026-08-29). Fonte da verdade = rotas TSS (ver ADR-0001).
- **`channel_quotas` vazia** (F11 do QA): seed da migration 012 falhou silenciosamente (insert sem `user_id` NOT NULL). Sem efeito hoje (worker usa `compute_daily_cap` + `sender_health`); quando quotas por usuário forem ativadas, exigirá seed corrigido.
- **UNIPILE/social senders são stubs** — canais LinkedIn/Instagram sem envio real (por design); aguardando adapter `SocialSender` (benchmark item 7). Chaves UNIPILE não configuradas.
- **`agent_eval_cases` não roda em CI** — harness do FATOR X existe (10 cases semeados), mas não há `.github/workflows` no repo; evals e testes não rodam em CI ainda (fora do escopo da fundação PromptOps — Fatia futura).
- **`docs/SCHEMA_REFERENCE.md` desatualizado** — diz "009 migrations" (há 45), cita enums aspiracionais inexistentes (`sm_consent_status`, `sm_legal_basis`, `sm_template_status`, `sm_calendar_status`) e tabelas inexistentes (`stop_word_lists`, `agent_identity_config`, `unsubscribe_tokens`, `content_calendar`). Contém typos originais ("atualizaçóo", "canönica", "OBRiGATÓRIO"). Fonte canônica hoje: `dump-arquitetura.json` + `dicionario-dados.md`. *Ação: reescrever ou aposentar.*

## 🔵 Aceitos com justificativa

- **Linter Supabase "Extension in Public"** (F3 do QA): `pg_cron`/`pg_net` no schema `public` — design da Supabase; não corrigível sem quebrar cron.
- **`has_role()` SECURITY DEFINER executável por authenticated** (F12 parcial): **requerido** pelas policies RLS. `handle_new_user()` já teve EXECUTE revogado (migration 013).
