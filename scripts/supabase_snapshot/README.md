# supabase-snapshot

Mantém um retrato completo do banco OFICIAL (`twkajyybcwvideusutsb`) para agentes de IA lerem **antes** de
qualquer tarefa ou planejamento que toque banco, RLS, functions, cron, storage ou edge functions.

## Onde está o resultado (neste repo)

O snapshot **não** é comitado na main:
o job `banco` de `.github/workflows/contexto.yml` roda a cada hora e publica em `docs/contexto/supabase/` da branch
**`contexto`** (junto com `codigo/` e `regras/`; índice em `docs/contexto/00-INDEX.md`). Só há commit quando algo mudou.

Como ler, sem trocar de branch:

```sh
git fetch origin contexto
git show origin/contexto:docs/contexto/supabase/README.md          # protocolo + resumo
git show origin/contexto:docs/contexto/supabase/tables/public/<tabela>.md
git show origin/contexto:docs/contexto/supabase/lints.md           # antes de mexer em RLS/functions/índices
```

Ou por URL (sem clone): `https://raw.githubusercontent.com/adm01-debug/sales_machine_v1/contexto/docs/contexto/supabase/README.md`.

Última coleta concluída publicada: `docs/contexto/supabase/manifest.json` → `gerado_em` (UTC).
Última publicação: `git log -1 --format=%cI origin/contexto -- docs/contexto/supabase`.
O manifest também informa `erros` e `carried`; uma coleta recente pode ser parcial. Detalhes em `errors.md`.
Seu timestamp não entra em `snapshot.json` nem nos fingerprints: consultar um banco sem mudanças
renova o frescor sem inventar uma alteração estrutural no `CHANGELOG.md`.

Neste repo `schema.sql` e `types.ts` estão desligados (`PGDUMP=false`, `GEN_TYPES=false` no workflow):
o runner só tem `pg_dump` 16 (banco é PG 17) e os tipos vivem versionados em
`src/integrations/supabase/types.ts`.

## Secret necessário

`SUPABASE_DB_URL` (Settings → Secrets and variables → Actions), com estas três exigências:

1. **Session pooler, não conexão direta.** O host direto `db.<ref>.supabase.co` é só IPv6 e o runner do
   GitHub não tem IPv6 → falha na conexão. Use o "Session pooler" do dashboard:
   `postgresql://postgres.<ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:5432/postgres`.
2. **Usuário `postgres` (recomendado).** O `cron.job` e `cron.job_run_details` têm RLS com policy
   `username = current_user`; um role read-only comum enxerga zero jobs. O `postgres` do Supabase tem
   `BYPASSRLS`. O script abre a sessão em `default_transaction_read_only = on` — mesmo com `postgres`
   nada é escrito.
3. Se preferir um role separado (perde o cron, vê o resto): SQL abaixo.

Não reutiliza `DESTINO_URL` de propósito: aquele secret está preso ao environment `banco-leitura` e a um
mapa fechado de jobs (`scripts/ci/secrets-environments.unit.mjs`).

## O que é coletado

| Fonte | O que entra |
|---|---|
| Postgres (catálogo) | schemas (+USAGE das roles da API), tabelas (RLS on/forced, partições, replica identity), colunas (tipo, default, identity/generated, enum, comentário), constraints (PK/FK/UNIQUE/CHECK com ON DELETE/UPDATE e referências reversas), índices (método, colunas, predicado), views + materialized (security_invoker, dependências), functions/procedures (corpo, security definer, search_path, quem pode executar via RPC), triggers (timing/eventos; inclui `auth.users` e `storage.objects`), policies RLS (inclui `storage` e `realtime.messages`), enums (+ onde são usados)/domains/composites, extensões, sequences (owned by), grants (tabela, coluna, sequence, **default privileges**), roles (+`rolconfig`: timeouts por role) |
| Supabase | `cron.job`, `pgmq` (filas), `supabase_migrations.schema_migrations` (com SQL), `storage.buckets`, `vault.secrets` (só nomes), Database Webhooks, realtime publications, foreign servers (credenciais redigidas) |
| Lints (`lints.md`) | RLS desabilitado / sem policies, tabela sem PK, FK sem índice, SECURITY DEFINER sem `search_path`, view em `public` sem `security_invoker`, função chamável por `anon`, extensão em `public`, policy com `auth.uid()` sem `(select …)`, tabela no Realtime sem REPLICA IDENTITY FULL |
| Relacionamentos | todas as FKs + diagrama ER Mermaid (até 120 tabelas) |
| Referências a cada função (`functions.md`, `snapshot.json` → `db.functions[].callers`) | referências estáticas (`.rpc('fn')` ou `fn(` em `src/`, `supabase/functions/`, migrations ativas, scripts operacionais…), jobs do pg_cron, triggers, outras funções e views |
| Management API (opcional) | edge functions (versão, verify_jwt, entrypoint, URL), nomes dos secrets, auth (providers, hooks, config), PostgREST (schemas expostos, max_rows), Postgres/pooler/storage config, network/SSL, branches, PITR/backups — segredos redigidos |
| Métricas voláteis (`stats.*`, `cron-runs.md`) | tamanho por tabela/schema, linhas e scans (aproximados), índices nunca usados, storage por bucket, auth (agregados), filas, top queries do `pg_stat_statements` (normalizadas), conexões, saúde dos serviços, últimas execuções do cron |
| Ferramentas | `schema.sql` (pg_dump --schema-only), `types.ts` (supabase gen types) |

