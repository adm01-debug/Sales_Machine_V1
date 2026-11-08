# Banco de dados — referência para agentes

Ler **antes** de rodar SQL, criar migration, confiar em introspecção ou mexer em qualquer coisa do
funil. Resumo das regras no `AGENTS.md`; aqui está o detalhe e as armadilhas já pagas.

## Onde se trabalha

| Situação | Onde | Como |
|---|---|---|
| Diagnóstico | **produção, só leitura** | `SELECT` pelo MCP do Supabase deste projeto — **confirmando o ref antes** (abaixo) |
| Migration nova | arquivo novo em `supabase/migrations/` | nunca editar arquivo já aplicado; nome `AAAAMMDDHHMMSS_<slug>.sql` |
| Aplicar DDL em produção | **só com o dono** | PR aberta + aviso; nunca aplicar de branch aberta |
| Apagar dado pessoal | função LGPD dedicada | nunca `DELETE` manual (ver `docs/agentes/regras-dominio.md`) |

## Projeto oficial

| O que | Valor |
|---|---|
| Projeto Supabase | **`twkajyybcwvideusutsb`** (Supabase Cloud) — `supabase/config.toml:1` e `.env` |
| URL | `https://twkajyybcwvideusutsb.supabase.co` |
| Schema | `public`, snake_case, datas `timestamptz` em UTC |
| Extensões | `pg_cron` + `pg_net` no schema `public` (design da Supabase; o linter reclama e é aceito) |
| Ledger de migrations | `supabase_migrations.schema_migrations` (não há espelho versionado no repo) |

> ⚠️ **O MCP do Supabase já apontou para o banco errado.** O MCP disponível na sessão de 2026-08-29
> continha apenas `_grant_snapshot_gatea` — nada do Sales Machine. Antes de confiar em qualquer
> introspecção: confirme o ref (`select current_setting('app.settings.project_ref', true)` não existe
> em todo projeto; use a URL do MCP ou `db_connection_info`/equivalente) e cruze com uma tabela que
> só existe aqui (`campaign_targets`). Se não bater, é outro banco: pare e diga.
> Nesta sessão **nenhum MCP aponta para `twkajyybcwvideusutsb`** — os MCPs de Supabase carregados são
> de outros projetos. Logo, toda afirmação sobre o estado ao vivo é `NÃO VERIFICADO`.

## O que é fonte de verdade

1. **`supabase/migrations/*.sql`** — 45 arquivos (`20260720132748_…` → `20260802125202_…`). É o contrato do repo.
2. **`.contexto-compartilhado/dump-arquitetura.json`** — índice gerado desses arquivos (36 tabelas,
   14 enums, 12 funções, 14 rotas de API, 4 jobs de cron). Consulte antes de grepar.
3. **`src/integrations/supabase/types.ts`** — tipos gerados **do banco real**: 40 tabelas + 2 views
   (`v_contact_profiles`, `v_pipeline_health`). É a melhor pista do que existe de fato em produção.
4. `.contexto-compartilhado/dicionario-dados.md` — semântica e marcação de PII.
5. `docs/SCHEMA_REFERENCE.md` — **não use**: diz "009 migrations" (há 45) e documenta 4 tabelas que
   não existem (ver abaixo).

## Armadilhas confirmadas (2026-11-08)

### 1. Três migrations estão gravadas em base64, não em SQL

`20260720230000_009_consent_identity_templates_bugfixes.sql` (29.200 B),
`20260721090000_010_tick_support_functions.sql` (14.520 B) e
`20260721230000_012_hardening_fmea_fixes.sql` (11.888 B) são **uma linha de base64**, sem newline
(`wc -l` = 0; começam com `LS0g`, que é `"-- "` codificado). Como SQL são inválidas.

Consequência prática: **nada que só existe nessas três migrations existe no banco.** As 4 tabelas que
elas criam — `stop_word_lists`, `agent_identity_config`, `marketing_templates`, `content_calendar` —
não estão em `types.ts` nem são referenciadas em `src/` (grep = 0). O mesmo vale para
`fn_claim_cadence_batch`, `fn_recover_stale_locks`, `validate_template_vars`,
`export_entity_personal_data`, `delete_entity_personal_data`, `fn_archive_old_target_events`,
`fn_try_decrement_quota`, `increment_sender_health`, `fn_reset_daily_quotas` e a view `v_security_audit`.

Não "conserte" decodificando e reaplicando por conta própria: isso é DDL em produção (chamar o dono) e
parte do conteúdo redefine funções que já existem em outras versões.

### 2. `check_consent` tem três definições; a vigente é a do arquivo em texto plano

`20260722200408_….sql:29` (SECURITY **DEFINER**) → `20260722200434_….sql:1` (SECURITY **INVOKER**,
a vigente) → uma terceira dentro da migration base64 `009` (L177 do decodificado, **não aplicada**).
A semântica da vigente é `COALESCE(..., TRUE)` (`20260722200434_….sql:8-14`): **ausência de registro
no `consent_ledger` = permitido**. Os motores puros repetem isso (`src/lib/cadence-engine.ts:121`,
`journey-engine.ts:335`, `journey-triggers.ts:112`, `audience-resolver.server.ts:59`).
`tg_validate_target_state_transition()` também tem duas definições (ambas em migrations base64).

### 3. Permissões de função já foram endurecidas — não afrouxe

`20260726170010_….sql:2-21` revoga `EXECUTE` de `PUBLIC`/`anon`/`authenticated` em `check_consent`,
`compute_daily_cap`, `has_recent_account_touchpoint`, `signal_score`, `refresh_pipeline_health` e nos
`tg_*`, concede a `service_role`, aplica `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE` e **mantém
`has_role` executável por `authenticated` de propósito** (as policies RLS dependem dele).

