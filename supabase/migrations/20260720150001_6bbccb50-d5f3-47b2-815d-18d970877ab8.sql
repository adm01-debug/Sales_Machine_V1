
-- Extend touchpoint status vocabulary (contact_touchpoints.status is TEXT, safe to extend semantics)

CREATE TABLE public.campaign_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns_orchestration(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES public.entity_map(id) ON DELETE CASCADE,
  current_step INT NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','paused')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, entity_id)
);

CREATE INDEX campaign_targets_next_run_idx ON public.campaign_targets(next_run_at) WHERE status = 'queued';
CREATE INDEX campaign_targets_campaign_idx ON public.campaign_targets(campaign_id);
CREATE INDEX campaign_targets_entity_idx ON public.campaign_targets(entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_targets TO authenticated;
GRANT ALL ON public.campaign_targets TO service_role;

ALTER TABLE public.campaign_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sm operators can read targets"
  ON public.campaign_targets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

CREATE POLICY "sm operators can write targets"
  ON public.campaign_targets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

CREATE TRIGGER tg_campaign_targets_touch
  BEFORE UPDATE ON public.campaign_targets
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Seed default cadence rule (idempotent)
INSERT INTO public.cadence_rules (name, description, is_active, steps)
SELECT
  'Default multichannel',
  'Cadência padrão: WhatsApp d0, Email d2, LinkedIn d4 (stub), SMS d7, Instagram d10 (stub)',
  true,
  '[
    {"day": 0, "channel": "whatsapp"},
    {"day": 2, "channel": "email"},
    {"day": 4, "channel": "linkedin"},
    {"day": 7, "channel": "sms"},
    {"day": 10, "channel": "instagram"}
  ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.cadence_rules WHERE name = 'Default multichannel');
