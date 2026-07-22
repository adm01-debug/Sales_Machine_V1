CREATE OR REPLACE FUNCTION public.check_consent(_entity_id UUID, _channel sm_channel)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT status = 'opt_in'
       FROM public.consent_ledger
      WHERE entity_id = _entity_id AND channel = _channel
      ORDER BY created_at DESC
      LIMIT 1),
    TRUE
  );
$$;