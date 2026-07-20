const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  try {
    await client.query(`
CREATE OR REPLACE FUNCTION public.trg_auto_call_delivery()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'DELIVERY_SCHEDULING' AND OLD.status != 'DELIVERY_SCHEDULING' THEN
    INSERT INTO public.order_activities (order_id, activity_type, title, planned_at, assigned_to_role, status)
    VALUES (NEW.id, 'CALL', 'Зателефонувати для планування доставки', now() + interval '4 hours', 'DISPATCHER', 'PENDING');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
    `);
    console.log('Fixed trigger in DB');
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await client.end();
  }
}
run();
