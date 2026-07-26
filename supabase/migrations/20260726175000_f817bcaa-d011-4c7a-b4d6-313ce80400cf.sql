DROP POLICY IF EXISTS "channel_budgets_update" ON public.channel_budgets;

CREATE POLICY "channel_budgets_update" ON public.channel_budgets
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));