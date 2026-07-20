const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  
  try {
    await client.query(`
      CREATE POLICY "Roles editable by SUPER_ADMIN" ON roles 
      FOR ALL USING (public.get_user_role() = 'SUPER_ADMIN');
    `);
    console.log('Added RLS policy on roles for SUPER_ADMIN');
  } catch (e) {
    console.log('Error:', e.message);
  }

  await client.end();
}

run().catch(console.error);
