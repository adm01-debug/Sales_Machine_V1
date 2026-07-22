CREATE TABLE IF NOT EXISTS public.email_deliverability_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  touchpoint_id UUID REFERENCES public.contact_touchpoints(id) ON DELETE SET NULL,
  entity_id UUID REFERENCES public.entity_map(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('hard_bounce','soft_bounce','complaint','unsubscribe','delivered','opened','clicked')),
  provider TEXT NOT NULL,
  external_id TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_email_deliv_touchpoint ON public.email_deliverability_events(touchpoint_id);
CREATE INDEX IF NOT EXISTS idx_email_deliv_entity ON public.email_deliverability_events(entity_id, event_type);

GRANT SELECT ON public.email_deliverability_events TO authenticated;
GRANT ALL ON public.email_deliverability_events TO service_role;

ALTER TABLE public.email_deliverability_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read email events"
  ON public.email_deliverability_events FOR SELECT TO authenticated USING (true);