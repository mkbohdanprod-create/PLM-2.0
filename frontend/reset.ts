import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function main() {
  const { data, error } = await supabase
      .from('orders')
      .update({ status: 'MEASUREMENT_SCHEDULING' })
      .eq('status', 'IN_PRODUCTION')
      .select('id, status');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Successfully reset ${data?.length} orders back to MEASUREMENT_SCHEDULING`);
  }
}

main();
