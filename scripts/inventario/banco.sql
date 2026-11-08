-- Inventario do banco oficial (so leitura) para inventario/estado/banco.json.
--
-- Uso (credencial viva):   node scripts/inventario/gerar-banco.mjs
-- Uso (agente com MCP):     rodar este arquivo no MCP oficial, salvar a resposta e
--                           node scripts/inventario/gerar-banco.mjs --entrada <arquivo.json>
--
-- Imprime UMA linha com UM JSON. So SELECT em catalogo e em tabelas de estado; nada de
-- texto livre que possa carregar segredo: de cron.job sai so o nome das funcoes chamadas (nome seguido de "(")
-- (nunca o command inteiro, que pode ter URL/cabecalho, nem o `apikey` dos hooks do pg_cron).
-- Ordem de toda lista e explicita para o diff ser estavel.

WITH
-- Linhas: count(*) exato quando a estimativa do planner (reltuples, persiste entre
-- reinicios) fica abaixo de 200 mil; acima disso, a estimativa. NAO usar
-- pg_stat_user_tables.n_live_tup: zera quando o servidor reinicia (em 2026-11-02 dava
-- messages = 1 com 53 mil linhas reais).
base AS (
  SELECT c.oid, c.relname AS nome, c.relrowsecurity AS rls, c.relforcerowsecurity AS rls_forcado,
         c.reltuples, pg_total_relation_size(c.oid)::bigint AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
),
tabelas AS (
  SELECT b.oid, b.nome, b.rls, b.rls_forcado, b.bytes,
         b.reltuples < 200000 AS linhas_exatas,
         CASE WHEN b.reltuples < 200000
              THEN (xpath('/row/n/text()',
                          query_to_xml(format('SELECT count(*) AS n FROM public.%I', b.nome), false, true, '')))[1]::text::bigint
              ELSE b.reltuples::bigint END AS linhas
    FROM base b
),
corpos AS (  -- tudo no banco que pode citar uma tabela: funcoes e views do public
  SELECT p.prosrc AS txt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
  UNION ALL
  SELECT pg_get_viewdef(c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
),
policies AS (
  SELECT tablename AS nome, count(*)::int AS n FROM pg_policies WHERE schemaname = 'public' GROUP BY 1
),
gatilhos AS (
  SELECT t.tgrelid AS oid, count(*)::int AS n FROM pg_trigger t WHERE NOT t.tgisinternal GROUP BY 1
),
execucoes AS (
  SELECT d.jobid, d.status, d.return_message, d.start_time, d.end_time
    FROM cron.job_run_details d
   WHERE d.start_time > now() - interval '7 days'
),
por_job AS (
  SELECT e.jobid,
         count(*) FILTER (WHERE e.start_time > now() - interval '24 hours')::int AS exec_24h,
         count(*) FILTER (WHERE e.start_time > now() - interval '24 hours' AND e.status = 'failed')::int AS falhas_24h,
         count(*)::int AS exec_7d,
         count(*) FILTER (WHERE e.status = 'failed')::int AS falhas_7d,
         count(*) FILTER (WHERE e.status = 'failed' AND e.return_message LIKE 'job startup timeout%')::int AS startup_timeout_7d,
         max(e.start_time) FILTER (WHERE e.status = 'failed') AS ultima_falha,
         round(max(extract(epoch FROM e.end_time - e.start_time)) FILTER (WHERE e.status = 'succeeded'))::int AS duracao_max_s_7d
    FROM execucoes e GROUP BY e.jobid
),
por_hora AS (
  SELECT date_trunc('hour', e.start_time) AS hora, count(*)::int AS execucoes,
         count(*) FILTER (WHERE e.status = 'failed')::int AS falhas
    FROM execucoes e GROUP BY 1
)
SELECT jsonb_build_object(
  'format_version', 1,
  'medido_em', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),

  'resumo', jsonb_build_object(
    'postgres', current_setting('server_version'),
    'tabelas_public', (SELECT count(*) FROM tabelas),
    'tabelas_sem_rls', (SELECT count(*) FROM tabelas WHERE NOT rls),
    'policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'),
    'funcoes_public', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                        WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')),
    'views_public', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                      WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')),
    'triggers_public', (SELECT coalesce(sum(g.n), 0) FROM gatilhos g JOIN tabelas t ON t.oid = g.oid),
    'cron_jobs', (SELECT count(*) FROM cron.job),
    'cron_ativos', (SELECT count(*) FROM cron.job WHERE active),
    'ledger_registros', (SELECT count(*) FROM supabase_migrations.schema_migrations),
    'ledger_versao_max', (SELECT max(version) FROM supabase_migrations.schema_migrations),
    'max_connections', current_setting('max_connections')::int,
    'tamanho_bytes', pg_database_size(current_database())
  ),

  'tabelas', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'nome', t.nome,
             'rls', t.rls,
             'rls_forcado', t.rls_forcado,
             'policies', coalesce(p.n, 0),
             'triggers', coalesce(g.n, 0),
             'linhas', t.linhas,
             'linhas_exatas', t.linhas_exatas,
             'bytes', t.bytes,
             'citada_no_banco', EXISTS (SELECT 1 FROM corpos c WHERE c.txt ~ ('\m' || t.nome || '\M'))
           ) ORDER BY t.nome), '[]'::jsonb)
      FROM tabelas t
      LEFT JOIN policies p ON p.nome = t.nome
      LEFT JOIN gatilhos g ON g.oid = t.oid
  ),

  'cron', jsonb_build_object(
    'config', (SELECT jsonb_object_agg(name, setting ORDER BY name) FROM pg_settings
                WHERE name IN ('cron.use_background_workers', 'cron.max_running_jobs', 'max_worker_processes')),
    'jobs', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'nome', j.jobname,
               'agenda', j.schedule,
               'ativo', j.active,
               'chama', (SELECT coalesce(jsonb_agg(DISTINCT m[1] ORDER BY m[1]), '[]'::jsonb)
                           FROM regexp_matches(j.command, '((?:public|net|cron)\.[a-z_0-9]+)\s*\(', 'g') AS m),
               'execucoes_24h', coalesce(pj.exec_24h, 0),
               'falhas_24h', coalesce(pj.falhas_24h, 0),
               'execucoes_7d', coalesce(pj.exec_7d, 0),
               'falhas_7d', coalesce(pj.falhas_7d, 0),
               'startup_timeout_7d', coalesce(pj.startup_timeout_7d, 0),
               'taxa_falha_7d_pct', CASE WHEN coalesce(pj.exec_7d, 0) = 0 THEN 0
                                         ELSE round(100.0 * pj.falhas_7d / pj.exec_7d, 1) END,
               'ultima_falha', to_char(pj.ultima_falha AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               'duracao_max_s_7d', pj.duracao_max_s_7d
             ) ORDER BY j.jobname), '[]'::jsonb)
        FROM cron.job j LEFT JOIN por_job pj ON pj.jobid = j.jobid
    ),
    -- Hora com mais da metade das execucoes falhando: o cron ficou parado naquela hora.
    'horas_paradas_7d', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'hora', to_char(h.hora AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24":00Z"'),
               'execucoes', h.execucoes, 'falhas', h.falhas) ORDER BY h.hora), '[]'::jsonb)
        FROM por_hora h WHERE h.falhas * 2 > h.execucoes
    ),
    'historico', jsonb_build_object(
      'linhas', (SELECT count(*) FROM cron.job_run_details),
      'mais_de_7_dias', (SELECT count(*) FROM cron.job_run_details WHERE start_time <= now() - interval '7 days'),
      'mais_antigo', (SELECT to_char(min(start_time) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM cron.job_run_details),
      'bytes', pg_total_relation_size('cron.job_run_details')
    )
  )
) AS inventario;
