-- Índices parciais para as contagens de compliance (/ops e alert-sweep).
-- Parciais porque só as linhas com esses estados são consultadas: o índice
-- fica pequeno e o planner escolhe bitmap scan em vez de seq scan.
CREATE INDEX IF NOT EXISTS idx_campaign_targets_consent_blocked
  ON public.campaign_targets (state)
  WHERE state = 'stopped' AND last_error IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_sends_skipped
  ON public.campaign_sends (state)
  WHERE state = 'skipped' AND last_error IS NOT NULL;