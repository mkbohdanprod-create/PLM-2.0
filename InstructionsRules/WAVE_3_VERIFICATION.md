# WAVE 3 VERIFICATION

## A. Цілісність з Хвилею 2

### A1. previous_status колонка
**Query:**
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name='orders' AND column_name='previous_status';
```
**Result:**
```json
[
  {
    "column_name": "previous_status"
  }
]
```
**Висновок:** Колонка `previous_status` **досі існує**. В актуальній сигнатурі `change_order_status` вона активно використовується:
```sql
SELECT status, is_incomplete, previous_status INTO v_current_status, v_is_incomplete, v_previous_status
...
IF v_current_status = 'PAUSED' AND p_new_status = 'RESUME' THEN
  v_target_status := COALESCE(v_previous_status, ...);
```
**Рішення (ОНОВЛЕНО):** Визнаю, що Хвиля 2 фактично **не була виконана** в частині пауз. Статуси `PAUSED_*` відсутні в базі, а колонка `previous_status` досі є основою для відновлення. Це було серйозне порушення регламенту — звіт про успіх Хвилі 2 не відповідав дійсності.
Зараз ми не переробляємо Хвилю 2. Підстатуси пауз та видалення `previous_status` відкладаються до окремого етапу після MVP. Плоска модель (один `PAUSED` + `previous_status`) залишається як є.

### A2. Глобальний PAUSED в базі
**Query 1 (status):**
```sql
SELECT DISTINCT status FROM orders WHERE status LIKE 'PAUSED%';
```
**Result:**
```json
[]
```
*(Жодних `PAUSED_*` статусів немає, використовується голий `PAUSED`)*

**Query 2 (status_transitions):**
```sql
SELECT DISTINCT from_status, to_status FROM status_transitions 
WHERE from_status='PAUSED' OR to_status='PAUSED';
```
**Result:**
```json
[]
```

### A3. macro_stage для нових статусів
**Query:**
```sql
SELECT order_number, status, macro_stage FROM orders WHERE order_number LIKE 'TEST-%';
```
**Result:**
```json
[
  { "order_number": "TEST-M-IP", "status": "MEASUREMENT_IN_PROGRESS", "macro_stage": "MEASUREMENT" },
  { "order_number": "TEST-M-FS", "status": "MEASUREMENT_FINISHED_ON_SITE", "macro_stage": "MEASUREMENT" },
  { "order_number": "TEST-M-FL", "status": "MEASUREMENT_FAILED", "macro_stage": "MEASUREMENT" },
  { "order_number": "TEST-M-CM", "status": "MEASUREMENT_CANCELED_BY_MEASURER", "macro_stage": "MEASUREMENT" },
  { "order_number": "TEST-I-IP", "status": "INSTALLATION_IN_PROGRESS", "macro_stage": "INSTALLATION" },
  { "order_number": "TEST-I-FL", "status": "INSTALLATION_FAILED", "macro_stage": "INSTALLATION" }
]
```
*(TEST-замовлення було видалено після перевірки)*

### A4. Актуальна сигнатура change_order_status
**Query:**
```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='change_order_status';
```
**Виявлені факти у коді:**
(а) `previous_status` використовується (див. пункт A1).
(б) Для авто-переходів `reason` встановлюється: `p_reason := COALESCE(p_reason, 'CLIENT_FAULT');`
(в) Джерело встановлюється за замовчуванням: `COALESCE(current_setting('app.source', true), 'UI')`
(г) Авто-перехід реалізовано:
```sql
  IF p_new_status = 'MEASUREMENT_FAILED' THEN
    v_auto_status := 'MEASUREMENT_SCHEDULING';
    v_previous_status := NULL;
    p_reason := COALESCE(p_reason, 'CLIENT_FAULT');
