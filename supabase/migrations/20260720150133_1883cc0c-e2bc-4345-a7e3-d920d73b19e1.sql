
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sm_touchpoint_status') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum WHERE enumlabel = 'pending_provider'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sm_touchpoint_status')
    ) THEN
      ALTER TYPE public.sm_touchpoint_status ADD VALUE 'pending_provider';
    END IF;
  END IF;
END $$;
