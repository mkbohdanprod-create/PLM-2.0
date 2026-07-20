-- Add missing macro_stage column to order_activities
ALTER TABLE public.order_activities ADD COLUMN IF NOT EXISTS macro_stage text;
