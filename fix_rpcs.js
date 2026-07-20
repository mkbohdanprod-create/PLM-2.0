const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  try {
    await client.query(`
CREATE OR REPLACE FUNCTION public.create_vehicle(
  p_name text,
  p_plate_number text,
  p_branch_id uuid
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  IF (SELECT role_code FROM public.profiles WHERE id = auth.uid()) NOT IN ('SUPER_ADMIN', 'DISPATCHER') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.vehicles (name, plate_number, branch_id)
  VALUES (p_name, p_plate_number, p_branch_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_vehicle(
  p_vehicle_id uuid,
  p_name text,
  p_plate_number text
) RETURNS void AS $$
BEGIN
  IF (SELECT role_code FROM public.profiles WHERE id = auth.uid()) NOT IN ('SUPER_ADMIN', 'DISPATCHER') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.vehicles
  SET name = p_name, plate_number = p_plate_number
  WHERE id = p_vehicle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.hide_vehicle(
  p_vehicle_id uuid
) RETURNS void AS $$
BEGIN
  IF (SELECT role_code FROM public.profiles WHERE id = auth.uid()) NOT IN ('SUPER_ADMIN', 'DISPATCHER') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.vehicles
  SET is_hidden = true
  WHERE id = p_vehicle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.assign_delivery(
  p_order_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_scheduled_date timestamptz,
  p_route_order int DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF (SELECT role_code FROM public.profiles WHERE id = v_user_id) NOT IN ('SUPER_ADMIN', 'DISPATCHER') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  PERFORM set_config('app.source', 'assign_delivery', true);

  INSERT INTO public.delivery_tasks (order_id, driver_id, vehicle_id, scheduled_date, outcome, route_order)
  VALUES (p_order_id, p_driver_id, p_vehicle_id, p_scheduled_date, 'SCHEDULED', p_route_order);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.unassign_delivery(
  p_order_id uuid
) RETURNS void AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF (SELECT role_code FROM public.profiles WHERE id = v_user_id) NOT IN ('SUPER_ADMIN', 'DISPATCHER') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  PERFORM set_config('app.source', 'unassign_delivery', true);

  UPDATE public.delivery_tasks
  SET outcome = 'CANCELLED_BY_DISPATCHER', updated_at = now()
  WHERE order_id = p_order_id AND outcome = 'SCHEDULED';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
    `);
    console.log('Fixed RPCs in DB');
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await client.end();
  }
}
run();
