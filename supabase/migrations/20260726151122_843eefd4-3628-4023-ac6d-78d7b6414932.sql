ALTER TYPE public.sm_source ADD VALUE IF NOT EXISTS 'fuxico';

ALTER TABLE public.entity_map ADD COLUMN IF NOT EXISTS fuxico_id text;
CREATE UNIQUE INDEX IF NOT EXISTS entity_map_fuxico_id_key
  ON public.entity_map (fuxico_id) WHERE fuxico_id IS NOT NULL;

ALTER TABLE public.contact_touchpoints ADD COLUMN IF NOT EXISTS fuxico_tracking_id text;
CREATE INDEX IF NOT EXISTS contact_touchpoints_fuxico_tracking_id_idx
  ON public.contact_touchpoints (fuxico_tracking_id) WHERE fuxico_tracking_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS email_deliverability_events_external_id_key
  ON public.email_deliverability_events (external_id) WHERE external_id IS NOT NULL;