Nunca sai: linha de tabela, dado de usuário, valor de secret/chave/senha, connection string.

### Estatísticas de consultas

O schema de `pg_stat_statements` é descoberto em `pg_extension`/`pg_namespace`; a consulta usa
identificador delimitado e não depende do `search_path` (no projeto oficial, a view está em
`extensions`). `STAT_STATEMENTS_TOP=0` ou extensão ausente apenas omitem essa coleta opcional.
Falha no catálogo, na view ou no tratamento do resultado é registrada como `db_stats.top_queries`,
preservando tamanho do banco, conexões, storage, filas e os agregados de auth que puderam ser lidos.
Erro em auth permanece independente como `db_stats.auth`. Nenhuma permissão é concedida e nenhuma
extensão é criada pelo coletor; a ausência de `top_queries` após erro não é apresentada como lista vazia.

O filtro de comandos usa `\y`, limite de palavra do PostgreSQL. `\b` nesse motor significa
backspace e descartava até `select 1`. Uma matriz de 48 strings constantes foi validada no
PostgreSQL: 24 divergências com o filtro antigo e nenhuma com o filtro corrigido, sem ler
linhas de clientes ou executar os comandos contidos nas strings.

### Como interpretar referências a funções

O mapa de código ignora assinaturas de declaração/alteração de funções, diretórios históricos
`_foreign`/`_superseded`, testes, fixtures e stories reconhecidos por nome. Chamadas no corpo de uma
função SQL e em migrations ativas continuam contando; pastas sobrepostas em `CODE_SCAN_DIRS` não
duplicam as ocorrências. Os arquivos do repositório e o inventário de funções do banco são preservados.
A busca por nome é heurística e compartilha referências entre overloads: não comprova execução e a
ausência de referência não autoriza remover uma função. Entradas `aggregate`/`window` continuam no
catálogo sem corpo SQL, conforme a consulta do produtor; isso não representa falha de coleta.

Se a coleta de `functions` falha, os metadados/SQL e as referências entre funções (`callers.db`)
continuam vindo do histórico. Código, cron, triggers e views atualizam suas próprias categorias quando
a fonte foi lida; fonte reaproveitada ou indisponível preserva as referências anteriores disponíveis.
Uma coleta bem-sucedida vazia remove referências antigas. Falha de leitura do código é registrada em
`errors.md`; não equivale a código sem chamadas. `README.md` e `functions.md` mostram o estado de cada
fonte do mapa, sem apresentar todo o mapa como atualizado.

### Role somente leitura (opcional — não enxerga pg_cron)

```sql
create role snapshot_reader login password '<senha-forte>';
grant pg_read_all_data to snapshot_reader;           -- leitura de todos os schemas
grant usage on schema cron, vault, storage, auth, supabase_migrations to snapshot_reader;
```
`pg_read_all_data` cobre `cron.job`, `vault.secrets` (só metadados; o valor descriptografado fica em `vault.decrypted_secrets`, que o script não lê), `storage`, `auth` e `supabase_migrations`. Para `pg_stat_statements` e `pg_stat_activity` completos, adicione `grant pg_read_all_stats to snapshot_reader;`. Monte a `SUPABASE_DB_URL` com esse usuário.

## Variáveis opcionais (no workflow, bloco `env`)

