-- 20260702183000_allow_unassigned_tasks.sql

BEGIN;

-- Allow unassigned measurement tasks (putting them in the grid without a specific measurer)
ALTER TABLE public.measurement_tasks ALTER COLUMN measurer_id DROP NOT NULL;

COMMIT;
