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

- **Edge functions Deno** (F9 do QA 2026-07-22) — as duplicatas dos workers foram removidas e a fonte da verdade é TSS (ADR-0001), **mas a pasta não está vazia**: `supabase/functions/migrate-helper/index.ts` existe. A afirmação anterior ("`supabase/functions/` não existe mais", 2026-08-29) estava **errada** — corrigido em 2026-11-08. Ver o item 🔴 de segurança abaixo.
- **`channel_quotas` vazia** (F11 do QA): seed da migration 012 falhou silenciosamente (insert sem `user_id` NOT NULL). Sem efeito hoje (worker usa `compute_daily_cap` + `sender_health`); quando quotas por usuário forem ativadas, exigirá seed corrigido.
- **UNIPILE/social senders são stubs** — canais LinkedIn/Instagram sem envio real (por design); aguardando adapter `SocialSender` (benchmark item 7). Chaves UNIPILE não configuradas.
- **`agent_eval_cases` não roda em CI** — harness do FATOR X existe (10 cases semeados). Desde 2026-11-08 existe `.github/workflows/agents-md-guard.yml`, mas ele só vigia a integridade das instruções de agente: evals, testes, lint e typecheck continuam sem CI.
- **`docs/SCHEMA_REFERENCE.md` desatualizado** — diz "009 migrations" (há 45), cita enums aspiracionais inexistentes (`sm_consent_status`, `sm_legal_basis`, `sm_template_status`, `sm_calendar_status`) e tabelas inexistentes (`stop_word_lists`, `agent_identity_config`, `unsubscribe_tokens`, `content_calendar`). Contém typos originais ("atualizaçóo", "canönica", "OBRiGATÓRIO"). Fonte canônica hoje: `dump-arquitetura.json` + `dicionario-dados.md`. *Ação: reescrever ou aposentar.*

## 🔴 Segurança e integridade do schema (achados verificados em 2026-11-08)

- **`supabase/functions/migrate-helper/` entrega o `service_role`.** `supabase/functions/migrate-helper/index.ts`
  (commit `338899a`, "Visual edit in Lovable", 2026-08-28) roda com `verify_jwt = false`
  (`supabase/config.toml:3`), CORS `Access-Control-Allow-Origin: "*"`, uma chave de acesso hex
  **hardcoded no fonte** (L5) e a ação `?action=credentials`, que devolve `SUPABASE_SERVICE_ROLE_KEY` e
  `SUPABASE_DB_URL`. O próprio código diz "Após a migração, remova esta função" (L3). Se estiver
  publicada no projeto, é exfiltração de service_role por um GET. *Ação do dono: conferir se está
  publicada, remover a função e rotacionar a service_role. Está publicada? **NÃO VERIFICADO** — nenhum
  MCP desta sessão alcança `twkajyybcwvideusutsb`.*
- **Três migrations gravadas em base64, nunca aplicadas.**
  `20260720230000_009_consent_identity_templates_bugfixes.sql`,
  `20260721090000_010_tick_support_functions.sql` e `20260721230000_012_hardening_fmea_fixes.sql` são
  uma linha de base64 (`wc -l` = 0). Logo **não existem no banco**: tabelas `stop_word_lists`,
  `agent_identity_config`, `marketing_templates`, `content_calendar` (nenhuma em `types.ts`, nenhuma
  referência em `src/`); funções `fn_claim_cadence_batch`, `fn_recover_stale_locks`,
  `validate_template_vars`, `export_entity_personal_data`, `delete_entity_personal_data`,
  `fn_archive_old_target_events`, `fn_try_decrement_quota`, `increment_sender_health`,
  `fn_reset_daily_quotas`; view `v_security_audit`. *Ação: decidir com o dono o que reaplicar — é DDL
  em produção, e parte redefine funções que já existem.*
- **`agent-tools/send-message.ts` envia sem `check_consent()`.** Único caminho de envio sem o gate
  LGPD (grep por `consent` no arquivo = 0); autentica por bearer `AGENT_TOOL_TOKEN` constant-time
  (L26-31) e despacha por `singuClient` (L92-109). Viola a regra crítica 2.
- **`tick-marketing.ts` é fail-open no consentimento.** L135-139 só trata `allowed === false`; erro do
  RPC deixa `allowed` nulo e o envio segue. `tick-cadence` (L119-137) e `tick-journeys` (L212-229) são
  fail-closed. Viola a regra crítica 2 em caso de indisponibilidade.
