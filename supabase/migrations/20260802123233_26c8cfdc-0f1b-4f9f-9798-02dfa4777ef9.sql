CREATE TABLE public.compliance_violations_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    niche text NOT NULL,
    term text NOT NULL,
    severity text NOT NULL,
    reason text NOT NULL,
    text_snapshot text NOT NULL,
    action text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT ON public.compliance_violations_log TO authenticated;
GRANT ALL ON public.compliance_violations_log TO service_role;

-- RLS
ALTER TABLE public.compliance_violations_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own compliance logs"
ON public.compliance_violations_log
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own compliance logs"
ON public.compliance_violations_log
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_compliance_violations_user_id ON public.compliance_violations_log(user_id);
CREATE INDEX idx_compliance_violations_campaign_id ON public.compliance_violations_log(campaign_id);