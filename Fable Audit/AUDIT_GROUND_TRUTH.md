# AUDIT_GROUND_TRUTH
**Дата генерації:** 2026-07-17
**Опис:** Фактичний аудит стану розробки (Ground Truth) на основі аналізу живої бази даних та коду фронтенду.

## Executive Summary
1. **Frontend RPC розсинхрон (CRITICAL)**: Фронтенд викликає `create_activity` та `complete_activity`, яких **немає в базі** (в базі існують `create_communication_task` та `complete_communication_task`).
2. **Прямі мутації (HIGH)**: Попри заяви про повну інкапсуляцію (Хвиля 1), фронтенд досі робить прямі виклики `.from('orders').update(...)` та `.from('engineering_tasks').insert(...)`.
3. **Недоліки безпеки (HIGH)**: У міграції `wave1_security_and_rpc.sql` було забрано право UPDATE на всю таблицю, але потім видано GRANT UPDATE на 26 колонок `orders` (зокрема `resume_date`, `planned_call_date`, `payment_percent`). Роль `authenticated` може напряму змінювати ці дані.
4. **Неточності схеми (MEDIUM)**: Документація стверджує про наявність колонок дедлайнів (`client_target_date`, `sla_*`), але їх фізично не існує в таблиці `orders`.
5. **UI Техборг (LOW)**: Фронтенд рясніє залишками `window.prompt`, `alert` та `any` (78+ випадків).

---

## 1. База даних (Фактичний стан)

### 1.1 Повний список таблиць public-схеми
| Таблиця | Рядків |
|---------|--------|
| audit_logs | 167 |
| branches | 8 |
| brigades | 0 |
| cancel_reasons | 4 |
| communication_tasks | 0 |
| decors | 4 |
| delivery_tasks | 0 |
| engineering_tasks | 1 |
| materials | 9 |
| measurement_tasks | 0 |
| order_activities | 0 |
| order_addresses | 3 |
| order_contacts | 3 |
| order_specifications | 3 |
| order_status_history | 3 |
| orders | 3 |
| pause_reasons | 5 |
| profiles | 9 |
| regions | 4 |
| roles | 8 |
| settings | 3 |
| status_required_fields | 4 |
| status_transitions | 79 |
| task_types | 5 |
| vehicles | 4 |
| webhook_events | 0 |
| worker_schedules | 30 |

### 1.2 Фактична структура `orders`
**УВАГА**: Колонки `client_target_date`, `sla_*` **ВІДСУТНІ**.
Наявні колонки таймлайнів: `internal_target_date`, `planned_call_date`, `resume_date`, `document_date`, `base_readiness_date`, `payment_date`, `calc_readiness_date`.

### 1.3 Фактичні привілеї та RLS
Роль `authenticated` має прямі права:
- `INSERT`, `UPDATE`, `DELETE`, `SELECT` на таблицю `audit_logs` та більшість інших таблиць;
- На `orders`: `UPDATE` на колонки: `order_number`, `branch_id`, `order_type`, `payment_percent`, `is_credit`, `payment_updated_at`, `payment_source`, `locked_by`, `lock_expires_at`, `version`, `is_hidden`, `cancel_reason_text`, `cancel_reason_id`, `pause_reason_id`, `parent_order_id`, `updated_at`, `resume_date`, `external_id`, `is_incomplete`, `entered_measurement_pool_at`, `document_date`, `base_readiness_date`, `payment_date`, `calc_readiness_date`, `planned_call_date`, `call_comment`.

### 1.4 Тригери
Наявні тригери: `audit_orders_changes` (та інші `audit_*_changes`), `prevent_self_escalation_trigger`, `set_default_profile_regions_trigger`, `trg_auto_call_delivery`, `trg_auto_create_engineering_task`, `trg_protect_task_types`.

---

## 2. Фронтенд

### 2.1 Прямі мутації (RLS/RPC Bypass)
Попри наявність RPC, у фронтенді використовуються прямі маніпуляції даними:
- `OrderCard.tsx:189`: `await supabase.from('orders').update({ resume_date: pauseEndDate }).eq('id', orderId);`
- `EngineeringBoard.tsx:108`: `await supabase.from('engineering_tasks').insert({ ... })`
- `RolesSettings.tsx:76`: `await supabase.from('roles').insert([{ ... }])`

### 2.2 Розсинхрон RPC (Frontend vs DB)
- Фронтенд викликає **`create_activity`** та **`complete_activity`** (`OrderCard.tsx`, `OrdersList.tsx`), але в базі таких функцій **НЕ ІСНУЄ**. Існують `create_communication_task` та `complete_communication_task`.
- `pause_order` RPC у БД очікує `p_reason_id uuid`, але фронтенд передає `p_reason text`.

