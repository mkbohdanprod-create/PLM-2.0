const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE public.delivery_tasks ALTER COLUMN driver_id DROP NOT NULL;
      ALTER TABLE public.delivery_tasks ALTER COLUMN vehicle_id DROP NOT NULL;
      ALTER TABLE public.delivery_tasks ALTER COLUMN scheduled_date DROP NOT NULL;

      ALTER TABLE public.delivery_tasks ADD CONSTRAINT delivery_tasks_outcome_check 
      CHECK (outcome IN ('SCHEDULED','IN_PROGRESS','DELIVERED','FAILED','CANCELLED_BY_DISPATCHER'));
    `);
    console.log('Successfully altered delivery_tasks');
    
    const res = await client.query(`
      SELECT column_name, is_nullable FROM information_schema.columns 
      WHERE table_name = 'delivery_tasks' 
      AND column_name IN ('driver_id', 'vehicle_id', 'scheduled_date');
    `);
    console.table(res.rows);

    const rls = await client.query(`
      SELECT policyname, cmd FROM pg_policies 
      WHERE tablename IN ('delivery_tasks', 'vehicles');
    `);
    console.table(rls.rows);
  } catch(e) {
    console.error(e.message);
  } finally {
    await client.end();
  }
}
run();
