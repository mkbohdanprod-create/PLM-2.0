const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:54322/postgres' });
client.connect().then(() => client.query("SELECT conname, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE conrelid = 'public.measurement_tasks'::regclass;")).then(res => { console.log(res.rows); process.exit(0); });
