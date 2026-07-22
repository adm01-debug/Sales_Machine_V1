-- =====================================================================
-- MIGRATION 013 — QA hardening (2026-07-22)
-- Corrige regressões confirmadas pela auditoria QA exaustiva.
-- =====================================================================

-- 🔴 F1: CHECK constraint de campaign_targets.status não aceita 'completed'
-- Sincronizador (tg_sync_target_status) escreve 'completed' quando state ∈
-- (completed, replied, stopped, lost). CHECK atual só aceita
-- (queued,running,done,failed,paused) → qualquer encerramento explode.
ALTER TABLE public.campaign_targets DROP CONSTRAINT IF EXISTS campaign_targets_status_check;
ALTER TABLE public.campaign_targets
  ADD CONSTRAINT campaign_targets_status_check
  CHECK (status IN ('queued','running','done','failed','paused','completed'));

-- 🔴 F2: Triggers duplicados em campaign_targets. Migration 012 tentou
-- dropar mas uma migração posterior os recriou. Cada transição de estado
-- grava 2 audit rows e roda o sync 2x. Manter apenas os canônicos
-- (nomeados trg_campaign_targets_state_log/status_sync).
DROP TRIGGER IF EXISTS trg_log_target_state_change ON public.campaign_targets;
DROP TRIGGER IF EXISTS trg_sync_target_status     ON public.campaign_targets;

-- 🟡 F12: linter warning — handle_new_user é SECURITY DEFINER exposta a
-- signed-in users. É trigger em auth.users, não deve ser chamada
-- diretamente. Revogar EXECUTE de authenticated/anon.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Verificação
DO $$
DECLARE
  n_log int; n_sync int; has_completed bool; n_exec int;
BEGIN
  SELECT count(*) INTO n_log FROM pg_trigger
    WHERE tgrelid='public.campaign_targets'::regclass AND NOT tgisinternal
      AND tgname LIKE '%state_log%';
  SELECT count(*) INTO n_sync FROM pg_trigger
    WHERE tgrelid='public.campaign_targets'::regclass AND NOT tgisinternal
      AND tgname LIKE '%status_sync%';
  SELECT pg_get_constraintdef(oid) LIKE '%completed%' INTO has_completed
    FROM pg_constraint WHERE conname='campaign_targets_status_check';
  SELECT count(*) INTO n_exec FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='handle_new_user'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  RAISE NOTICE 'QA-013 OK — state_log_triggers=% status_sync_triggers=% status_has_completed=% handle_new_user_exec_by_auth=%',
    n_log, n_sync, has_completed, n_exec;
  ASSERT n_log = 1  AND n_sync = 1 AND has_completed AND n_exec = 0,
    'QA-013 verification failed';
END $$;