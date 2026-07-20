const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  try {
    await client.query('BEGIN;');
    await client.query(`CREATE TABLE public.vehicles (id uuid PRIMARY KEY, name text, branch_id uuid);`);
    await client.query(`CREATE POLICY "Allow read access to vehicles for users in the same branch" ON public.vehicles FOR SELECT USING (branch_id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid()) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'SUPER_ADMIN');`);
    console.log('Success');
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await client.query('ROLLBACK;');
    await client.end();
  }
}
run();
