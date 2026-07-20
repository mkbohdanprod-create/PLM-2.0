const localtunnel = require('localtunnel');
const fs = require('fs');
const path = require('path');

async function startTunnels() {
  try {
    console.log('Starting Supabase tunnel (port 54321)...');
    const apiTunnel = await localtunnel({ port: 54321 });
    console.log('Supabase API Tunnel: ' + apiTunnel.url);

    // Update .env.local for Vite
    const envPath = path.join(__dirname, '..', 'frontend', '.env.local');
    // Get anon key from supabase status, but for now we know it's the local dev key
    // Actually, local anon key is always the same for local dev, let's keep it default if we don't know it, 
    // or we can just leave VITE_SUPABASE_ANON_KEY out so it falls back to the default in supabase.ts
    fs.writeFileSync(envPath, `VITE_SUPABASE_URL=${apiTunnel.url}\n`);
    console.log('Updated frontend/.env.local with new Supabase URL');

    console.log('Waiting 3 seconds for Vite to restart and pick up .env.local...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('Starting Frontend tunnel (port 5173)...');
    const frontTunnel = await localtunnel({ port: 5173 });
    console.log('\n======================================================');
    console.log('✅ УСІ ТУНЕЛІ УСПІШНО ЗАПУЩЕНО!');
    console.log('Відправте це посилання своїй фокус-групі:');
    console.log('👉 ' + frontTunnel.url);
    console.log('======================================================\n');
    console.log('Не закривайте цей процес, поки йде тестування (натисніть Ctrl+C щоб зупинити).');

    apiTunnel.on('close', () => {
      console.log('API tunnel closed');
    });
    frontTunnel.on('close', () => {
      console.log('Frontend tunnel closed');
    });
  } catch (err) {
    console.error('Error starting tunnels:', err);
  }
}

startTunnels();
