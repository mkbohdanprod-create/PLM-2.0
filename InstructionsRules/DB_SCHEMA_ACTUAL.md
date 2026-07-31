# Фактична Схема Бази Даних (Станом на Хвилю 7.5)

Цей документ автоматично згенеровано/зведено на основі поточного стану бази даних PostgreSQL.

## Таблиці та Ключові Колонки

### `orders`
- `id` (uuid)
- `order_number` (text)
- `status` (text) - Поточний статус (Плоска модель)
- `macro_stage` (text) - GENERATED COLUMN на базі статусу
- `previous_status` (text) - Статус до паузи
- `is_reclamation_frozen` (boolean) - Заморозка при рекламації (замість окремого статусу)
- `parent_order_id` (uuid) - Прив'язка дочірньої рекламації до батьківського замовлення
- `resume_date` (date) - Дата виходу з паузи
- `is_incomplete` (boolean)
- `measurement_duration_mins` (integer) - Необхідний час на замір
- Дати: `document_date`, `base_readiness_date`, `payment_date`, `calc_readiness_date`, `planned_call_date`

### `profiles`
- `id` (uuid) - FK на `auth.users`
- `full_name` (text), `role_code` (text), `is_active` (boolean)
- `region_id` (uuid) - FK на `regions`. Прив'язка співробітника до регіону (замірники, монтажники).
- `allowed_view_regions` (uuid[]), `allowed_action_regions` (uuid[])

### `order_activities` (Комунікації)
- `id` (uuid), `order_id` (uuid)
- `macro_stage` (text) - Прив'язка активності до конкретного етапу (напр. 'MEASUREMENT_SCHEDULING')
- `created_by` (uuid) - FK на `public.profiles(id)`
- `completed_by` (uuid) - FK на `public.profiles(id)`
- Зберігає як ручні дзвінки, так і системні нотатки при паузах чи зміні статусів.

### `engineering_tasks`, `measurement_tasks`, `delivery_tasks`
Зберігають стан виконання відповідних виїзних чи внутрішніх завдань. Мають колонку `status` або `outcome`.

### `settings`
- `key` (text) - Унікальний ідентифікатор налаштування (напр. `measurement_duration_rules`).
- `value` (jsonb) - Значення налаштування у форматі JSON.
- Використовується для зберігання формул розрахунку трудозатрат та інших глобальних конфігурацій.

### Довідники (Dictionaries)
- **`regions`**: Регіони (напр. Київ, Львів). Має `id`, `name`.
- **`branches`**: Філії/Бази в межах регіонів. Має `id`, `name`, `region_id`, `coordinates` (точка старту).
- **`pause_reasons`**: Причини паузи (напр. "Клієнт у від'їзді"). Має `id`, `name`, `is_system`, `is_active`.
- **`roles`**: Довідник ролей. Має `code` (PK), `name`, `permissions` (JSONB).

### `order_status_history`
- Фіксує всі переходи статусів (через RPC та тригери).

### `status_transitions`
- `from_status` (text), `to_status` (text), `allowed_roles` (text[])
- Матриця дозволених переходів для фронтенду та бекенду.

## Тригери (Автоматика)

- **Audit Log (`audit_orders_changes`, `audit_profiles_changes`...)**: Викликають `log_changes()` при зміні записів.
- **Встановлення `is_incomplete` (`trg_set_is_incomplete`)**: Перевіряє чи заповнені всі поля замовлення і виставляє `is_incomplete`.
- **Автоматичні задачі (`trg_auto_create_engineering_task`, `trigger_auto_call_delivery`)**: Створюють відповідні завдання при зміні статусу (наприклад, на `ENGINEERING_QUEUE`).
- **Синхронізація дат (`trigger_engineering_tasks_updated_at`)**.
- **Розморозка рекламації (`trg_reclamation_unfreeze_parent_update`)**: Викликає `reclamation_unfreeze_parent()`.
- **Захист довідників (`trg_protect_materials` тощо)**: Блокує видалення записів через `protect_system_records()`.

## Ключові RPC (Збережені Процедури)

| Назва | Аргументи | Призначення | Хто / Коли викликає |
| :--- | :--- | :--- | :--- |
| `create_order` | 17 аргументів | Створення нового замовлення (або рекламації) | UI (Форма створення) |
| `change_order_status` | `p_order_id`, `p_new_status`, `p_reason`, ... | Універсальна зміна статусу з валідацією | UI (Кнопки переходів) |
| `pause_order` | `p_order_id`, `p_reason_id`, `p_resume_date` | Відправка на паузу (записує `previous_status`) | UI (Кнопка Паузи) |
| `resume_order` | `p_order_id` | Повернення з паузи у `previous_status` | UI (Кнопка Відновити) |
| `create_reclamation` | `p_parent_order_id`, `p_reason`, `p_reclamation_type`, ... | Створення дочірньої рекламації (фрізить батька) | UI (Форма Рекламації) |
| `get_allowed_transitions`| `p_order_id` | Повертає список можливих наступних статусів | UI (Рендеринг кнопок) |
| `assign_measurement` / `assign_engineer` | (залежить від таски) | Призначення виконавця на таску | Диспетчер / Менеджер |
| `update_engineering_task_status`| `p_task_id`, `p_status`, `p_next_order_status` | Оновлює статус таски (і замовлення) | Конструктор (Kanban) |
| `appsheet_webhook_update` | `p_idempotency_key`, ... | Обробка вебхуків від замірників/монтажників з AppSheet | AppSheet Webhook |
| `can_access_order` | `p_order_id` | Перевірка доступу RLS | PostgreSQL RLS |
| `handle_new_user` | - | Авто-створення `profiles` при реєстрації | Trigger on `auth.users` |
