# План Хвилі 5: Макро-Етап «Доставка»

**Мета:** Впровадження логістики після етапу виробництва (MES). Створення таблиці доставок, додавання нових мікро-статусів доставки (з урахуванням плоскої моделі пауз) та розробка UI-дашборду для логіста через клонування та адаптацію існуючих панелей Заміру.

## ⚠️ User Review Required

За планом, Хвиля 5 є повністю незалежною від скасованої Хвилі 2. Ми переходимо до мікро-статусів доставки (плоска модель) та додаємо згенеровану колонку `macro_stage` для агрегації.

*(Всі 5 уточнень після першого рев'ю враховані нижче).*

---

## 1. База Даних (SQL Schema)

### Нові таблиці `vehicles` та `delivery_tasks`
Щоб уникнути падіння міграції через FK, створюємо мінімальний довідник транспортних засобів:
- **`vehicles`**:
  - `id` (uuid, PK)
  - `name` (text)
  - `plate_number` (text, nullable)
  - `branch_id` (uuid, FK, nullable)
  - `is_hidden` (boolean, default false)
- **RLS для `vehicles`:** Читання доступне всім аутентифікованим користувачам з відповідним `branch_id`, редагування заборонено (тільки через RPC).

- **`delivery_tasks`** (аналог `measurement_tasks`):
  - `id` (uuid, PK)
  - `order_id` (uuid, FK до `orders`, ON DELETE CASCADE)
  - `driver_id` (uuid, FK до `profiles`, nullable)
  - `vehicle_id` (uuid, FK до `vehicles`, nullable)
  - `scheduled_date` (timestamptz, nullable)
  - `outcome` (text: `SCHEDULED`, `IN_PROGRESS`, `DELIVERED`, `FAILED`, `CANCELLED_BY_DISPATCHER`)
  - `route_order` (int, порядок у маршруті)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
- **RLS для `delivery_tasks`:** Аналогічно до `measurement_tasks` (читання за прив'язкою до філії, запис заблоковано для прямого доступу з фронтенду).

### Оновлення `order_status` (ENUM)
Додати наступні мікро-статуси (через `ALTER TYPE`):
- `DELIVERY_SCHEDULING` (очікує планування доставки — новий, у пулі)
- `DELIVERY_IN_TRANSIT` (в дорозі)
- `READY_FOR_PICKUP` (готово до самовивозу для B2B)
> **УВАГА:** Жодного `PAUSED_DELIVERY` не створюється. Використовуємо плоску модель: `PAUSED` + `previous_status='DELIVERY_SCHEDULING'`.

### Зміни в таблиці `orders` (Доставка та macro_stage)
**Вирішення семантичної прогалини:**
Оскільки `order_type` (FULL_CYCLE, BY_DRAWING, NO_INSTALLATION) керує наявністю Заміру та Монтажу, він не може визначати Самовивіз. Замовлення може бути повного циклу, але клієнт вирішив забрати його сам. Тому ми додаємо нове поле.
- Додати колонку `delivery_method` (text) `CHECK (delivery_method IN ('DELIVERY', 'PICKUP')) DEFAULT 'DELIVERY'`.
- Додати GENERATED колонку `macro_stage` (text) (якщо ще немає, бо в `information_schema` вона вже частково світиться).
- Умови генерації міститимуть гілку:
  `WHEN status LIKE 'DELIVERY_%' OR status = 'READY_FOR_PICKUP' THEN 'DELIVERY'`

### Оновлення Тригерів (Активності Хвилі 4)
- При переході замовлення в статус `DELIVERY_SCHEDULING`, тригер автоматично створюватиме Активність (`CALL` на +4 години) для зв'язку з клієнтом щодо планування дати/часу доставки.

### Оновлення `status_transitions` (Машина станів)
Додати нові легальні переходи та оновити `change_order_status` з урахуванням логіки маршрутизації за `order_type`.

**Логіка виходу з виробництва (`PRODUCTION_COMPLETED`):**
- Якщо `delivery_method = 'PICKUP'` (Самовивіз) → **`READY_FOR_PICKUP`**
- Якщо `delivery_method = 'DELIVERY'` (Доставка) → **`DELIVERY_SCHEDULING`**

**Логіка всередині доставки:**
- `DELIVERY_SCHEDULING` → `DELIVERY_IN_TRANSIT`
- `READY_FOR_PICKUP` → `COMPLETED` (забрали)
- `DELIVERY_IN_TRANSIT` → `DELIVERY_SCHEDULING` (регресія: не змогли доставити)

**Логіка автопропуску монтажу (при виході з `DELIVERY_IN_TRANSIT`):**
При успішній доставці функція `change_order_status` жорстко перевіряє `order_type`:
- Якщо `order_type = 'NO_INSTALLATION'` → **`COMPLETED`**
- Якщо `order_type IN ('FULL_CYCLE', 'BY_DRAWING')` → **`INSTALLATION_SCHEDULING`**
*(Вибір диспетчером усунуто).*

---

## 2. Серверна Логіка (RPC Functions)

### RPC `assign_delivery` та `unassign_delivery`
*(Повний клон `assign_measurement` та `unassign_measurement`)*
- Функції будуть оголошені як `SECURITY DEFINER`.
- Включатимуть обов'язковий виклик `set_config('app.source', '...', true)` для коректного запису в audit log через тригери.
- **`assign_delivery`**: Створює/оновлює `delivery_tasks` (outcome = 'SCHEDULED'), залишаючи статус `orders.status` незмінним.
- **`unassign_delivery`**: Знаходить `SCHEDULED` завдання і переводить outcome у `CANCELLED_BY_DISPATCHER`.

### RPC для керування `vehicles` (Довідник автомобілів)
Згідно з правилом Хвилі 1, прямі `.insert()` з фронтенду заборонені.
- `create_vehicle(p_name, p_plate_number, p_branch_id)`
- `update_vehicle(p_vehicle_id, p_name, p_plate_number)`
- `hide_vehicle(p_vehicle_id)` (Soft-delete / `is_hidden = true`)

---

## 3. Фронтенд (UI)

### Стратегія: Перевикористання коду
**Не писати з нуля!** Логістика доставок — це на 90% копія логістики замірів.

1. **`DeliveryDashboard` (Дашборд Логіста):**
   - Клон логіки `CalendarPanel` + `MapPanel`.
   - Фільтр: шукаємо замовлення за статусом `DELIVERY_SCHEDULING` (та відповідною паузою).
   - Замість «замірників» виводимо «водіїв» та їхні «машини» (через таблицю `vehicles`).
   - Замість `measurement_tasks` читаємо з `delivery_tasks`.
   - **Окремий список «Готові до видачі»:** Замовлення зі статусом `READY_FOR_PICKUP` виводяться в окрему плоску таблицю без спроб побудови маршруту чи відображення на карті, оскільки клієнт забирає їх сам.

2. **Інтеграція в `OrderCard`:**
   - Вкладка «Доставка» (аналогічно до «Логістика/Замір»).
   - Можливість ручного переходу по флоу доставок.

---

## 4. Тестовий План (Verification Plan)

### Automated / Backend (JS Script)
- Написати скрипт `test_wave5_delivery.js` для перевірки:
  1. Автоматичного визначення `macro_stage='DELIVERY'` для нових статусів.
  2. Валідації переходів `status_transitions`.
  3. Автоматичного створення Активності (CALL) при вході в `DELIVERY_SCHEDULING`.
  4. Коректного автопропуску монтажу при завершенні доставки залежно від `order_type`.

### Manual Verification
- Створити нове замовлення, довести його до `DELIVERY_SCHEDULING`.
- Призначити доставку на водія (через RPC `assign_delivery`), переконатись, що audit log спрацював коректно (через `SECURITY DEFINER`).
- Перевірити, що список `READY_FOR_PICKUP` у `DeliveryDashboard` відображається коректно без карти.

---

## 5. Ризики та Час
- **Час реалізації:** 4-6 днів (за рахунок перевикористання логіки `MapPanel` / `CalendarPanel` та RPC).