- **Disclosure de IA não existe no código** (regra crítica 8): `grep -rn "disclosure|agent_identity|identity_config" src/` = 0.
- **Nenhum cron para `tick-cadence`.** `grep -rl tick-cadence supabase/migrations` = vazio; os
  schedules `sm-cadence-tick`/`sm-quota-reset`/`sm-archive-events` estão comentados dentro da migration
  base64 `010`. O worker 1:1 só roda se algo externo chamar o endpoint. Idem `budget-reallocate`
  (sem job; o arquivo só sugere "a cada 30 minutos", `budget-reallocate.ts:9`). *Estado ao vivo do
  `cron.job`: **NÃO VERIFICADO**.*
- **`.env` está versionado** (`git ls-files .env` devolve `.env`) e **não** está no `.gitignore`. Hoje
  tem só dados públicos do Supabase (6 variáveis), mas qualquer chave de servidor escrita ali vai para
  o repositório. *Ação: adicionar `.env` ao `.gitignore` e remover do índice — mexe em histórico de
  arquivo rastreado, decisão do dono.*
- **Hooks do pg_cron autenticam com chave pública e comparação não constant-time.** Header `apikey`
  comparado com `SUPABASE_PUBLISHABLE_KEY ?? SUPABASE_ANON_KEY` por `!==` em `tick-cadence.ts:32-37`,
  `tick-journeys.ts:30-36`, `tick-marketing.ts:27-33`, `alert-sweep.ts:23-28`,
  `budget-reallocate.ts:19-24`. A publishable key vai no bundle do front (`client.ts:34`) e está em
  texto claro nas migrations de cron. Endurecer exige trocar o header nos três `cron.schedule` no
  mesmo ciclo.
- **Migrations de cron com URL de preview e chave embutidas.** Os três `net.http_post` apontam para
  `https://project--c4a241c3-…lovable.app` com a publishable key no header
  (`20260726145822_….sql:6-9`, `20260726170010_….sql:33`, `20260726184515_….sql:14`). Trocar domínio ou
  rotacionar a chave quebra os jobs e exige migration nova.
- **Eventos de tracking são forjáveis.** `track/click.ts` e `track/open[.]gif.ts` são GET sem auth e o
  parâmetro `tp` não é assinado; os eventos entram em `email_deliverability_events` e
  `sales_machine_events` via service role. O click só valida o protocolo do destino (L13-19).
- **Três listas de stop words divergentes** — código (`unsubscribe-token.server.ts:56`, a que vale),
  regex do preflight (`message-preflight.ts:47-49`) e `stop_word_lists` no banco (não aplicada, com
  termos que o código não detecta: `CHEGA`, `0`, `NÃO QUERO`, `QUIT`, `END`, `REMOVE ME`…).
- **`check_consent` tem 3 definições** (`20260722200408_….sql:29` DEFINER → `20260722200434_….sql:1`
  INVOKER, vigente → uma na base64 `009`) e `tg_validate_target_state_transition` tem 2 (ambas em
  base64, logo **ausente do banco**: a validação de transição de estado não existe).
- **Nomenclatura de triggers inconsistente** (`trg_*` domina, há `tg_*` e alguns sem prefixo, como
  `journeys_touch`); `20260721142041_….sql:3,8,14` recria três triggers de `campaign_targets` (F2 do QA).

- **O preview do Vercel falha em qualquer branch (não é regressão de PR).** Medido em 2026-11-08 com
  três deployments: `59a1e3f` (docs) → `ERROR`, `0e115ed` (docs) → `ERROR` e um commit de controle
  (`fd3f0ef`, `main` + um arquivo de 1 linha, branch descartada depois) → `ERROR`, enquanto o
  deployment de **produção** da `main` (`ae912a3`) está `READY`. Ou seja: a integração Git do projeto
  `sales-machine-v1` (team `juca1`) não consegue construir *preview*, e toda PR deste repo nasce com o
  commit status `Vercel` vermelho. *Causa: **NÃO VERIFICADO** — o conector Vercel desta sessão só
  responde `list_projects`/`list_deployments`; `get_deployment`, o log de build e `filter_project_envs`
  devolvem 404 por escopo. O log fica em `https://vercel.com/juca1/sales-machine-v1/<id>` (acesso do
  dono). Hipóteses não confirmadas: variável de ambiente só existente em Production, ou o
  `minimumReleaseAge` do `bunfig.toml` durante o `bun install` do build.*

## 🔵 Aceitos com justificativa

- **Linter Supabase "Extension in Public"** (F3 do QA): `pg_cron`/`pg_net` no schema `public` — design da Supabase; não corrigível sem quebrar cron.
- **`has_role()` SECURITY DEFINER executável por authenticated** (F12 parcial): **requerido** pelas policies RLS. `handle_new_user()` já teve EXECUTE revogado (migration 013).
