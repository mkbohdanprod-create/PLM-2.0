const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function startCloudflareTunnel(port) {
  return new Promise((resolve) => {
    const cf = spawn(path.join(__dirname, '..', 'cloudflared.exe'), ['tunnel', '--url', `http://127.0.0.1:${port}`]);
    
    cf.stderr.on('data', (data) => {
      const output = data.toString();
      // Look for the URL pattern: https://<random-words>.trycloudflare.com
      const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match) {
        resolve(match[0]);
      }
    });

    cf.stdout.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match) {
        resolve(match[0]);
      }
    });
  });
}

async function run() {
  console.log('Starting Supabase API tunnel (port 54321)...');
  const apiUrl = await startCloudflareTunnel(54321);
  console.log('Supabase API URL:', apiUrl);

  // Update .env.local
  const envPath = path.join(__dirname, '..', 'frontend', '.env.local');
  fs.writeFileSync(envPath, `VITE_SUPABASE_URL=${apiUrl}\n`);
  console.log('Updated frontend/.env.local with new Supabase URL');
  
  console.log('Waiting 3 seconds for Vite to pick up the change...');
  await new Promise(r => setTimeout(r, 3000));

  console.log('Starting Frontend tunnel (port 5173)...');
  const frontUrl = await startCloudflareTunnel(5173);
  
  console.log('\n======================================================');
  console.log('✅ ТУНЕЛІ УСПІШНО СТВОРЕНІ ЧЕРЕЗ CLOUDFLARE!');
  console.log('Відправте це посилання своїй фокус-групі:');
  console.log('👉 ' + frontUrl);
  console.log('======================================================\n');
  console.log('Скрипт працює у фоні. Не закривайте цей процес.');
}

run();
