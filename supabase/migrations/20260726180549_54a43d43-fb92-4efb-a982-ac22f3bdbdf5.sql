CREATE TABLE public.budget_reallocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID,
  moved_total_brl NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (moved_total_brl >= 0),
  total_before_brl NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_before_brl >= 0),
  total_after_brl NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_after_brl >= 0),
  channels_changed INTEGER NOT NULL DEFAULT 0 CHECK (channels_changed >= 0),
  transfers JSONB NOT NULL DEFAULT '[]'::jsonb,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  unmet JSONB NOT NULL DEFAULT '[]'::jsonb
);

GRANT SELECT, INSERT ON public.budget_reallocations TO authenticated;
GRANT ALL ON public.budget_reallocations TO service_role;

ALTER TABLE public.budget_reallocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_reallocations_read" ON public.budget_reallocations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "budget_reallocations_insert" ON public.budget_reallocations
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role))
    AND (actor_user_id IS NULL OR actor_user_id = auth.uid())
  );

CREATE INDEX budget_reallocations_applied_at_idx
  ON public.budget_reallocations (applied_at DESC);