CREATE INDEX IF NOT EXISTS idx_campaign_target_events_operator
  ON public.campaign_target_events (created_at DESC)
  WHERE actor LIKE 'operator:%';