import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  
  // For each profile that has a branch_id but empty arrays, update it to trigger the new function
  await client.query(`
    UPDATE public.profiles 
    SET branch_id = branch_id
    WHERE branch_id IS NOT NULL;
  `);
  
  const res = await client.query(`
    SELECT p.id, p.full_name, p.role_code, p.branch_id, p.allowed_view_regions, b.region_id 
    FROM profiles p
    LEFT JOIN branches b ON p.branch_id = b.id
  `);
  console.log('Fixed Profiles:', res.rows);

  await client.end();
}

run().catch(console.error);
