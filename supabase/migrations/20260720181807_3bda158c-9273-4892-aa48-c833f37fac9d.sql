
-- Item 1: state machine + audit log for campaign_targets
CREATE TYPE public.sm_target_state AS ENUM (
  'queued','running','paused','replied','stopped','lost','completed','dead_letter'
);

ALTER TABLE public.campaign_targets
  ADD COLUMN state public.sm_target_state NOT NULL DEFAULT 'queued',
  ADD COLUMN attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN locked_until timestamptz,
  ADD COLUMN last_transition_at timestamptz NOT NULL DEFAULT now();

-- Backfill state from legacy status
UPDATE public.campaign_targets SET state =
  CASE status
    WHEN 'queued' THEN 'queued'::public.sm_target_state
    WHEN 'running' THEN 'running'::public.sm_target_state
    WHEN 'completed' THEN 'completed'::public.sm_target_state
    WHEN 'failed' THEN 'dead_letter'::public.sm_target_state
    WHEN 'paused' THEN 'paused'::public.sm_target_state
    ELSE 'queued'::public.sm_target_state
  END;

CREATE INDEX IF NOT EXISTS idx_campaign_targets_state_run
  ON public.campaign_targets(state, next_run_at)
  WHERE state IN ('queued','running');

-- Audit log
CREATE TABLE public.campaign_target_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.campaign_targets(id) ON DELETE CASCADE,
  from_state public.sm_target_state,
  to_state public.sm_target_state NOT NULL,
  reason text,
  actor text NOT NULL DEFAULT 'system',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaign_target_events_target ON public.campaign_target_events(target_id, created_at DESC);

GRANT SELECT ON public.campaign_target_events TO authenticated;
GRANT ALL ON public.campaign_target_events TO service_role;

ALTER TABLE public.campaign_target_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "target events readable by roles"
  ON public.campaign_target_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')
  );

-- Auto-log transitions
CREATE OR REPLACE FUNCTION public.tg_log_target_state_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.campaign_target_events(target_id, from_state, to_state, reason, actor)
    VALUES (NEW.id, NULL, NEW.state, 'created', 'system');
    RETURN NEW;
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    INSERT INTO public.campaign_target_events(target_id, from_state, to_state, reason, actor, payload)
    VALUES (NEW.id, OLD.state, NEW.state, NEW.last_error, 'system',
            jsonb_build_object('attempts', NEW.attempts, 'current_step', NEW.current_step));
    NEW.last_transition_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_targets_state_log ON public.campaign_targets;
CREATE TRIGGER trg_campaign_targets_state_log
  AFTER INSERT OR UPDATE OF state ON public.campaign_targets
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_target_state_change();

-- Keep legacy status column in sync (compat with existing worker)
CREATE OR REPLACE FUNCTION public.tg_sync_target_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.status = CASE NEW.state
    WHEN 'queued' THEN 'queued'
    WHEN 'running' THEN 'running'
    WHEN 'paused' THEN 'paused'
    WHEN 'completed' THEN 'completed'
    WHEN 'replied' THEN 'completed'
    WHEN 'stopped' THEN 'completed'
    WHEN 'lost' THEN 'completed'
    WHEN 'dead_letter' THEN 'failed'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_targets_status_sync ON public.campaign_targets;
CREATE TRIGGER trg_campaign_targets_status_sync
  BEFORE INSERT OR UPDATE OF state ON public.campaign_targets
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_target_status();
