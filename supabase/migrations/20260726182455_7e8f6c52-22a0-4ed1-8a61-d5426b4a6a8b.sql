CREATE TYPE public.sm_journey_status AS ENUM ('draft','active','paused','archived');
CREATE TYPE public.sm_journey_node_kind AS ENUM ('trigger','send','wait','condition','split','goal','exit');
CREATE TYPE public.sm_enrollment_state AS ENUM ('active','waiting','completed','exited','goal_reached','failed');

CREATE TABLE public.journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  status public.sm_journey_status NOT NULL DEFAULT 'draft',
  entry_daily_cap integer NOT NULL DEFAULT 200 CHECK (entry_daily_cap >= 0),
  send_window_start smallint NOT NULL DEFAULT 9 CHECK (send_window_start BETWEEN 0 AND 23),
  send_window_end smallint NOT NULL DEFAULT 19 CHECK (send_window_end BETWEEN 0 AND 24),
  requires_human_approval boolean NOT NULL DEFAULT false,
  allow_reentry boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journeys TO authenticated;
GRANT ALL ON public.journeys TO service_role;
ALTER TABLE public.journeys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journeys_read" ON public.journeys FOR SELECT TO authenticated USING (true);
CREATE POLICY "journeys_write" ON public.journeys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE TRIGGER journeys_touch BEFORE UPDATE ON public.journeys
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.journey_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  kind public.sm_journey_node_kind NOT NULL,
  label text NOT NULL DEFAULT '',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  position_x integer NOT NULL DEFAULT 0,
  position_y integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journey_nodes_journey_idx ON public.journey_nodes(journey_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journey_nodes TO authenticated;
GRANT ALL ON public.journey_nodes TO service_role;
ALTER TABLE public.journey_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journey_nodes_read" ON public.journey_nodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "journey_nodes_write" ON public.journey_nodes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE TRIGGER journey_nodes_touch BEFORE UPDATE ON public.journey_nodes
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.journey_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  from_node_id uuid NOT NULL REFERENCES public.journey_nodes(id) ON DELETE CASCADE,
  to_node_id uuid NOT NULL REFERENCES public.journey_nodes(id) ON DELETE CASCADE,
  branch text NOT NULL DEFAULT 'default',
  ordinal smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_node_id <> to_node_id),
  UNIQUE (from_node_id, to_node_id, branch)
);
CREATE INDEX journey_edges_journey_idx ON public.journey_edges(journey_id);
CREATE INDEX journey_edges_from_idx ON public.journey_edges(from_node_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journey_edges TO authenticated;
GRANT ALL ON public.journey_edges TO service_role;
ALTER TABLE public.journey_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journey_edges_read" ON public.journey_edges FOR SELECT TO authenticated USING (true);
CREATE POLICY "journey_edges_write" ON public.journey_edges FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));

CREATE TABLE public.journey_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.entity_map(id) ON DELETE CASCADE,
  current_node_id uuid REFERENCES public.journey_nodes(id) ON DELETE SET NULL,
  state public.sm_enrollment_state NOT NULL DEFAULT 'active',
  next_run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  entered_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX journey_enrollments_active_uniq
  ON public.journey_enrollments(journey_id, entity_id)
  WHERE state IN ('active','waiting');
CREATE INDEX journey_enrollments_due_idx
  ON public.journey_enrollments(next_run_at)
  WHERE state IN ('active','waiting');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journey_enrollments TO authenticated;
GRANT ALL ON public.journey_enrollments TO service_role;
ALTER TABLE public.journey_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journey_enrollments_read" ON public.journey_enrollments FOR SELECT TO authenticated USING (true);
CREATE POLICY "journey_enrollments_write" ON public.journey_enrollments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE TRIGGER journey_enrollments_touch BEFORE UPDATE ON public.journey_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.journey_enrollment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.journey_enrollments(id) ON DELETE CASCADE,
  node_id uuid REFERENCES public.journey_nodes(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journey_enrollment_events_enrollment_idx
  ON public.journey_enrollment_events(enrollment_id, created_at DESC);
GRANT SELECT ON public.journey_enrollment_events TO authenticated;
GRANT ALL ON public.journey_enrollment_events TO service_role;
ALTER TABLE public.journey_enrollment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "journey_enrollment_events_read" ON public.journey_enrollment_events
  FOR SELECT TO authenticated USING (true);