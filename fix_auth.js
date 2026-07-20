const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  await client.query("UPDATE auth.users SET confirmation_token='', recovery_token='', email_change_token_new='', email_change='' WHERE email='admin@test.com'");
  await client.end();
}
run();
