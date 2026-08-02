
-- Tabela para armazenar scores de churn calculados pela IA
CREATE TABLE IF NOT EXISTS public.contact_churn_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES public.campaign_targets(id) ON DELETE CASCADE,
    risk_score DECIMAL(5, 2) NOT NULL, -- 0.00 a 100.00
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    reasoning TEXT, -- Explicação da IA para o score
    metadata JSONB DEFAULT '{}'::jsonb,
    calculated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Grants
GRANT SELECT ON public.contact_churn_scores TO authenticated;
GRANT ALL ON public.contact_churn_scores TO service_role;

-- RLS
ALTER TABLE public.contact_churn_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select churn scores"
ON public.contact_churn_scores FOR SELECT
TO authenticated
USING (true);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_churn_contact_id ON public.contact_churn_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_churn_risk_level ON public.contact_churn_scores(risk_level);

-- Função placeholder para cálculo de risco (será alimentada via Edge Function/IA)
CREATE OR REPLACE FUNCTION public.fn_calculate_churn_risk(_contact_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    last_touch TIMESTAMPTZ;
    open_count INTEGER;
    inbound_count INTEGER;
    calculated_risk DECIMAL(5, 2) := 0;
    v_risk_level TEXT := 'low';
BEGIN
    -- Busca dados básicos para o score inicial
    SELECT MAX(created_at) INTO last_touch FROM public.contact_touchpoints WHERE contact_id = _contact_id;
    SELECT COUNT(*) INTO open_count FROM public.email_deliverability_events e 
    JOIN public.contact_touchpoints t ON e.touchpoint_id = t.id 
    WHERE t.contact_id = _contact_id AND e.event_type = 'opened';
    
    -- Lógica heurística simples antes da IA assumir
    IF last_touch IS NULL OR last_touch < now() - INTERVAL '30 days' THEN
        calculated_risk := calculated_risk + 40;
    END IF;
    
    IF open_count = 0 THEN
        calculated_risk := calculated_risk + 30;
    END IF;
    
    -- Determina nível
    IF calculated_risk > 70 THEN v_risk_level := 'high';
    ELSIF calculated_risk > 40 THEN v_risk_level := 'medium';
    ELSE v_risk_level := 'low';
    END IF;

    INSERT INTO public.contact_churn_scores (contact_id, risk_score, risk_level, reasoning)
    VALUES (_contact_id, calculated_risk, v_risk_level, 'Cálculo heurístico inicial baseado em inatividade.')
    ON CONFLICT (contact_id) DO UPDATE SET
        risk_score = EXCLUDED.risk_score,
        risk_level = EXCLUDED.risk_level,
        reasoning = EXCLUDED.reasoning,
        calculated_at = now();
END;
$$;