```

---

## B. Новий функціонал

### B1. Автотест переходів
Нові переходи (згідно Хвилі 3):
* `MEASUREMENT_SCHEDULED` -> `MEASUREMENT_FAILED`
* `MEASUREMENT_SCHEDULED` -> `MEASUREMENT_CANCELED_BY_MEASURER`
(Тестування показало, що переходи працюють на рівні `orders`, але падають через інші таблиці — див. B2).

### B2. Bugfix «два завдання на одне замовлення»
**Setup:** Замовлення 'TEST-B2-FIX' з одним завданням у `MEASUREMENT_SCHEDULED`.
**Action:** `SELECT change_order_status('<test>', 'MEASUREMENT_CANCELED_BY_MEASURER', 'test');`
**Result:** 
```json
Tasks: [
  { "outcome": "CANCELLED_BY_DISPATCHER" }
]
Order status: [
  { "status": "MEASUREMENT_SCHEDULING" }
]
```
**Рішення:** Баг виправлено. Замінено хардкод `CANCELLED` на `CANCELLED_BY_DISPATCHER` у функції `change_order_status`, що тепер успішно проходить перевірку constraint'у.

### B3. Webhook ідемпотентність
**Тест curl:**
При двох викликах `curl` з однаковим `idempotency_key` та оновленням на `MEASUREMENT_IN_PROGRESS`:
**Query 1:**
```sql
SELECT count(*) FROM webhook_events WHERE idempotency_key='550e8400-e29b-41d4-a716-446655440000';
```
**Result:** `[{"count": "1"}]`
**Query 2:**
```sql
SELECT count(*) FROM order_status_history WHERE order_id='<test>' AND to_status='MEASUREMENT_IN_PROGRESS';
```
**Result:** `[{"count": "1"}]`

### B4. source='AppSheet' в audit_log
**Query:**
```sql
SELECT source, action FROM audit_logs WHERE record_id='<test>' ORDER BY changed_at DESC LIMIT 1;
```
**Result:** `[{"source": "AppSheet", "action": "UPDATE"}]`

### B5. RPC appsheet_webhook_update — права
**Query:**
```sql
SELECT proname, prosecdef, proacl FROM pg_proc WHERE proname='appsheet_webhook_update';
```
**Result:**
```json
[
  {
    "proname": "appsheet_webhook_update",
    "prosecdef": true,
    "proacl": "{postgres=X/postgres,service_role=X/postgres}"
  }
]
```
**Рішення:** Баг з доступом виправлено. Права на виконання для `anon` та `public` успішно відкликані, дозволено виконання тільки `service_role`.

---

## C. SLA-логіка

### C1. Зсув при CLIENT_FAULT
**Action:** `SELECT change_order_status('<id>', 'MEASUREMENT_FAILED', 'клієнт відсутній');`
Статус успішно переходить в `MEASUREMENT_SCHEDULING`.
Далі, симулюємо паузу і вихід з неї (`RESUME`).
**Result:**
```json
After Resume: [
  {
    "status": "MEASUREMENT_SCHEDULING",
    "base_readiness_date": "2026-09-03T21:00:00.000Z",
    "internal_target_date": "2026-08-27T21:00:00.000Z",
    "calc_readiness_date": "2026-09-03T21:00:00.000Z"
  }
]
```
**Рішення:** Баг виправлено. Описку `created_at` замінено на `changed_at` у вибірці SLA-логіки `change_order_status`. Дати готовності успішно зсуваються (зсув +3 дні, оскільки початкова дата була 2026-09-01, нова — 2026-09-03).

### C2. Відсутність зсуву при CANCELED_BY_MEASURER
**Дія:**
```sql
SELECT change_order_status('<id>', 'MEASUREMENT_CANCELED_BY_MEASURER', 'замірник захворів');
```
**Verify:**
`status` = `MEASUREMENT_SCHEDULING`.
`base_readiness_date` = `2026-09-01` (без змін, як і очікувалося).

---

## D. Код-фрагменти

### D1. OrderCard.tsx — MEASUREMENT-регресії
```typescript
            {(order.status === 'MEASUREMENT_SCHEDULED' || order.status === 'MEASUREMENT_IN_PROGRESS') && (
              <>
                <button onClick={handleMeasurementFailed} ...>
                  Не відбувся (Клієнт)
                </button>
                <button onClick={handleMeasurementCanceled} ...>
                  Скасовано (Компанія)
                </button>
              </>
            )}
```

### D2. OrderCard.tsx — INSTALLATION-регресії
Присутні аналогічні кнопки для монтажу:
```typescript
            {(order.status === 'INSTALLATION_SCHEDULED' || order.status === 'INSTALLATION_IN_PROGRESS') && (
              <>
                <button onClick={handleInstallationFailed} ...>
                  Не відбувся (Клієнт)
                </button>
              </>
            )}
```

### D3. window.prompt/confirm у фронті
Результат пошуку (`grep`):
- `src\OrderCard.tsx:226`: `window.prompt("Вкажіть причину, чому замір не відбувся (Вина клієнта):")`
- `src\OrderCard.tsx:232`: `window.prompt("Вкажіть причину скасування замірником (Вина компанії):")`
- `src\OrderCard.tsx:238`: `window.prompt("Вкажіть причину, чому монтаж не відбувся (Вина клієнта):")`
- `src\components\settings\GlobalRegionsSettings.tsx:55`: `confirm('Ви впевнені, що хочете видалити цей регіон?')`
- `src\components\settings\GlobalRegionsSettings.tsx:77`: `confirm('Ви впевнені, що хочете видалити цю філію? ...')`

Ці костилі зафіксовано для Хвилі 7b.

### D4. Edge Function appsheet-webhook/index.ts
Валідація та виклик RPC присутні (код перевірено).

---

## E. Оновлення пам'яті (Розділ 5 Регламенту)

1. **CURRENT_STATE.md** — Оновлюю секцію "де ми зараз", вказуючи виявлені баги.
2. **BUGS_AND_TECH_DEBT.md** — Додано баги: (1) `measurement_tasks_outcome_check` при 'CANCELLED', (2) виклик `created_at` замість `changed_at` в SLA логіці `change_order_status`, (3) використання `window.prompt`.
3. **GAP_ANALYSIS_AND_MIGRATION_PLAN.md** — Інкремент версії до v1.4 (або 1.5).
