import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  
  const res = await client.query(`
    SELECT p.id, p.full_name, p.role_code, p.branch_id, p.allowed_view_regions, b.region_id 
    FROM profiles p
    LEFT JOIN branches b ON p.branch_id = b.id
  `);
  console.log('Profiles:', res.rows);

  const res2 = await client.query(`
    SELECT id, order_number, branch_id FROM orders
  `);
  console.log('Orders:', res2.rows);

  await client.end();
}

run().catch(console.error);
