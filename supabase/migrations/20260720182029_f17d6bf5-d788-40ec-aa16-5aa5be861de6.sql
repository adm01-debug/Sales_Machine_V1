
-- Item 5: account cooldown (usa metadata->>'lux_company_id')
ALTER TABLE public.campaigns_orchestration
  ADD COLUMN account_cooldown_hours integer NOT NULL DEFAULT 48;

CREATE OR REPLACE FUNCTION public.has_recent_account_touchpoint(_entity_id uuid, _hours integer)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contact_touchpoints t
    JOIN public.entity_map em1 ON em1.id = t.entity_id
    JOIN public.entity_map em2 ON em2.id = _entity_id
    WHERE t.direction = 'outbound'
      AND t.created_at > now() - make_interval(hours => _hours)
      AND em1.metadata ? 'lux_company_id'
      AND em2.metadata ? 'lux_company_id'
      AND (em1.metadata->>'lux_company_id') = (em2.metadata->>'lux_company_id')
      AND t.entity_id <> _entity_id
  );
$$;

-- Item 6: sender health
CREATE TABLE public.sender_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id text NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  sent integer NOT NULL DEFAULT 0,
  bounced integer NOT NULL DEFAULT 0,
  replied integer NOT NULL DEFAULT 0,
  spam_reports integer NOT NULL DEFAULT 0,
  daily_cap integer NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sender_id, day)
);
GRANT SELECT, INSERT, UPDATE ON public.sender_health TO authenticated;
GRANT ALL ON public.sender_health TO service_role;
ALTER TABLE public.sender_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sender_health readable by roles" ON public.sender_health
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE POLICY "sender_health writable by admins" ON public.sender_health
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.compute_daily_cap(_sender_id text)
RETURNS integer LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  days_active integer;
  bounce_rate numeric;
BEGIN
  SELECT count(*) INTO days_active FROM public.sender_health WHERE sender_id = _sender_id AND sent > 0;
  SELECT COALESCE(sum(bounced)::numeric / NULLIF(sum(sent),0), 0)
    INTO bounce_rate FROM public.sender_health
    WHERE sender_id = _sender_id AND day > CURRENT_DATE - 7;
  IF bounce_rate > 0.05 THEN RETURN 50; END IF;
  RETURN LEAST(50 + (days_active * 10), 500);
END;
$$;

-- Item 8: signal scoring
CREATE TABLE public.signal_weights (
  event_type text PRIMARY KEY,
  weight numeric NOT NULL DEFAULT 10,
  half_life_hours integer NOT NULL DEFAULT 72,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.signal_weights TO authenticated;
GRANT ALL ON public.signal_weights TO service_role;
ALTER TABLE public.signal_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signal_weights readable" ON public.signal_weights
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "signal_weights writable by admins" ON public.signal_weights
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.signal_weights(event_type, weight, half_life_hours) VALUES
  ('reply', 100, 24),
  ('click', 25, 72),
  ('open', 10, 48),
  ('meeting_booked', 200, 168),
  ('opted_out', -500, 8760),
  ('bounced', -20, 168),
  ('enriched', 5, 336),
  ('discovered', 3, 336);

CREATE OR REPLACE FUNCTION public.signal_score(_entity_id uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(SUM(
    w.weight * exp(-ln(2) * EXTRACT(EPOCH FROM (now() - e.received_at)) / (w.half_life_hours * 3600.0))
  ), 0)::numeric
  FROM public.sales_machine_events e
  JOIN public.signal_weights w ON w.event_type = e.event_type
  JOIN public.entity_map em ON em.id = _entity_id
  WHERE (e.payload ->> 'entity_id') = em.id::text
     OR (em.singu_id IS NOT NULL AND (e.payload ->> 'contact_id') = em.singu_id)
     OR (em.lux_id IS NOT NULL AND (e.payload ->> 'company_id') = em.lux_id);
$$;

-- Item 9: agent evals
CREATE TABLE public.agent_eval_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  signal_json jsonb NOT NULL,
  expected_intent text NOT NULL,
  expected_channel public.sm_channel,
  notes text,
  agent_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_eval_cases TO authenticated;
GRANT ALL ON public.agent_eval_cases TO service_role;
ALTER TABLE public.agent_eval_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eval cases readable by roles" ON public.agent_eval_cases
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE POLICY "eval cases writable by admins" ON public.agent_eval_cases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.agent_eval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.agent_eval_cases(id) ON DELETE CASCADE,
  passed boolean NOT NULL,
  actual_output jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms integer,
  error text,
  ran_by uuid REFERENCES auth.users(id),
  ran_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agent_eval_runs TO authenticated;
GRANT ALL ON public.agent_eval_runs TO service_role;
ALTER TABLE public.agent_eval_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eval runs readable by roles" ON public.agent_eval_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));
CREATE POLICY "eval runs writable by admins" ON public.agent_eval_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.agent_eval_cases(name, signal_json, expected_intent, expected_channel, notes) VALUES
  ('Reply positivo em WhatsApp', '{"last_event":"reply","sentiment":"positive","channel":"whatsapp"}'::jsonb, 'schedule_meeting', 'whatsapp', 'Deve propor agendamento'),
  ('Reply negativo pedindo remoção', '{"last_event":"reply","sentiment":"negative","content":"não tenho interesse"}'::jsonb, 'opt_out', NULL, 'Deve encerrar cadência'),
  ('Sem resposta após 3 tentativas', '{"attempts":3,"last_event":"sent"}'::jsonb, 'switch_channel', 'email', 'Deve trocar de canal'),
  ('Decisor abriu email 3x', '{"opens":3,"clicks":0}'::jsonb, 'follow_up_soft', 'whatsapp', 'Reforçar sem ser insistente'),
  ('Empresa mudou stack', '{"trigger":"tech_stack_change","new_stack":"salesforce"}'::jsonb, 'contextual_pitch', 'email', 'Referenciar mudança'),
  ('Contato marcou reunião', '{"last_event":"meeting_booked"}'::jsonb, 'send_calendar_confirmation', 'email', 'Enviar confirmação'),
  ('Bounce persistente no email', '{"bounces":3}'::jsonb, 'switch_channel', 'whatsapp', 'Não insistir no email'),
  ('Cadência standard passo 2 sem sinal', '{"step":2,"preset":"standard"}'::jsonb, 'follow_up_value', 'email', 'Mensagem de valor'),
  ('LinkedIn stub sem provider', '{"channel":"linkedin","provider":"stub"}'::jsonb, 'queue_pending_provider', 'linkedin', 'Marcar pendente'),
  ('Opt-out anterior registrado', '{"prior_opt_out":true}'::jsonb, 'do_not_contact', NULL, 'Nunca reengajar');

-- Item 10: email threading
ALTER TABLE public.contact_touchpoints
  ADD COLUMN email_message_id text,
  ADD COLUMN email_in_reply_to text,
  ADD COLUMN email_references text[];
CREATE INDEX IF NOT EXISTS idx_touchpoints_email_message_id
  ON public.contact_touchpoints(email_message_id)
  WHERE email_message_id IS NOT NULL;
