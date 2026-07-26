DO $$
BEGIN
  PERFORM cron.unschedule('sm-tick-journeys');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sm-tick-journeys',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://project--c4a241c3-45be-40f8-862c-f2e559cf55fe.lovable.app/api/public/hooks/tick-journeys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3a2FqeXliY3d2aWRldXN1dHNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MzA2NzQsImV4cCI6MjEwMDEwNjY3NH0.rpRE76FBZzLrnqZnFTGeGXUmdkaIC4nDgBGoT2m7mN4'
    ),
    body := '{}'::jsonb
  )$$
);