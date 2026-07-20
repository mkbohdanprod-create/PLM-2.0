const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:54322/postgres' });
client.connect().then(async () => {
  await client.query("ALTER TABLE public.order_activities DROP CONSTRAINT IF EXISTS order_activities_created_by_fkey;");
  await client.query("ALTER TABLE public.order_activities DROP CONSTRAINT IF EXISTS order_activities_completed_by_fkey;");
  await client.query("ALTER TABLE public.order_activities ADD CONSTRAINT order_activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);");
  await client.query("ALTER TABLE public.order_activities ADD CONSTRAINT order_activities_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id);");
  await client.query("NOTIFY pgrst, 'reload schema';");
  console.log("Constraints updated and schema reloaded");
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
