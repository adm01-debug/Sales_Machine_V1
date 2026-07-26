-- Operators need to write their own audit trail entries when they manually
-- requeue dead-letter targets. The WITH CHECK pins the actor to the caller's
-- own uid, so nobody can forge a 'system' or third-party authored event.
GRANT INSERT ON public.campaign_target_events TO authenticated;

CREATE POLICY "operators log their own manual interventions"
  ON public.campaign_target_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
    AND actor = 'operator:' || auth.uid()::text
  );