const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const contacts = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'order_contacts'");
  console.log('order_contacts:', contacts.rows.map(r => r.column_name).join(', '));
  const addrs = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'order_addresses'");
  console.log('order_addresses:', addrs.rows.map(r => r.column_name).join(', '));
  await client.end();
}
run();
