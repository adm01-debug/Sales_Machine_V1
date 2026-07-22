-- Item 1: consent_ledger append-only + check_consent + unsubscribe token helpers

CREATE TABLE IF NOT EXISTS public.consent_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id UUID NOT NULL REFERENCES public.entity_map(id) ON DELETE CASCADE,
  channel sm_channel NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('opt_in','opt_out')),
  source TEXT NOT NULL CHECK (source IN ('stop_word','unsubscribe_link','manual','bounce','import','webhook')),
  reason TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_ledger_entity_channel ON public.consent_ledger(entity_id, channel, created_at DESC);

GRANT SELECT, INSERT ON public.consent_ledger TO authenticated;
GRANT ALL ON public.consent_ledger TO service_role;

ALTER TABLE public.consent_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read ledger"
  ON public.consent_ledger FOR SELECT TO authenticated USING (true);

CREATE POLICY "operators can insert ledger"
  ON public.consent_ledger FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

-- check_consent: last event for (entity, channel) decides. Default = opt_in.
CREATE OR REPLACE FUNCTION public.check_consent(_entity_id UUID, _channel sm_channel)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT status = 'opt_in'
       FROM public.consent_ledger
      WHERE entity_id = _entity_id AND channel = _channel
      ORDER BY created_at DESC
      LIMIT 1),
    TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_consent(UUID, sm_channel) TO authenticated, service_role;

-- Backfill: mark hard_bounce entities as opt_out for email
INSERT INTO public.consent_ledger(entity_id, channel, status, source, reason, evidence)
SELECT id, 'email'::sm_channel, 'opt_out', 'bounce', 'backfill: metadata.hard_bounce=true', jsonb_build_object('backfill', true)
FROM public.entity_map
WHERE (metadata->>'hard_bounce')::boolean IS TRUE
ON CONFLICT DO NOTHING;