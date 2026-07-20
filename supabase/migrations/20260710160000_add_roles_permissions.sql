-- 20260710160000_add_roles_permissions.sql

BEGIN;

ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS permissions text[] DEFAULT '{}'::text[];

DROP TRIGGER IF EXISTS audit_roles_changes ON public.roles;

UPDATE public.roles 
SET permissions = ARRAY['view_orders', 'edit_orders', 'schedule_measurements', 'view_logistics', 'edit_logistics', 'manage_users', 'manage_roles']
WHERE code = 'SUPER_ADMIN';

COMMIT;
