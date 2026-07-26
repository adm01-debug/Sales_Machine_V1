CREATE TABLE public.ops_alert_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('critical','warning')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  first_notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  occurrences INTEGER NOT NULL DEFAULT 1,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um alerta ativo por identificador; resolvidos viram histórico.
CREATE UNIQUE INDEX ops_alert_notifications_active_uidx
  ON public.ops_alert_notifications (alert_id)
  WHERE resolved_at IS NULL;

CREATE INDEX ops_alert_notifications_recent_idx
  ON public.ops_alert_notifications (last_notified_at DESC);

GRANT SELECT ON public.ops_alert_notifications TO authenticated;
GRANT ALL ON public.ops_alert_notifications TO service_role;

ALTER TABLE public.ops_alert_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem alertas"
  ON public.ops_alert_notifications
  FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_ops_alert_notifications_touch
  BEFORE UPDATE ON public.ops_alert_notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();