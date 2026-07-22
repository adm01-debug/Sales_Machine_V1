-- 014: SMS/RCS/MMS support
ALTER TYPE public.sm_channel ADD VALUE IF NOT EXISTS 'rcs';
ALTER TYPE public.sm_channel ADD VALUE IF NOT EXISTS 'mms';