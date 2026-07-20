-- 20260702150000_enable_realtime.sql

BEGIN;
  -- Remove the tables if they are already in the publication to avoid errors
  -- and then add them
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.measurement_tasks;
COMMIT;
