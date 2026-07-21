-- Attach state-machine triggers (functions already exist)
DROP TRIGGER IF EXISTS trg_log_target_state_change ON public.campaign_targets;
CREATE TRIGGER trg_log_target_state_change
  BEFORE INSERT OR UPDATE OF state ON public.campaign_targets
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_target_state_change();

DROP TRIGGER IF EXISTS trg_sync_target_status ON public.campaign_targets;
CREATE TRIGGER trg_sync_target_status
  BEFORE INSERT OR UPDATE OF state ON public.campaign_targets
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_target_status();

-- updated_at trigger on the same table if missing
DROP TRIGGER IF EXISTS trg_touch_campaign_targets ON public.campaign_targets;
CREATE TRIGGER trg_touch_campaign_targets
  BEFORE UPDATE ON public.campaign_targets
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();