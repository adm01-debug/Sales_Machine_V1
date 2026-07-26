CREATE TABLE public.channel_budgets (
  channel TEXT PRIMARY KEY,
  daily_limit_brl NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (daily_limit_brl >= 0),
  monthly_limit_brl NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_limit_brl >= 0),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.channel_budgets TO authenticated;
GRANT ALL ON public.channel_budgets TO service_role;

ALTER TABLE public.channel_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_budgets_read" ON public.channel_budgets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "channel_budgets_update" ON public.channel_budgets
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "channel_budgets_admin_write" ON public.channel_budgets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tg_channel_budgets_touch
  BEFORE UPDATE ON public.channel_budgets
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

INSERT INTO public.channel_budgets (channel, daily_limit_brl, monthly_limit_brl, note) VALUES
  ('whatsapp', 300.00, 6000.00, 'Custo unitário estimado R$ 0,30'),
  ('sms',      150.00, 3000.00, 'Custo por segmento R$ 0,12'),
  ('mms',       80.00, 1600.00, 'Custo unitário estimado R$ 0,45'),
  ('rcs',      100.00, 2000.00, 'Custo unitário estimado R$ 0,18'),
  ('email',     30.00,  600.00, 'Custo unitário estimado R$ 0,0008'),
  ('linkedin', 200.00, 4000.00, 'Custo unitário estimado R$ 0,35'),
  ('instagram',120.00, 2400.00, 'Custo unitário estimado R$ 0,20');

CREATE INDEX idx_contact_touchpoints_outbound_day
  ON public.contact_touchpoints (created_at DESC, channel)
  WHERE direction = 'outbound';