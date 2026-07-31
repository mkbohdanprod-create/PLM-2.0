ALTER TABLE public.pause_reasons DROP COLUMN IF EXISTS default_days;
UPDATE public.orders SET status = 'MEASUREMENT_SCHEDULING' WHERE status IN ('MEASUREMENT_SCHEDULED', 'MEASUREMENT_PRE_SCHEDULED') AND NOT EXISTS (SELECT 1 FROM public.measurement_tasks WHERE order_id = public.orders.id AND outcome IN ('SCHEDULED', 'IN_PROGRESS'));
