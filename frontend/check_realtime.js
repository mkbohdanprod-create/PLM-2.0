import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  
  const res = await client.query(`SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`);
  console.log('Realtime tables:', res.rows);

  await client.end();
}

run().catch(console.error);
