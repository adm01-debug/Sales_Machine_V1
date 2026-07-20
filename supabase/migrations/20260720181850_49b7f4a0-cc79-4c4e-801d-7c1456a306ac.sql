
ALTER TABLE public.contact_touchpoints
  ADD COLUMN attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN next_retry_at timestamptz;

ALTER TYPE public.sm_touchpoint_status ADD VALUE IF NOT EXISTS 'dead_letter';
ALTER TYPE public.sm_touchpoint_status ADD VALUE IF NOT EXISTS 'pending_approval';

CREATE INDEX IF NOT EXISTS idx_contact_touchpoints_retry
  ON public.contact_touchpoints(next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;
