CREATE TABLE public.lead_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  submit_label TEXT NOT NULL DEFAULT 'Enviar',
  success_message TEXT NOT NULL DEFAULT 'Recebemos seus dados. Obrigado!',
  consent_text TEXT NOT NULL DEFAULT 'Autorizo o contato comercial e o tratamento dos meus dados.',
  double_opt_in BOOLEAN NOT NULL DEFAULT true,
  confirm_ttl_hours INTEGER NOT NULL DEFAULT 48 CHECK (confirm_ttl_hours BETWEEN 1 AND 720),
  channel public.sm_channel NOT NULL DEFAULT 'email',
  journey_id UUID REFERENCES public.journeys(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  submission_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.lead_form_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES public.lead_forms(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES public.entity_map(id) ON DELETE SET NULL,
  email TEXT,
  phone TEXT,
  full_name TEXT,
  company_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','discarded')),
  confirm_token_hash TEXT UNIQUE,
  confirm_expires_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_forms_status ON public.lead_forms(status) WHERE status = 'published';
CREATE INDEX idx_lead_form_submissions_form ON public.lead_form_submissions(form_id, created_at DESC);
CREATE INDEX idx_lead_form_submissions_status ON public.lead_form_submissions(status, confirm_expires_at);
CREATE INDEX idx_lead_form_submissions_email ON public.lead_form_submissions(lower(email)) WHERE email IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_forms TO authenticated;
GRANT SELECT ON public.lead_forms TO anon;
GRANT ALL ON public.lead_forms TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_form_submissions TO authenticated;
GRANT ALL ON public.lead_form_submissions TO service_role;

ALTER TABLE public.lead_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_forms_public_read" ON public.lead_forms
  FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "lead_forms_read" ON public.lead_forms
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_forms_write" ON public.lead_forms
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role));

CREATE POLICY "lead_form_submissions_read" ON public.lead_form_submissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_form_submissions_write" ON public.lead_form_submissions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role));

CREATE TRIGGER trg_lead_forms_touch BEFORE UPDATE ON public.lead_forms
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_lead_form_submissions_touch BEFORE UPDATE ON public.lead_form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();