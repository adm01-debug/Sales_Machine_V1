
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'operator', 'viewer');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ ENUMS ============
CREATE TYPE public.sm_source AS ENUM ('lux','singu','fatorx','manual');
CREATE TYPE public.sm_channel AS ENUM ('linkedin','whatsapp','email','sms','instagram');
CREATE TYPE public.sm_event_status AS ENUM ('received','processing','processed','error','ignored');
CREATE TYPE public.sm_direction AS ENUM ('outbound','inbound');
CREATE TYPE public.sm_campaign_status AS ENUM ('draft','active','paused','archived');
CREATE TYPE public.sm_touchpoint_status AS ENUM ('queued','sent','delivered','read','replied','failed','opted_out');

-- ============ sales_machine_events (audit + replay) ============
CREATE TABLE public.sales_machine_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source public.sm_source NOT NULL,
  event_type TEXT NOT NULL,
  external_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.sm_event_status NOT NULL DEFAULT 'received',
  error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX idx_sm_events_source_type ON public.sales_machine_events (source, event_type, received_at DESC);
CREATE INDEX idx_sm_events_status ON public.sales_machine_events (status) WHERE status <> 'processed';
GRANT SELECT ON public.sales_machine_events TO authenticated;
GRANT ALL ON public.sales_machine_events TO service_role;
ALTER TABLE public.sales_machine_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read events" ON public.sales_machine_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ entity_map (lux ↔ singu ↔ fatorx) ============
CREATE TABLE public.entity_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('company','contact')),
  display_name TEXT,
  lux_id TEXT,
  singu_id TEXT,
  fatorx_thread_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_entity_map_lux ON public.entity_map (kind, lux_id) WHERE lux_id IS NOT NULL;
CREATE UNIQUE INDEX uq_entity_map_singu ON public.entity_map (kind, singu_id) WHERE singu_id IS NOT NULL;
CREATE UNIQUE INDEX uq_entity_map_thread ON public.entity_map (fatorx_thread_id) WHERE fatorx_thread_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON public.entity_map TO authenticated;
GRANT ALL ON public.entity_map TO service_role;
ALTER TABLE public.entity_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read entity_map" ON public.entity_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "operators write entity_map" ON public.entity_map FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE POLICY "operators update entity_map" ON public.entity_map FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE TRIGGER trg_entity_map_touch BEFORE UPDATE ON public.entity_map
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ cadence_rules ============
CREATE TABLE public.cadence_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadence_rules TO authenticated;
GRANT ALL ON public.cadence_rules TO service_role;
ALTER TABLE public.cadence_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read cadence" ON public.cadence_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "operators manage cadence" ON public.cadence_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE TRIGGER trg_cadence_rules_touch BEFORE UPDATE ON public.cadence_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ campaigns_orchestration ============
CREATE TABLE public.campaigns_orchestration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icp_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  channels public.sm_channel[] NOT NULL DEFAULT '{}',
  fatorx_agent_id TEXT,
  cadence_rule_id UUID REFERENCES public.cadence_rules(id) ON DELETE SET NULL,
  status public.sm_campaign_status NOT NULL DEFAULT 'draft',
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requires_human_approval BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaigns_status ON public.campaigns_orchestration (status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns_orchestration TO authenticated;
GRANT ALL ON public.campaigns_orchestration TO service_role;
ALTER TABLE public.campaigns_orchestration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read campaigns" ON public.campaigns_orchestration FOR SELECT TO authenticated USING (true);
CREATE POLICY "operators manage campaigns" ON public.campaigns_orchestration FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE TRIGGER trg_campaigns_touch BEFORE UPDATE ON public.campaigns_orchestration
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ channel_quotas ============
CREATE TABLE public.channel_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel public.sm_channel NOT NULL,
  daily_cap INTEGER NOT NULL DEFAULT 50 CHECK (daily_cap >= 0),
  current_count INTEGER NOT NULL DEFAULT 0 CHECK (current_count >= 0),
  reset_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('day', now()) + interval '1 day'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel)
);
GRANT SELECT, INSERT, UPDATE ON public.channel_quotas TO authenticated;
GRANT ALL ON public.channel_quotas TO service_role;
ALTER TABLE public.channel_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own quotas" ON public.channel_quotas FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users update own quotas" ON public.channel_quotas FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users insert own quotas" ON public.channel_quotas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_quotas_touch BEFORE UPDATE ON public.channel_quotas
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ contact_touchpoints (mirror para dashboards) ============
CREATE TABLE public.contact_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entity_map(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns_orchestration(id) ON DELETE SET NULL,
  channel public.sm_channel NOT NULL,
  direction public.sm_direction NOT NULL,
  status public.sm_touchpoint_status NOT NULL DEFAULT 'queued',
  fatorx_thread_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  singu_interaction_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_touchpoints_entity ON public.contact_touchpoints (entity_id, created_at DESC);
CREATE INDEX idx_touchpoints_status ON public.contact_touchpoints (status);
CREATE INDEX idx_touchpoints_campaign ON public.contact_touchpoints (campaign_id) WHERE campaign_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON public.contact_touchpoints TO authenticated;
GRANT ALL ON public.contact_touchpoints TO service_role;
ALTER TABLE public.contact_touchpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read touchpoints" ON public.contact_touchpoints FOR SELECT TO authenticated USING (true);
CREATE POLICY "operators write touchpoints" ON public.contact_touchpoints FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE POLICY "operators update touchpoints" ON public.contact_touchpoints FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE TRIGGER trg_touchpoints_touch BEFORE UPDATE ON public.contact_touchpoints
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ profile trigger: primeiro user vira admin ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operator');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
