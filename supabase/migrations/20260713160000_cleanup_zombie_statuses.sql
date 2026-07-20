DELETE FROM public.status_transitions WHERE from_status = 'DRAFT' OR to_status = 'DRAFT'; 
UPDATE public.orders SET status = 'MEASUREMENT_SCHEDULING' WHERE status = 'DRAFT';
