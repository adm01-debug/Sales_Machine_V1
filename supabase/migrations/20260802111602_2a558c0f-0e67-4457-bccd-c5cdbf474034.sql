CREATE TABLE public.template_preflight_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES public.message_templates(id) ON DELETE CASCADE NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    findings JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_by UUID REFERENCES auth.users(id)
);

GRANT SELECT, INSERT ON public.template_preflight_history TO authenticated;
GRANT ALL ON public.template_preflight_history TO service_role;

ALTER TABLE public.template_preflight_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view history of their own templates"
    ON public.template_preflight_history
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.message_templates
            WHERE id = template_preflight_history.template_id
              AND created_by = auth.uid()
        )
    );

CREATE POLICY "Users can insert history for their own templates"
    ON public.template_preflight_history
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.message_templates
            WHERE id = template_preflight_history.template_id
              AND created_by = auth.uid()
        )
    );

CREATE INDEX idx_template_preflight_history_template_id ON public.template_preflight_history(template_id);
CREATE INDEX idx_template_preflight_history_created_at ON public.template_preflight_history(created_at);