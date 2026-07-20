-- 20260702153000_fix_status_overload.sql

BEGIN;

-- Drop the old 3-arg version from 06_state_machine to fix "is not unique" ambiguity
DROP FUNCTION IF EXISTS public.change_order_status(uuid, text, text);

COMMIT;
