-- Fix order_activities foreign keys to point to public.profiles instead of auth.users
-- This is required for PostgREST to be able to join and select 'author:created_by(id, full_name)'

ALTER TABLE public.order_activities
  DROP CONSTRAINT IF EXISTS order_activities_created_by_fkey,
  DROP CONSTRAINT IF EXISTS order_activities_completed_by_fkey;

ALTER TABLE public.order_activities
  ADD CONSTRAINT order_activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  ADD CONSTRAINT order_activities_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id);
