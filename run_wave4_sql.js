const { Client } = require('pg');
const fs = require('fs');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function run() {
  await client.connect();
  let activitiesSql = fs.readFileSync('wave4_activities.sql', 'utf8');
  let triggersSql = fs.readFileSync('wave4_activities_triggers.sql', 'utf8');
  
  console.log('Running schema and RPCs...');
  await client.query(activitiesSql);
  
  console.log('Running triggers and overloads...');
  await client.query(triggersSql);

  console.log('Done!');
  await client.end();
}
run().catch(console.error);
