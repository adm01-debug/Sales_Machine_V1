ALTER TABLE public.message_templates DROP CONSTRAINT IF EXISTS message_templates_channel_check;
ALTER TABLE public.message_templates DROP CONSTRAINT IF EXISTS message_templates_body_check;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS subject text;

ALTER TABLE public.message_templates
  ADD CONSTRAINT message_templates_channel_check
  CHECK (channel = ANY (ARRAY['whatsapp'::sm_channel,'email'::sm_channel,'sms'::sm_channel,'rcs'::sm_channel,'mms'::sm_channel,'linkedin'::sm_channel,'instagram'::sm_channel]));

ALTER TABLE public.message_templates
  ADD CONSTRAINT message_templates_body_check CHECK (char_length(body) <= 4000);

ALTER TABLE public.message_templates
  ADD CONSTRAINT message_templates_subject_check CHECK (subject IS NULL OR char_length(subject) <= 200);