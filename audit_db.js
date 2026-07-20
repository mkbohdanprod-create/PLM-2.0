import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const connectionString = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const client = new Client({ connectionString });

async function run() {
  await client.connect();
  const audit = {};

  // 1.1 Tables + row count
  const tablesRes = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  audit.tables = [];
  for (const row of tablesRes.rows) {
    const countRes = await client.query(`SELECT count(*) FROM "${row.table_name}"`);
    audit.tables.push({ name: row.table_name, count: countRes.rows[0].count });
  }

  // 1.2 Structure of orders
  const ordersCols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'# ЗАВДАННЯ: Фактичний аудит стану розробки (Ground Truth Audit)

Ти НЕ пишеш код і НЕ виправляєш нічого. Твоє завдання — зібрати ФАКТИЧНИЙ стан
системи з живої бази та кодової бази і скласти звіт AUDIT_GROUND_TRUTH.md.
Правило №1 з AGENTS.md діє максимально строго: жодних відповідей з пам'яті чи
з документації — тільки те, що ти реально витягнув з БД і коду. Якщо щось
неможливо перевірити — пиши "НЕ ПЕРЕВІРЕНО: <причина>", а не припущення.

## 1. База даних (виконай через SQL, вивід включи у звіт)
1.1 Повний список таблиць public-схеми + кількість рядків у кожній.
1.2 Фактична структура orders (\d orders): всі колонки з типами. Окремо зазнач:
    чи існують колонки під таймлайни/дедлайни (client_target_date,
    internal_target_date, будь-які *_target_*, *_deadline_*, sla_*).
1.3 Повний вміст status_transitions (from, to, roles) — як таблицю.
1.4 Список УСІХ функцій public (\df): назва, аргументи, SECURITY DEFINER чи ні,
    чи зафіксований search_path. Познач функції-дублікати (кілька сигнатур
    однієї назви).
1.5 Список усіх тригерів по таблицях.
1.6 ФАКТИЧНІ привілеї: SELECT grantee, privilege_type, table_name
    FROM information_schema.role_table_grants
    WHERE grantee IN ('authenticated','anon') — повністю. Окремо: чи має
    authenticated UPDATE на orders.status (перевір column-level).
1.7 Список RLS-політик усіх таблиць (pg_policies) + таблиці, де RLS ВИМКНЕНО.
1.8 Вміст status_required_fields. Чи реально спрацьовують перевірки:
    знайди в change_order_status актуальної версії, чи ввімкнений блок
    required fields / is_incomplete guard.
1.9 pg_cron jobs та pgmq черги: що реально створено.
1.10 Точна назва таблиці аудиту (audit_log чи audit_logs), її структура,
    кількість записів, розподіл за source.

## 2. Фронтенд (пошук по коду, вкажи файл:рядок для кожного знахідки)
2.1 Всі місця з прямими мутаціями: grep по .from('...').insert / .update /
    .delete / .upsert у src/. Повний список з назвами таблиць.
2.2 Всі виклики .rpc('...') — список унікальних імен RPC, які фронт реально
    викликає. Звір зі списком з п.1.4: які RPC існують у базі, але не
    викликаються, і які викликаються, але відсутні в базі.
2.3 Залишки window.prompt / window.confirm / alert().
2.4 Кількість any (з обґрунтуванням-коментарем і без).
2.5 Хардкод статусів: файли, де рядки статусів зашиті literal'ами замість
    словника.
2.6 Стан Sentry: імпортується чи ні, де закоментовано.
2.7 Файли понад 500 рядків (список з розміром).

## 3. Міграції та Edge Functions
3.1 Список файлів міграцій у хронології. Познач міграції, які пере-створюють
    ту саму функцію (скільки версій change_order_status).
3.2 Чи є у пізніх міграціях GRANT ALL або GRANT UPDATE на orders, що
    накатились ПІСЛЯ REVOKE (звір порядок).
3.3 Список Edge Functions: назва, чи це робоча логіка чи заглушка (подивись
    тіло), які секрети читає.

## 4. Live-тест безпеки (тільки читання/безпечні спроби, на DEV-середовищі)
4.1 Під роллю authenticated (симуляція JWT як у test_rls.sql) спробуй:
    прямий UPDATE orders SET status='COMPLETED' — очікування: відмова.
    Прямий UPDATE resume_date — очікування: відмова. Зафіксуй фактичний
    результат обох.
4.2 Спробуй викликати change_order_status з роллю DISPATCHER для переходу,
    якого нема в status_transitions — зафіксуй результат.
НЕ запускай нічого руйнівного (без reset, без delete, без міграцій).

## 5. Звірка "Документація vs Факт"
Побудуй таблицю: Твердження з доків (CURRENT_STATE.md, DB_SCHEMA_ACTUAL.md,
order_state_machine.md) | Факт з бази/коду | Статус (✅ збігається /
❌ розходиться / ⚠️ частково). Мінімум перевір:
- список статусів у status_transitions vs order_state_machine.md;
- перелік RPC у DB_SCHEMA_ACTUAL.md vs реальні функції;
- "Хвиля 1 виконана: інкапсуляція, прямі мутації закриті" vs п.2.1;
- "перевірки вимкнені" (AGENTS §7) vs п.1.8;
- наявність полів таймлайнів (deadline_rules.md) vs п.1.2.

## 6. Формат звіту
Файл AUDIT_GROUND_TRUTH.md у InstructionsRules/:
- Розділ "Executive Summary" (10 рядків максимум: головні розходження).
- Далі розділи 1-5 з сирими виводами.
- Фінальна таблиця "ТОП розходжень" з пріоритетами (CRITICAL/HIGH/LOW).
Нічого не виправляй у процесі. Тільки збір фактів і звіт.
    ORDER BY ordinal_position;
  `);
  audit.orders_structure = ordersCols.rows;

  // 1.3 status_transitions
  const stRes = await client.query(`SELECT * FROM status_transitions ORDER BY from_status, to_status`);
  audit.status_transitions = stRes.rows;

  // 1.4 Functions
  const funcs = await client.query(`
    SELECT p.proname AS name,
           pg_get_function_arguments(p.oid) AS args,
           p.prosecdef AS is_security_definer,
           p.proconfig AS config
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    ORDER BY p.proname;
  `);
  audit.functions = funcs.rows;

  // 1.5 Triggers
  const triggers = await client.query(`
    SELECT event_object_table AS table, trigger_name, action_statement
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name;
  `);
  audit.triggers = triggers.rows;

  // 1.6 Privileges
  const privs = await client.query(`
    SELECT grantee, privilege_type, table_name
    FROM information_schema.role_table_grants
    WHERE grantee IN ('authenticated','anon') AND table_schema = 'public'
    ORDER BY table_name, grantee, privilege_type;
  `);
  audit.privileges = privs.rows;

  // 1.7 RLS policies
  const rls = await client.query(`
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `);
  audit.rls_policies = rls.rows;

  const rlsDisabled = await client.query(`
    SELECT relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    ORDER BY relname;
  `);
  audit.rls_disabled = rlsDisabled.rows;

  // 1.8 status_required_fields
  try {
    const srf = await client.query(`SELECT * FROM status_required_fields`);
    audit.status_required_fields = srf.rows;
  } catch (e) {
    audit.status_required_fields = "Table does not exist";
  }

  const cosFunc = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'change_order_status'
    LIMIT 1;
  `);
  if (cosFunc.rows.length > 0) {
    audit.change_order_status_def = cosFunc.rows[0].def;
  }

  // 1.9 pg_cron / pgmq
  try {
    const cron = await client.query(`SELECT * FROM cron.job`);
    audit.cron = cron.rows;
  } catch (e) { audit.cron = "No cron jobs or extension not available"; }

  try {
    const pgmq = await client.query(`SELECT queue_name FROM pgmq.meta`);
    audit.pgmq = pgmq.rows;
  } catch (e) { audit.pgmq = "No pgmq or extension not available"; }

  // 1.10 Audit table
  const auditTables = ['audit_log', 'audit_logs'];
  let foundAuditTable = null;
  for (const t of auditTables) {
    const exists = await client.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, [t]);
    if (exists.rows.length > 0) {
      foundAuditTable = t;
      break;
    }
  }
  if (foundAuditTable) {
    const auditStruct = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `, [foundAuditTable]);
    const auditCount = await client.query(`SELECT count(*) FROM "${foundAuditTable}"`);
    let auditSources;
    try {
      const srcQuery = await client.query(`SELECT source, count(*) FROM "${foundAuditTable}" GROUP BY source`);
      auditSources = srcQuery.rows;
    } catch (e) {
      auditSources = "No source column";
    }
    audit.audit_table = {
      name: foundAuditTable,
      structure: auditStruct.rows,
      count: auditCount.rows[0].count,
      sources: auditSources
    };
  } else {
    audit.audit_table = "NOT FOUND";
  }

  fs.writeFileSync('audit_db.json', JSON.stringify(audit, null, 2));
  await client.end();
  console.log("DB Audit completed.");
}

run().catch(console.error);
