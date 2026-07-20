const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const knownEmails = [
    'admin@test.com', 'disp.kyiv@test.com', 'disp.lviv@test.com',
    'measurer1@test.com', 'measurer2@test.com', 'eng1@test.com',
    'eng2@test.com', 'driver1@test.com', 'install1@test.com'
  ];
  
  // First delete dependent references in public.profiles (if no CASCADE)
  await client.query("DELETE FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE email != ALL($1::text[]))", [knownEmails]);
  
  // Then delete from auth.users
  const res = await client.query("DELETE FROM auth.users WHERE email != ALL($1::text[])", [knownEmails]);
  console.log(`Deleted ${res.rowCount} old users from auth.users`);
  
  await client.end();
}
run();
