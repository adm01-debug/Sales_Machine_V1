DROP POLICY "audiences_write" ON public.audiences;
DROP POLICY "audience_members_write" ON public.audience_members;
DROP POLICY "mkt_campaigns_write" ON public.marketing_campaigns;
DROP POLICY "campaign_variants_write" ON public.campaign_variants;
DROP POLICY "campaign_sends_write" ON public.campaign_sends;

CREATE POLICY "operators manage audiences" ON public.audiences FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));

CREATE POLICY "operators manage audience_members" ON public.audience_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));

CREATE POLICY "operators manage marketing_campaigns" ON public.marketing_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));

CREATE POLICY "operators manage campaign_variants" ON public.campaign_variants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));

CREATE POLICY "operators manage campaign_sends" ON public.campaign_sends FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));