### 2.3 Використання window.prompt / alert
- **alert()**: 18 випадків (`RolesSettings.tsx`, `OrderCard.tsx`, `App.tsx`, `EmployeesDirectory.tsx` та ін.)
- **window.prompt()**: 3 випадки в `OrderCard.tsx` (скасування замовлень).
- **window.confirm()**: 2 випадки в `ConstructorKanbanBoard.tsx`.

### 2.4 Використання `any`
Знайдено **понад 78 випадків** використання типу `any`. Найбільша кількість у `OrdersList.tsx`, `OrderCard.tsx` (у map/filter для масивів задач). Здебільшого без жодних обґрунтувань-коментарів.

### 2.5 Стан Sentry
`sentry.ts` присутній, ініціалізується, але **НІДЕ НЕ ІМПОРТОВАНИЙ** (у `main.tsx` відсутній `import './sentry'`).

### 2.6 Файли > 500 рядків
- `OrderCard.tsx` (935 рядків)
- `CalendarPanel.tsx` (821 рядок)
- `DeliveryDashboard.tsx` (821 рядок)
- `App.tsx` (783 рядки)
- `MapPanel.tsx` (529 рядків)

---

## 3. Міграції та Edge Functions
- **AppSheet Webhook**: Присутній (`supabase/functions/appsheet-webhook/index.ts`). Використовує секрет `SUPABASE_SERVICE_ROLE_KEY` для обходу RLS при виклику `appsheet_webhook_update`.
- Міграція `wave1_security_and_rpc.sql` робить `REVOKE UPDATE ON public.orders FROM authenticated;`, проте одразу ж після цього робить `GRANT UPDATE` на величезний перелік колонок таблиці `orders` для ролі `authenticated`.

---

## 4. Live-тест безпеки (DEV-середовище)
Результати виконання SQL-скрипта (симуляція JWT під роллю `authenticated` / `DISPATCHER`):
- `UPDATE public.orders SET status = 'COMPLETED'`: **ВІДМОВА** (`permission denied for table orders`). Правильно, статус захищений.
- `UPDATE public.orders SET resume_date = '2030-01-01'`: **УСПІШНО**. Прямий доступ до зміни колонки залишено відкритим.
- `change_order_status` з переходом `MEASUREMENT_SCHEDULING` -> `NON_EXISTENT_STATUS` для ролі `DISPATCHER`: **ВІДМОВА** (`Transition from MEASUREMENT_SCHEDULING to NON_EXISTENT_STATUS not allowed for role DISPATCHER`). State machine працює.

---

## 5. Звірка "Документація vs Факт"

| Твердження з доків | Факт з бази/коду | Статус |
|-------------------|------------------|--------|
| Хвиля 1 виконана: повна інкапсуляція, прямі мутації закриті (`CURRENT_STATE.md`) | У коді наявні `.from('orders').update(...)` та `.from('engineering_tasks').insert(...)`. У БД дозволено прямий UPDATE більшості колонок. | ❌ Розходиться |
| Повний перелік полів таймлайнів (`deadline_rules.md`) | `client_target_date` та `sla_*` відсутні в БД. | ❌ Розходиться |
| RPC для задач (`DB_SCHEMA_ACTUAL.md`) | Фронтенд викликає `create_activity` / `complete_activity`, БД має `create_communication_task` / `complete_communication_task`. | ❌ Розходиться |
| Перевірки `is_incomplete` / required fields вимкнені (`AGENTS.md`) | `change_order_status` наразі не містить жорстких перевірок `status_required_fields` (викликає `check_order_incomplete_status`, який не блокує перехід). | ✅ Збігається |
| Список статусів (`order_state_machine.md`) | 79 фактичних переходів у `status_transitions`, які відповідають логіці Хвиль 1-7. | ✅ Збігається |

---
## ТОП розходжень (Пріоритезований)

| Пріоритет | Розходження | Суть проблеми |
|-----------|------------|---------------|
| **CRITICAL** | Виклики `create_activity` | Фронтенд повністю поламаний у цьому місці. Виклики падають, бо такої функції в базі немає. |
| **HIGH** | Залишки `.from('orders').update` | Обхід State Machine. Досі можна змінити `resume_date` напряму. |
| **HIGH** | GRANT UPDATE на `orders` | Security vulnerability. Роль `authenticated` може мутувати `payment_percent`, `resume_date` тощо. |
| **MEDIUM** | Відсутність колонок дедлайнів | Бізнес-логіка розрахунку таймлайнів не може бути реалізована без цих полів у БД. |
| **LOW** | `window.prompt` та `alert` | Забруднюють UX. Слід замінити на Radix UI modals. |
| **LOW** | Sentry не імпортовано | Не ведеться трекінг помилок. |
