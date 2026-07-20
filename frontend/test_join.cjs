const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'C:\\\\hhgh\\\\PLM module\\\\frontend\\\\.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

supabase.from('order_activities').select('id, creator:profiles!order_activities_created_by_fkey(full_name)').limit(1).then(console.log);
