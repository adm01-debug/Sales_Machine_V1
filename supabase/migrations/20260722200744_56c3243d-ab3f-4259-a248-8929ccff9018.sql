CREATE MATERIALIZED VIEW IF NOT EXISTS public.v_pipeline_health AS
SELECT
  COUNT(*) FILTER (WHERE state = 'queued') AS queued,
  COUNT(*) FILTER (WHERE state = 'running') AS running,
  COUNT(*) FILTER (WHERE state = 'paused') AS paused,
  COUNT(*) FILTER (WHERE state = 'replied') AS replied,
  COUNT(*) FILTER (WHERE state = 'stopped') AS stopped,
  COUNT(*) FILTER (WHERE state = 'completed') AS completed,
  COUNT(*) FILTER (WHERE state = 'dead_letter') AS dead_letter,
  COUNT(*) FILTER (WHERE state = 'lost') AS lost,
  COUNT(*) AS total,
  (SELECT COUNT(*) FROM public.contact_touchpoints WHERE direction = 'outbound' AND created_at > now() - interval '24 hours') AS sent_24h,
  (SELECT COUNT(*) FROM public.contact_touchpoints WHERE direction = 'inbound' AND created_at > now() - interval '24 hours') AS replies_24h,
  (SELECT COUNT(DISTINCT entity_id) FROM public.consent_ledger WHERE status = 'opt_out' AND created_at > now() - interval '7 days') AS opt_outs_7d,
  now() AS refreshed_at
FROM public.campaign_targets;

GRANT SELECT ON public.v_pipeline_health TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_pipeline_health()
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  REFRESH MATERIALIZED VIEW public.v_pipeline_health;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_pipeline_health() TO authenticated, service_role;