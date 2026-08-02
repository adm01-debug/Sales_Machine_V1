
-- Tabela para rastrear o ROI por canal cruzando gastos e conversões
CREATE TABLE IF NOT EXISTS public.channel_roi_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel public.sm_channel NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_spent_brl DECIMAL(12, 4) NOT NULL DEFAULT 0,
    total_messages_sent INTEGER NOT NULL DEFAULT 0,
    total_conversions INTEGER NOT NULL DEFAULT 0,
    cac_brl DECIMAL(12, 4) GENERATED ALWAYS AS (
        CASE WHEN total_conversions > 0 THEN total_spent_brl / total_conversions ELSE NULL END
    ) STORED,
    conversion_rate DECIMAL(5, 2) GENERATED ALWAYS AS (
        CASE WHEN total_messages_sent > 0 THEN (total_conversions::DECIMAL / total_messages_sent) * 100 ELSE 0 END
    ) STORED,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(channel, date)
);

-- Grants
GRANT SELECT ON public.channel_roi_stats TO authenticated;
GRANT ALL ON public.channel_roi_stats TO service_role;

-- RLS
ALTER TABLE public.channel_roi_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select ROI stats"
ON public.channel_roi_stats FOR SELECT
TO authenticated
USING (true);

-- Função para atualizar as estatísticas de ROI (pode ser chamada via cron ou trigger)
CREATE OR REPLACE FUNCTION public.fn_refresh_roi_stats(_days INTEGER DEFAULT 7)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.channel_roi_stats (channel, date, total_spent_brl, total_messages_sent, total_conversions)
    SELECT 
        t.channel,
        t.created_at::DATE as date,
        -- Cálculo de gasto simplificado baseado no DEFAULT_UNIT_COST_BRL do app
        SUM(
            CASE 
                WHEN t.channel = 'whatsapp' THEN 0.3
                WHEN t.channel = 'sms' THEN 0.12
                WHEN t.channel = 'mms' THEN 0.45
                WHEN t.channel = 'rcs' THEN 0.18
                WHEN t.channel = 'email' THEN 0.0008
                WHEN t.channel = 'linkedin' THEN 0.35
                WHEN t.channel = 'instagram' THEN 0.2
                ELSE 0
            END
        ) as total_spent,
        COUNT(*) as total_sent,
        -- Conversões: eventos vindos do Fuxico no v_contact_profiles (simplificado)
        (
            SELECT COUNT(*) 
            FROM public.sales_machine_events e 
            WHERE e.source = 'fuxico' 
              AND e.event_type = 'conversion' 
              AND e.received_at::DATE = t.created_at::DATE
        ) as conversions
    FROM public.contact_touchpoints t
    WHERE t.direction = 'outbound'
      AND t.status IN ('sent', 'delivered', 'read', 'replied')
      AND t.created_at >= now() - (_days || ' days')::INTERVAL
    GROUP BY t.channel, date
    ON CONFLICT (channel, date) DO UPDATE SET
        total_spent_brl = EXCLUDED.total_spent_brl,
        total_messages_sent = EXCLUDED.total_messages_sent,
        total_conversions = EXCLUDED.total_conversions,
        updated_at = now();
END;
$$;
