-- 1) Um tracking_id não pode pertencer a dois envios distintos.
DROP INDEX IF EXISTS public.contact_touchpoints_fuxico_tracking_id_idx;
CREATE UNIQUE INDEX contact_touchpoints_fuxico_tracking_id_key
  ON public.contact_touchpoints (fuxico_tracking_id)
  WHERE fuxico_tracking_id IS NOT NULL;

-- 2) Idempotência do webhook deve ser por provedor, não global.
--    O índice global impediria que dois provedores usassem o mesmo external_id.
DROP INDEX IF EXISTS public.email_deliverability_events_external_id_key;

-- 3) Auditoria de duplicidade por (touchpoint, tipo, data).
CREATE INDEX IF NOT EXISTS idx_email_deliv_audit
  ON public.email_deliverability_events (touchpoint_id, event_type, created_at DESC)
  WHERE touchpoint_id IS NOT NULL;