const { Client } = require('pg');
const fs = require('fs');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function gatherProofs() {
  await client.connect();
  let output = '# Звіт по Базі Даних (Wave 5 Delivery)\\n\\n';
  
  output += '## 1. Таблиця vehicles\\n```text\\n';
  const vCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'vehicles'");
  vCols.rows.forEach(r => output += `${r.column_name}: ${r.data_type}\\n`);
  const vPols = await client.query("SELECT policyname FROM pg_policies WHERE tablename = 'vehicles'");
  output += `Policies: ${vPols.rows.map(r => r.policyname).join(', ')}\\n\`\`\`\\n\\n`;

  output += '## 2. Таблиця delivery_tasks\\n```text\\n';
  const tCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'delivery_tasks'");
  tCols.rows.forEach(r => output += `${r.column_name}: ${r.data_type}\\n`);
  const tPols = await client.query("SELECT policyname FROM pg_policies WHERE tablename = 'delivery_tasks'");
  output += `Policies: ${tPols.rows.map(r => r.policyname).join(', ')}\\n\`\`\`\\n\\n`;

  output += '## 3. Таблиця orders (delivery_method & macro_stage)\\n```text\\n';
  const oCols = await client.query("SELECT column_name, data_type, is_generated FROM information_schema.columns WHERE table_name = 'orders' AND column_name IN ('delivery_method', 'macro_stage')");
  oCols.rows.forEach(r => output += `${r.column_name}: ${r.data_type} (generated: ${r.is_generated})\\n`);
  output += '```\\n\\n';

  output += '## 4. Нові статуси в status_transitions (from/to DELIVERY_IN_TRANSIT)\\n```text\\n';
  const tr = await client.query("SELECT from_status, to_status, allowed_roles FROM status_transitions WHERE from_status LIKE 'DELIVERY%' OR to_status LIKE 'DELIVERY%'");
  tr.rows.forEach(r => output += `${r.from_status} -> ${r.to_status} (Roles: ${r.allowed_roles.join(', ')})\\n`);
  output += '```\\n\\n';
  
  fs.writeFileSync('C:/Users/b_dulysh/.gemini/antigravity-ide/brain/5487cb0d-5702-4c24-aa64-bd0762c71d0f/WAVE_5_DB_PROOFS.md', output);
  console.log('Report saved to WAVE_5_DB_PROOFS.md');
  await client.end();
}
gatherProofs();
