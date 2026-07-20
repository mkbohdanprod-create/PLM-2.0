import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const connectionString = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const results = {};

  try {
    const res = await client.query("SELECT id FROM public.orders LIMIT 1");
    const order_id = res.rows[0].id;
    const res2 = await client.query("SELECT id FROM public.profiles WHERE role_code = 'DISPATCHER' LIMIT 1");
    const dispatcher_id = res2.rows[0].id;

    console.log("--- TEST 4.1.1: Direct UPDATE status as authenticated ---");
    try {
      await client.query("SET ROLE authenticated");
      await client.query(`SET request.jwt.claims TO '{"sub":"${dispatcher_id}"}'`);
      await client.query(`UPDATE public.orders SET status = 'COMPLETED' WHERE id = $1`, [order_id]);
      results.test_4_1_1 = "Success! (Wait, this should be a failure!)";
    } catch (e) {
      results.test_4_1_1 = "Error: " + e.message;
    } finally {
      await client.query("RESET ROLE");
    }

    console.log("--- TEST 4.1.2: Direct UPDATE resume_date as authenticated ---");
    try {
      await client.query("SET ROLE authenticated");
      await client.query(`SET request.jwt.claims TO '{"sub":"${dispatcher_id}"}'`);
      await client.query(`UPDATE public.orders SET resume_date = '2030-01-01' WHERE id = $1`, [order_id]);
      results.test_4_1_2 = "Success! (Wait, this should be a failure!)";
    } catch (e) {
      results.test_4_1_2 = "Error: " + e.message;
    } finally {
      await client.query("RESET ROLE");
    }

    console.log("--- TEST 4.2: Invalid transition as DISPATCHER ---");
    try {
      await client.query("SET ROLE authenticated");
      await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"${dispatcher_id}"}', true)`);
      await client.query(`SELECT public.change_order_status($1, 'NON_EXISTENT_STATUS')`, [order_id]);
      results.test_4_2 = "Success! (Wait, this should be a failure!)";
    } catch (e) {
      results.test_4_2 = "Error: " + e.message;
    } finally {
      await client.query("RESET ROLE");
    }

  } catch (e) {
    console.error(e);
  }

  fs.writeFileSync('audit_tests.json', JSON.stringify(results, null, 2));
  await client.end();
  console.log("DB tests completed.");
}

run().catch(console.error);
