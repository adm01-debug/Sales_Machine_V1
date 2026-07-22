CREATE TABLE public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel public.sm_channel NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) <= 1000),
  media_url TEXT,
  rcs_payload JSONB,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_templates_channel_check
    CHECK (channel IN ('sms','rcs','mms'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own templates" ON public.message_templates
  FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "users insert own templates" ON public.message_templates
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "users update own templates" ON public.message_templates
  FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "users delete own templates" ON public.message_templates
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

CREATE TRIGGER trg_message_templates_touch
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE INDEX idx_message_templates_created_by ON public.message_templates(created_by);
CREATE INDEX idx_message_templates_channel ON public.message_templates(channel) WHERE archived = false;