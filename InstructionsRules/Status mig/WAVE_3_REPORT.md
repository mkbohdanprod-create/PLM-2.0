# Звіт по завершенню Хвилі 3 (Measurement, Installation & Regressions)

## 1. SLA-Таймлайни (Відповідь на запит)

Відповідно до `deadline_rules.md`, у нас є три таймлайни. Нижче наведено зіставлення того, що вказано в документі, з реальними полями в базі даних (БД), оскільки ми їх сьогодні додали та оновили:

| № | Назва в `deadline_rules.md` | Стан у БД (Канон) | Опис та логіка зсуву |
| :--- | :--- | :--- | :--- |
| **1** | Дата готовності для клієнта | `base_readiness_date` (існувала) | **Динамічна (Зсувається ТІЛЬКИ через клієнта)**. Офіційна дата з договору. При виході з паузи з причиною `CLIENT_FAULT` до неї автоматично додається кількість днів, проведених у паузі. |
| **2** | Дата готовності монтажу | `internal_target_date` (ДОДАНО в Хвилі 3) | **Стала (Жорсткий якір)**. Наш стратегічний буфер. Хоча вона є "сталою" відносно наших внутрішніх факапів, при паузі з вини клієнта (`CLIENT_FAULT`) вона також пропорційно зсувається, щоб зберегти інтервал буферу до `base_readiness_date`. |
| **3** | Фактична планова дата | `calc_readiness_date` (існувала) | **Супер-динамічна**. Зсувається як при провині клієнта (автоматично при виході з паузи), так і повинна зростати при наших факапах (наприклад `MEASUREMENT_CANCELED_BY_MEASURER`). |

> [!IMPORTANT]
> Наразі в RPC `change_order_status` реалізовано автоматичний зсув **усіх трьох дат** на кількість днів паузи, якщо `reason = 'CLIENT_FAULT'` при натисканні «Відновити» (RESUME).

## 2. Закриття 5 прогалин (Gaps) перед стартом Хвилі 3

1. **SLA Shift Logic (Зсув дедлайнів):** Реалізовано. При переході `PAUSED -> RESUME` система вираховує різницю в днях (`CURRENT_DATE - pause_start`) і додає ці дні до `base_readiness_date`, `internal_target_date` та `calc_readiness_date`, якщо причина паузи `CLIENT_FAULT`.
2. **AppSheet Webhook Idempotency:** Реалізовано. Створено таблицю `webhook_events` (idempotency_key, payload, processed_at). RPC перевіряє `idempotency_key` перед виконанням логіки, запобігаючи подвійному переходу статусу.
3. **AppSheet Edge Function:** Оновлено файл `supabase/functions/appsheet-webhook/index.ts`. Тепер він валідує вхідний JSON, створює `supabaseAdmin` клієнта з Service Role і викликає безпечну RPC `appsheet_webhook_update`.
4. **AppSheet RPC (`appsheet_webhook_update`):** Створено. Вона виконує `set_config('app.source', 'AppSheet', true)` для фіксації в `order_status_history`, оновлює статус у `measurement_tasks` та викликає базову функцію `change_order_status`. Доступ відкликано у публічних ролей (`REVOKE EXECUTE ... FROM public, authenticated`).
5. **Авто-переходи (Regressions):** В `change_order_status` додано логіку: 
    - `MEASUREMENT_FAILED` → автоматичний перехід в `MEASUREMENT_SCHEDULING` (без паузи, одразу на етап планування нового заміру).
    - `MEASUREMENT_CANCELED_BY_MEASURER` → автоматичний перехід в `MEASUREMENT_SCHEDULING`.
    - Старі таски (`SCHEDULED`, `IN_PROGRESS`) для цього замовлення автоматично отримують `outcome = 'CANCELLED'`.

## 3. Зміни на Фронтенді

У файлі `OrderCard.tsx` додано дві нові кнопки в блок дій для стадій `MEASUREMENT_SCHEDULED` / `MEASUREMENT_IN_PROGRESS`:
- **"Не відбувся (Клієнт)"** → Відправляє `MEASUREMENT_FAILED`.
- **"Скасовано (Компанія)"** → Відправляє `MEASUREMENT_CANCELED_BY_MEASURER`.

Обидві кнопки запитують текстову причину через `window.prompt`, яка потім зберігається в `order_status_history.reason`.

---

**Наступні кроки для Вас:**
1. Запустити локально або задеплоїти Edge Function (`npx supabase functions deploy appsheet-webhook`).
2. Протестувати повний цикл на UI: Призначити замірника (SCHEDULED) -> Натиснути "Не відбувся (Клієнт)" -> Перевірити, що картка одразу перейшла на етап "Планування замірів", минаючи Паузу.
3. Якщо все влаштовує, можемо переходити до планування Хвилі 4 (Виробництво).
