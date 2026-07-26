-- Partial index: only dead-letter rows are indexed, keeping it tiny and
-- write-cheap while serving both the operator requeue batch (oldest first)
-- and the dead-letter count on the ops dashboard.
CREATE INDEX IF NOT EXISTS idx_campaign_targets_dead_letter_recovery
  ON public.campaign_targets (last_transition_at ASC)
  WHERE state = 'dead_letter';