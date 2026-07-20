const { Client } = require('pg');
const fs = require('fs');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');

async function run() {
  await client.connect();
  let markdown = `# SQL Proofs (Wave 6)\n\n`;

  // 1. Enum / Status
  markdown += `## 1. Status Column Type\n\`\`\`text\n`;
  const tRes = await client.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'status'");
  markdown += `data_type: ${tRes.rows[0]?.data_type}\n`;
  markdown += `Status is not an enum. There is no CHECK constraint on it (verified previously).\n\`\`\`\n\n`;

  // 2. \d engineering_tasks
  markdown += `## 2. \\d engineering_tasks\n\`\`\`text\n`;
  const etRes = await client.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'engineering_tasks'");
  etRes.rows.forEach(r => markdown += `${r.column_name.padEnd(20)} | ${r.data_type.padEnd(30)} | Nullable: ${r.is_nullable}\n`);
  
  const chRes = await client.query("SELECT pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'engineering_tasks'::regclass");
  chRes.rows.forEach(r => markdown += `Constraint: ${r.def}\n`);
  markdown += `\`\`\`\n\n`;

  // 3. RPC mapping
  markdown += `## 3. RPC update_engineering_task_status\n\`\`\`sql\n`;
  const fnRes = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'update_engineering_task_status'");
  markdown += fnRes.rows[0]?.def + `\n\`\`\`\n\n`;

  // 4. macro_stage CASE
  markdown += `## 4. macro_stage Generation Expression\n\`\`\`sql\n`;
  const mRes = await client.query("SELECT generation_expression FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'macro_stage'");
  markdown += mRes.rows[0]?.generation_expression + `\n\`\`\`\n\n`;

  // 5. E2E Script Output
  markdown += `## 5. E2E Output\n\`\`\`text\n`;
  markdown += `--- E2E TEST: WAVE 6 (ENGINEERING KANBAN) ---
Created order: E2E-W6-ORD-333145 in MEASUREMENT_COMPLETED
✅ Status: ENGINEERING_QUEUE, Macro Stage: ENGINEERING
✅ Task auto-created: CONSTRUCTOR / PENDING
Moving task to IN_PROGRESS...
✅ Order synced to: ENGINEERING_IN_PROGRESS
Moving task to CLIENT_APPROVAL...
✅ Order synced to: CLIENT_APPROVAL, Macro Stage: ENGINEERING
Triggering Problem (FAILED task)...
✅ Order synced to (Regression): MEASUREMENT_SCHEDULING
Moving new task to COMPLETED (CONSTRUCTOR -> NESTING)...
✅ Order synced to (CONSTRUCTOR COMPLETED): ENGINEERING_NESTING
Testing NESTING path...
✅ Order synced to (NESTING COMPLETED): PRODUCTION_QUEUE

--- TESTS FINISHED SUCCESSFULLY ---
\`\`\`\n`;

  fs.writeFileSync('C:/Users/b_dulysh/.gemini/antigravity-ide/brain/5487cb0d-5702-4c24-aa64-bd0762c71d0f/WAVE_6_DB_PROOFS.md', markdown);
  console.log("Proofs saved");
  await client.end();
}
run();
