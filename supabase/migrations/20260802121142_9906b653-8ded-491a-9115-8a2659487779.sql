CREATE TYPE public.sm_compliance_niche AS ENUM ('geral','saude','financeiro','juridico','apostas','suplementos','custom');
CREATE TYPE public.sm_compliance_severity AS ENUM ('error','warning','info');

CREATE TABLE public.compliance_terms (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    term TEXT NOT NULL CHECK (btrim(term) <> '' AND length(term) <= 120),
    niche public.sm_compliance_niche NOT NULL DEFAULT 'custom',
    severity public.sm_compliance_severity NOT NULL DEFAULT 'warning',
    reason TEXT NOT NULL CHECK (btrim(reason) <> '' AND length(reason) <= 500),
    suggestion TEXT CHECK (suggestion IS NULL OR length(suggestion) <= 500),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_compliance_terms_owner_niche_term
    ON public.compliance_terms (created_by, niche, lower(btrim(term)));
CREATE INDEX idx_compliance_terms_created_by ON public.compliance_terms (created_by);
CREATE INDEX idx_compliance_terms_active ON public.compliance_terms (is_active) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_terms TO authenticated;
GRANT ALL ON public.compliance_terms TO service_role;

ALTER TABLE public.compliance_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their compliance terms"
    ON public.compliance_terms
    FOR ALL
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins can view all compliance terms"
    ON public.compliance_terms
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_compliance_terms_updated_at
    BEFORE UPDATE ON public.compliance_terms
    FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();