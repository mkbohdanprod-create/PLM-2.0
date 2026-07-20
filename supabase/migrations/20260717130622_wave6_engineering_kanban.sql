-- Migration Wave 6: Engineering Kanban

-- 1. Clean old transitions
DELETE FROM public.status_transitions WHERE from_status = 'ENGINEERING_DESIGN' OR to_status = 'ENGINEERING_DESIGN';

-- 2. Migrate existing orphans
UPDATE public.orders SET status = 'ENGINEERING_QUEUE' WHERE status = 'ENGINEERING_DESIGN';

-- 3. Add new transitions for ENGINEERING phase
INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
('MEASUREMENT_COMPLETED', 'ENGINEERING_QUEUE', ARRAY['SUPER_ADMIN', 'ENGINEER', 'DISPATCHER']),
('ENGINEERING_QUEUE', 'ENGINEERING_IN_PROGRESS', ARRAY['SUPER_ADMIN', 'ENGINEER']),
('ENGINEERING_IN_PROGRESS', 'CLIENT_APPROVAL', ARRAY['SUPER_ADMIN', 'ENGINEER']),
('ENGINEERING_IN_PROGRESS', 'ENGINEERING_NESTING', ARRAY['SUPER_ADMIN', 'ENGINEER']),
('CLIENT_APPROVAL', 'ENGINEERING_IN_PROGRESS', ARRAY['SUPER_ADMIN', 'ENGINEER', 'BRANCH_MANAGER']),
('CLIENT_APPROVAL', 'ENGINEERING_NESTING', ARRAY['SUPER_ADMIN', 'ENGINEER', 'BRANCH_MANAGER']),
('ENGINEERING_NESTING', 'PRODUCTION_QUEUE', ARRAY['SUPER_ADMIN', 'ENGINEER']),
-- Regressions (Problem/Bad Info)
('ENGINEERING_QUEUE', 'MEASUREMENT_SCHEDULING', ARRAY['SUPER_ADMIN', 'ENGINEER']),
('ENGINEERING_IN_PROGRESS', 'MEASUREMENT_SCHEDULING', ARRAY['SUPER_ADMIN', 'ENGINEER']),
('ENGINEERING_NESTING', 'MEASUREMENT_SCHEDULING', ARRAY['SUPER_ADMIN', 'ENGINEER']),
('CLIENT_APPROVAL', 'MEASUREMENT_SCHEDULING', ARRAY['SUPER_ADMIN', 'ENGINEER'])
ON CONFLICT DO NOTHING;

-- 4. Update engineering_tasks outcome check to include FAILED (it might already have it, but let's make sure, we don't have outcome check, we have status for engineering_tasks)
-- Wait, engineering_tasks has `status` (PENDING, IN_PROGRESS, PAUSED, COMPLETED).
ALTER TABLE public.engineering_tasks DROP CONSTRAINT IF EXISTS engineering_tasks_status_check;
ALTER TABLE public.engineering_tasks ADD CONSTRAINT engineering_tasks_status_check 
CHECK (status IN ('PENDING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED', 'CLIENT_APPROVAL'));

-- 5. RPC assign_engineer update with RLS & Audit
CREATE OR REPLACE FUNCTION public.assign_engineer(p_task_id uuid, p_assigned_to uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_role text;
BEGIN
  v_user_role := (SELECT role_code FROM public.profiles WHERE id = auth.uid());
  IF v_user_role NOT IN ('SUPER_ADMIN', 'DISPATCHER', 'ENGINEER') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  PERFORM set_config('app.source', 'assign_engineer', true);

  UPDATE public.engineering_tasks SET assigned_to = p_assigned_to, updated_at = now() WHERE id = p_task_id;
  RETURN FOUND;
END;
$function$
;

-- 6. RPC update_engineering_task_status update with Mapping
CREATE OR REPLACE FUNCTION public.update_engineering_task_status(p_task_id uuid, p_status text, p_next_order_status text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_role text;
  v_task_rec RECORD;
  v_order_status text;
BEGIN
  v_user_role := (SELECT role_code FROM public.profiles WHERE id = auth.uid());
  IF v_user_role NOT IN ('SUPER_ADMIN', 'DISPATCHER', 'ENGINEER') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  PERFORM set_config('app.source', 'update_engineering_task_status', true);

  -- Get task details
  SELECT * INTO v_task_rec FROM public.engineering_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Map Task Status -> Order Status
  IF p_status = 'IN_PROGRESS' THEN
    v_order_status := 'ENGINEERING_IN_PROGRESS';
  ELSIF p_status = 'CLIENT_APPROVAL' THEN
    v_order_status := 'CLIENT_APPROVAL';
  ELSIF p_status = 'COMPLETED' THEN
    -- If UI provided a specific next status, use it
    IF p_next_order_status IS NOT NULL THEN
      v_order_status := p_next_order_status;
    ELSE
      -- Fallback mapping based on specialization
      IF v_task_rec.specialization_type IN ('CONSTRUCTOR', 'TECHNOLOGIST') THEN
        v_order_status := 'ENGINEERING_NESTING';
      ELSE
        v_order_status := 'PRODUCTION_QUEUE';
      END IF;
    END IF;
  ELSIF p_status = 'FAILED' THEN
    v_order_status := 'MEASUREMENT_SCHEDULING';
  ELSIF p_status = 'PAUSED' THEN
    -- Pause is usually triggered at order level, but if task is paused:
    -- Wait, we leave it as is, or trigger change_order_status('PAUSED')
    v_order_status := 'PAUSED';
  END IF;

  -- Update task
  UPDATE public.engineering_tasks 
  SET status = p_status, 
      updated_at = now(),
      completed_at = CASE WHEN p_status IN ('COMPLETED', 'FAILED', 'CANCELLED') THEN now() ELSE completed_at END
  WHERE id = p_task_id;

  -- Update order status
  IF v_order_status IS NOT NULL AND v_order_status != 'PAUSED' THEN
    PERFORM public.change_order_status(v_task_rec.order_id, v_order_status);
  END IF;

  RETURN TRUE;
END;
$function$
;

-- 7. Trigger on ENGINEERING_QUEUE -> Auto-create task
CREATE OR REPLACE FUNCTION public.trg_auto_create_engineering_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_pool text := 'CONSTRUCTOR';
  v_mat_category text;
BEGIN
  -- Determine pool based on material (if we are moving into specific nesting later, etc)
  -- For now, initial entry to ENGINEERING_QUEUE usually goes to CONSTRUCTOR
  -- If we want material based routing:
  -- SELECT category INTO v_mat_category FROM materials JOIN order_specifications os ON materials.id = os.material_id WHERE os.order_id = NEW.id LIMIT 1;
  
  -- Insert into engineering_tasks
  INSERT INTO public.engineering_tasks (order_id, specialization_type, status, created_by)
  VALUES (NEW.id, v_pool, 'PENDING', auth.uid());

  RETURN NEW;
END;
$function$
;

-- We need a trigger on orders
DROP TRIGGER IF EXISTS trg_auto_create_engineering_task ON orders;
CREATE TRIGGER trg_auto_create_engineering_task
AFTER UPDATE OF status ON orders
FOR EACH ROW
WHEN (NEW.status = 'ENGINEERING_QUEUE' AND OLD.status != 'ENGINEERING_QUEUE')
EXECUTE FUNCTION public.trg_auto_create_engineering_task();