| Var | Default | Efeito |
|---|---|---|
| `SNAPSHOT_DIR` | `docs/supabase` (no workflow: `docs/contexto/supabase`) | pasta de saída |
| `PGDUMP_SCHEMAS` | `public` | schemas do `schema.sql`, separados por vírgula |
| `GEN_TYPES` | `true` | gera `types.ts` via `npx supabase gen types` |
| `PGDUMP` | `true` | gera `schema.sql` via `pg_dump` (exige pg_dump >= versão do servidor) |
| `SNAPSHOT_EXCLUDE_SCHEMAS` | vazio | schemas extras a ignorar na introspecção |
| `SNAPSHOT_INCLUDE_SCHEMAS` | vazio | schemas internos do Supabase a forçar inclusão |
| `STAT_STATEMENTS_TOP` | `15` | consultas mais custosas em `stats.md` (0 desliga) |
| `CRON_RUNS_PER_JOB` | `3` | execuções recentes guardadas por job do pg_cron |
| `REPO_ROOT` | `.` | raiz do repo para cruzar funções × código (vazio desliga) |
| `CODE_SCAN_DIRS` | `src,supabase/functions,supabase/migrations,scripts,…` | pastas varridas na busca de chamadas |

## Comportamento

- Só há commit quando o conteúdo estrutural mudou. Métricas voláteis vivem em `stats.md`/`stats.json`/`cron-runs.md`; quando só elas mudam, o commit é limitado a 1 por hora (`VOLATILE_MIN_INTERVAL_MIN` no workflow).
- Schemas internos do Supabase (`auth`, `storage`, `realtime`, `extensions`, `graphql*`, `net`, `pgsodium`, `vault`…) ficam fora da introspecção geral para não poluir; o que importa deles entra em seções dedicadas. Use `SNAPSHOT_INCLUDE_SCHEMAS` para forçar um deles.
- Uma seção que falha (ex.: sem permissão em `vault`) é reaproveitada da coleta anterior com aviso no topo do arquivo — nunca gera "tudo removido" no CHANGELOG.
- `CHANGELOG.md` registra, a cada mudança, o que foi adicionado/removido/alterado por categoria.
- Falha em uma seção (ex.: sem permissão em `vault`) não derruba as outras: vai para `errors.md` e para o README. O job só falha se o banco inteiro não responder, se o push falhar 3 vezes, ou se o guard de segredos detectar algo.
- Sessão read-only no Postgres, `statement_timeout` 90s, `lock_timeout` 5s.
- A Management API devolve só o bundle compilado das edge functions, então o snapshot guarda metadados (`edge-functions/<slug>/README.md`); o fonte canônico é `supabase/functions/<slug>/` no repo.
- Conexão com `prepare_threshold=None`: funciona tanto na conexão direta quanto no pooler (session ou transaction mode). `pg_dump` exige session mode ou conexão direta.
- `concurrency` impede duas coletas simultâneas; push faz `pull --rebase` com 3 tentativas para conviver com outros agentes comitando na `main`.
- Commits levam `[skip ci]` para não disparar deploy (Vercel/Lovable ignoram; se o deploy for por GitHub Actions, confira que o workflow respeita a flag ou adicione `paths-ignore: docs/supabase/**`).

## Rodar localmente

```bash
pip install -r scripts/supabase_snapshot/requirements.txt
export SUPABASE_DB_URL='postgresql://...'
python scripts/supabase_snapshot/snapshot.py
```

## Testes offline

```sh
python3 scripts/supabase_snapshot/test_snapshot.py -v
node --test scripts/ci/supabase-snapshot.unit.mjs
```

Não exigem banco, rede, credenciais nem o pacote psycopg: a conexão é simulada. Verificam a preservação
do SQL e dos metadados em coletas parciais, a ausência de arquivos anteriores e a recuperação na coleta
saudável seguinte. A matriz cobre 24 sequências: functions/migrations × histórico ausente/completo/sem
SQL × uma/três falhas × recuperação com registros alterados/vazios. Casos adicionais verificam
referências reais versus DDL/testes, pastas configuradas e os tipos de rotina sem corpo SQL.
Outra matriz cobre as oito combinações de cron/triggers/views reaproveitados enquanto functions falha,
além de fontes vazias, indisponíveis e recuperação, preservando a base anterior do changelog.
Os casos de frescor verificam o manifest em UTC, coleta sem mudança estrutural, falha/recuperação e
sua prioridade sobre um CHANGELOG antigo no índice; chamadas em DEFAULTs da assinatura também têm regressão.
O adaptador Node participa da suíte existente `scripts/ci/*.unit.mjs` e executa a mesma suíte Python.

A matriz de estatísticas usa somente resultados sintéticos: schemas fora do `search_path`, aspas,
espaços, `%` e palavras SQL no identificador; extensão ausente ou coleta desligada; erros de catálogo,
permissão, view, prazo e resultado; auth independente; recuperação e preservação das demais métricas
no JSON/Markdown. Ela não executa SQL nem consulta permissões do banco real.

