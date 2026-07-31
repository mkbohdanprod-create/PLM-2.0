# План Хвилі 7: Рекламації Parent-Child (Оцифрування браку)

## Огляд (Висновки з розслідування БД)
1. **`orders`:** Має поле `parent_order_id`, але не має прапорця заморозки через рекламацію. Статус `INSTALLATION_RECLAMATION` в базі ще не фігурує.
2. **`order_specifications`:** Має поля `material_type`, `area_sqm`, `total_amount`, `material_id`, `decor_id`. Їх потрібно буде копіювати при створенні дочірнього замовлення.
3. **`webhook_events`:** Готова таблиця (`idempotency_key`, `source`, `payload`, `processed_at`), яка забезпечить ідемпотентність для MES та AppSheet.
4. **`appsheet-webhook`:** Поточна Edge Function валідує payload і викликає `appsheet_webhook_update`. Можемо розширити саму RPC `appsheet_webhook_update` для обробки `outcome = 'RECLAMATION'`, або модифікувати Edge Function.

---

## Архітектурне Рішення

### 1. Ядро: RPC `create_reclamation`
Це центральна функція, яку викликатимуть всі 4 точки входу.
**Сигнатура:**
`create_reclamation(p_parent_order_id uuid, p_reason text, p_reclamation_type text, p_return_to_stage text, p_source text, p_idempotency_key uuid DEFAULT gen_random_uuid())`

**Логіка роботи:**
- **Ідемпотентність:** Перевірка `p_idempotency_key` у `webhook_events`. Якщо існує — ігноруємо, інакше — записуємо з `source = p_source`.
- **Створення дочірньої картки:** Копіює `orders` (з `parent_order_id = p_parent_order_id`, додає постфікс `-R1` до `order_number`).
- **Специфікації:** Копіює записи з `order_specifications` для нового замовлення.
- **Пріоритет та статус дочірньої:** Запускає замовлення у статус `p_return_to_stage` (напр., `ENGINEERING_QUEUE` або `PRODUCTION_QUEUE`) із прискореним (Hot) дедлайном.
- **Заморозка батьківської картки:** Змінює статус батьківської картки на `INSTALLATION_RECLAMATION` (або інший відповідний рекламаційний статус), додає `is_reclamation_frozen = true` (нове поле), зупиняє SLA таймери.
- **Аудит:** Пише в лог подію через `set_config('app.source', p_source, true)`.

### 2. Чотири точки входу (API / UI)
1. **UI-кнопка (OrderCard):** Диспетчер вручну натискає "Створити рекламацію". Викликає RPC безпосередньо.
2. **AppSheet (Edge Function):** Коли монтажник натискає "Рекламація" (передає `outcome=RECLAMATION`), Edge Function (або RPC `appsheet_webhook_update`) тригерить `create_reclamation` з поверненням на виробництво чи конструктив.
3. **MES (Webhook):** На етапі виробництва приходить запит від MES (напр., `KD_ERROR` відкидає на `ENGINEERING_QUEUE`, `DEFECT` — `PRODUCTION_QUEUE`). Працює через окрему Edge Function або прямий виклик з перевіркою `idempotency_key`.
4. **1С (Заглушка):** Інтеграційний шлях готовий до використання, викликає RPC як і UI.

### 3. Блокування та SLA
- **Заморозка (Блокування):** В `change_order_status` додається перевірка: неможливо завершити (COMPLETED) батьківську картку, якщо існують незавершені дочірні картки (`parent_order_id = ... AND status != 'COMPLETED' AND status != 'CANCELLED'`).
- **Взаємодія з SLA (Хвиля 8+):** Батьківське замовлення ставиться на паузу SLA (як і при звичайній паузі), а дочірнє замовлення отримує нові SLA-дати з міткою пріоритету "Hot" (за потреби можна додати поле `is_priority` або визначати за наявності `parent_order_id`).

### 4. Машина Станів
- **Нові статуси:** Додамо `INSTALLATION_RECLAMATION` в `status_transitions`.
- **Переходи:** Батьківська картка переходить в `INSTALLATION_RECLAMATION`. Дочірня рухається стандартним маршрутом (`ENGINEERING_QUEUE` → `PRODUCTION_QUEUE` → ... → `COMPLETED`).

---
> [!IMPORTANT]
> **Питання на погодження (User Review Required):**
> 1. Чи додаємо ми фізичне поле `is_reclamation_frozen` (boolean) в `orders`, чи достатньо перевести батьківське замовлення у статус `INSTALLATION_RECLAMATION`? (Це важливо для заморозки на інших етапах, наприклад на Виробництві).
> 2. Як саме генерувати номер дочірнього замовлення? Чи підходить формат `{parent_order_number}-R1` (інкрементно)?
> 3. Чи потрібно копіювати також контакти (`order_contacts`) та адреси (`order_addresses`), щоб водій міг потім доставити цю переробку клієнту?

Чекаю на затвердження плану, щоб розпочати написання SQL-міграції!
