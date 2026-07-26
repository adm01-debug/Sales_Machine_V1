-- 1) Hardening: revoke EXECUTE from PUBLIC/anon/authenticated on internal engine functions
REVOKE ALL ON FUNCTION public.check_consent(uuid, sm_channel) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compute_daily_cap(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_recent_account_touchpoint(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signal_score(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_pipeline_health() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_log_target_state_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_sync_target_status() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_consent(uuid, sm_channel) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_daily_cap(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_recent_account_touchpoint(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.signal_score(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_pipeline_health() TO service_role;

-- has_role must stay callable by signed-in users (used by RLS policies)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- 2) Deny-by-default for future functions in public
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- 3) Schedule the operational alert sweep (every 15 minutes)
SELECT cron.unschedule('sm-alert-sweep') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sm-alert-sweep');
SELECT cron.schedule(
  'sm-alert-sweep',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c4a241c3-45be-40f8-862c-f2e559cf55fe.lovable.app/api/public/hooks/alert-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3a2FqeXliY3d2aWRldXN1dHNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MzA2NzQsImV4cCI6MjEwMDEwNjY3NH0.rpRE76FBZzLrnqZnFTGeGXUmdkaIC4nDgBGoT2m7mN4'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 4) Weekly retention: prune target state history older than 90 days
SELECT cron.unschedule('sm-prune-target-events') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sm-prune-target-events');
SELECT cron.schedule(
  'sm-prune-target-events',
  '20 3 * * 0',
  $$DELETE FROM public.campaign_target_events WHERE created_at < now() - interval '90 days'$$
);