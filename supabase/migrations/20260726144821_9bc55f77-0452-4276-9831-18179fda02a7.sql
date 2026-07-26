-- ============ AUDIENCES ============
CREATE TABLE public.audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  member_count integer NOT NULL DEFAULT 0,
  last_refreshed_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audiences TO authenticated;
GRANT ALL ON public.audiences TO service_role;
ALTER TABLE public.audiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audiences_read" ON public.audiences FOR SELECT TO authenticated USING (true);
CREATE POLICY "audiences_write" ON public.audiences FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.audience_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id uuid NOT NULL REFERENCES public.audiences(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.entity_map(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audience_id, entity_id)
);
CREATE INDEX idx_audience_members_audience ON public.audience_members(audience_id);
CREATE INDEX idx_audience_members_entity ON public.audience_members(entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audience_members TO authenticated;
GRANT ALL ON public.audience_members TO service_role;
ALTER TABLE public.audience_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audience_members_read" ON public.audience_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "audience_members_write" ON public.audience_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ MARKETING CAMPAIGNS ============
CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  objective text NOT NULL DEFAULT 'awareness'
    CHECK (objective IN ('awareness','engagement','conversion','reactivation','announcement')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','running','paused','completed','cancelled')),
  channel public.sm_channel NOT NULL,
  audience_id uuid REFERENCES public.audiences(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  send_window_start time,
  send_window_end time,
  daily_cap integer NOT NULL DEFAULT 500,
  requires_human_approval boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mkt_campaigns_status ON public.marketing_campaigns(status, scheduled_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_campaigns_read" ON public.marketing_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt_campaigns_write" ON public.marketing_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.campaign_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'A',
  subject text,
  body text NOT NULL,
  media_url text,
  rcs_payload jsonb,
  split_percent integer NOT NULL DEFAULT 100 CHECK (split_percent BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, label)
);
CREATE INDEX idx_campaign_variants_campaign ON public.campaign_variants(campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_variants TO authenticated;
GRANT ALL ON public.campaign_variants TO service_role;
ALTER TABLE public.campaign_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_variants_read" ON public.campaign_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "campaign_variants_write" ON public.campaign_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.campaign_variants(id) ON DELETE SET NULL,
  entity_id uuid NOT NULL REFERENCES public.entity_map(id) ON DELETE CASCADE,
  touchpoint_id uuid REFERENCES public.contact_touchpoints(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued','pending_approval','sending','sent','failed','skipped','opted_out','dead_letter')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, entity_id)
);
CREATE INDEX idx_campaign_sends_due ON public.campaign_sends(state, next_run_at);
CREATE INDEX idx_campaign_sends_campaign ON public.campaign_sends(campaign_id);
CREATE INDEX idx_campaign_sends_entity ON public.campaign_sends(entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_sends TO authenticated;
GRANT ALL ON public.campaign_sends TO service_role;
ALTER TABLE public.campaign_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_sends_read" ON public.campaign_sends FOR SELECT TO authenticated USING (true);
CREATE POLICY "campaign_sends_write" ON public.campaign_sends FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ TRIGGERS updated_at ============
CREATE TRIGGER trg_audiences_touch BEFORE UPDATE ON public.audiences
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_mkt_campaigns_touch BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_campaign_variants_touch BEFORE UPDATE ON public.campaign_variants
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_campaign_sends_touch BEFORE UPDATE ON public.campaign_sends
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ VIEW 360 ============
CREATE OR REPLACE VIEW public.v_contact_profiles
WITH (security_invoker = true) AS
SELECT
  em.id AS entity_id,
  em.kind,
  em.display_name,
  em.lux_id,
  em.singu_id,
  em.fatorx_thread_id,
  em.metadata,
  em.created_at,
  public.signal_score(em.id) AS signal_score,
  (SELECT count(*) FROM public.contact_touchpoints t WHERE t.entity_id = em.id) AS touchpoint_count,
  (SELECT count(*) FROM public.contact_touchpoints t WHERE t.entity_id = em.id AND t.direction = 'inbound') AS inbound_count,
  (SELECT max(t.created_at) FROM public.contact_touchpoints t WHERE t.entity_id = em.id) AS last_touch_at,
  (SELECT count(*) FROM public.audience_members am WHERE am.entity_id = em.id) AS audience_count,
  COALESCE((
    SELECT jsonb_object_agg(c.channel, c.status)
    FROM (
      SELECT DISTINCT ON (cl.channel) cl.channel, cl.status
      FROM public.consent_ledger cl
      WHERE cl.entity_id = em.id
      ORDER BY cl.channel, cl.created_at DESC
    ) c
  ), '{}'::jsonb) AS consent_by_channel
FROM public.entity_map em;

GRANT SELECT ON public.v_contact_profiles TO authenticated;
GRANT SELECT ON public.v_contact_profiles TO service_role;