### 4. RLS

36 `ALTER TABLE … ENABLE ROW LEVEL SECURITY` e 82 `CREATE POLICY` nas migrations em texto plano —
toda tabela do schema nasce com RLS. Tabela nova sem RLS é regressão; "desabilitar temporariamente"
é proibido. Quem bypassa RLS é só o client de service role
(`src/integrations/supabase/client.server.ts`, exportado como Proxy lazy), usado nos hooks e webhooks.

### 5. pg_cron: o que está agendado nos arquivos ≠ o que a doc antiga diz

| Job | Cron | Alvo | Evidência |
|---|---|---|---|
| `sm-tick-marketing` | `*/5 * * * *` | `POST /api/public/hooks/tick-marketing` | `20260726145822_….sql:1` |
| `sm-alert-sweep` | `*/15 * * * *` | `POST /api/public/hooks/alert-sweep` | `20260726170010_….sql:25` |
| `sm-prune-target-events` | `20 3 * * 0` | `DELETE FROM campaign_target_events` > 90 dias | `20260726170010_….sql:42` |
| `sm-tick-journeys` | `* * * * *` | `POST /api/public/hooks/tick-journeys` | `20260726184515_….sql:7` |

- **Não existe job para `tick-cadence`** em nenhuma migration (`grep -rl tick-cadence supabase/migrations` = vazio).
  Os schedules `sm-cadence-tick`, `sm-quota-reset` e `sm-archive-events` estão **comentados** dentro da
  migration base64 `010`. O worker 1:1 só roda se algo externo chamar o endpoint — o QA de 2026-07-22
  afirmava que `sm-tick-cadence` estava ativo; nos arquivos, não está. **Estado ao vivo: NÃO VERIFICADO**
  (sem MCP apontando para o projeto).
- Também não há job para `budget-reallocate` (o próprio arquivo só sugere "a cada 30 minutos",
  `src/routes/api/public/hooks/budget-reallocate.ts:9`).
- Os três `net.http_post` agendados embutem **a URL do preview do Lovable**
  (`https://project--c4a241c3-…lovable.app`) e a **publishable/anon key em texto claro** no header
  `apikey` (`20260726145822_….sql:6-9` e análogos). A chave é pública por design, mas: trocar de
  domínio ou rotacionar a chave **quebra os três jobs** e exige migration nova.

### 6. Índice do tick não casa com a query do tick

A migration `010` (base64, não aplicada) cria
`idx_campaign_targets_tick ON campaign_targets(next_run_at, state) WHERE state='queued' AND locked_until IS NULL`,
enquanto o worker filtra `state in ('queued','running')` (`src/routes/api/public/hooks/tick-cadence.ts:45`).
Mesmo se aplicada, o índice parcial não serviria a essa query.

### 7. `channel_quotas` está vazia

O seed da migration 012 falhou silenciosamente (insert sem `user_id`, que é NOT NULL). Sem efeito hoje
porque o worker usa `compute_daily_cap` + `sender_health`; quando quotas por usuário forem ligadas,
o seed precisa ser corrigido.

### 8. Edge function residual com exfiltração de credenciais

`supabase/functions/migrate-helper/index.ts` existe (1.673 B), com `verify_jwt = false`
(`supabase/config.toml:3`), `Access-Control-Allow-Origin: "*"`, uma **chave de acesso hex hardcoded no
fonte** e a ação `?action=credentials`, que devolve `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_DB_URL` a
quem apresentar essa chave — que está em claro no repositório. O próprio código diz "Após a migração,
remova esta função" (L3). Veio do commit `338899a` ("Visual edit in Lovable", 2026-08-28).

**Se estiver publicada no projeto, é exfiltração de service_role por um GET.** Verificar e remover é
decisão do dono (remoção + rotação de chave): `.contexto-compartilhado/pendencias-conhecidas.md`
registra isso. Está publicada? **NÃO VERIFICADO** — nenhum MCP desta sessão alcança o projeto.

## Convenções de migration

1. Arquivo **novo** sempre; nunca editar nem renomear migration já aplicada (quebra a reprodutibilidade).
2. Toda tabela nova: RLS habilitado + policies no mesmo arquivo.
3. Mudança estrutural ⇒ `python3 scripts/gerar-dump-arquitetura.py` e commit do dump no mesmo ciclo (Lei 12),
   + `dicionario-dados.md` se mudar semântica.
4. Ordem: arquivo → PR → merge → só então aplicar em produção, **com o dono**. Nunca DDL de branch aberta.
5. Append-only (`sales_machine_events`, `campaign_target_events`): nada de `DELETE`/`UPDATE` — a poda é
   o cron `sm-prune-target-events` (>90 dias).
6. `entity_map`: upsert por `ON CONFLICT (kind, lux_id)` / `(kind, singu_id)` — os índices únicos
   parciais estão em `20260720132748_….sql:69-70`. Nunca INSERT direto.
7. `sales_machine_events`: `INSERT … ON CONFLICT DO NOTHING` sobre `(source, external_id)` — é a
   proteção de replay dos webhooks.
8. Nomenclatura de trigger é **inconsistente** no histórico (`trg_*` domina, há `tg_*` e alguns sem
   prefixo, como `journeys_touch`); siga o padrão da tabela vizinha e não renomeie o que existe.
   O QA de 22/07 registrou triggers duplicados em `campaign_targets` (F2); `20260721142041_….sql:3,8,14`
   recria os três.
