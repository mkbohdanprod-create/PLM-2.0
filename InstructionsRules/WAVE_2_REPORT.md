# WAVE_2_REPORT.md (План Міграції Хвилі 2 - Спрощений)

## 1. SQL-міграція
У межах однієї транзакції / міграційного файлу будуть виконані наступні кроки:

**а) Додання enum-значень PAUSED_***
Будуть додані нові статуси для кожного макро-етапу: 
`PAUSED_MEASUREMENT`, `PAUSED_ENGINEERING`, `PAUSED_PRODUCTION`, `PAUSED_DELIVERY`, `PAUSED_INSTALLATION`.

**б) Оновлення `status_transitions`**
- Будуть додані переходи з **кожного** робочого мікро-статусу до відповідного `PAUSED_*` (наприклад, `MEASUREMENT_SCHEDULING -> PAUSED_MEASUREMENT`, `MEASUREMENT_SCHEDULED -> PAUSED_MEASUREMENT`).
- Будуть додані переходи з `PAUSED_*` **назад на початок етапу** (наприклад, `PAUSED_MEASUREMENT -> MEASUREMENT_SCHEDULING`, `PAUSED_ENGINEERING -> ENGINEERING_QUEUE`).

**в) Створення generated column `macro_stage`**
```sql
ALTER TABLE public.orders ADD COLUMN macro_stage text GENERATED ALWAYS AS (
  CASE 
    WHEN status LIKE 'MEASUREMENT_%' OR status = 'PAUSED_MEASUREMENT' THEN 'MEASUREMENT'
    WHEN status LIKE 'ENGINEERING_%' OR status = 'PAUSED_ENGINEERING' THEN 'ENGINEERING'
    WHEN status LIKE 'PRODUCTION_%' OR status = 'IN_PRODUCTION' OR status = 'PAUSED_PRODUCTION' THEN 'MANUFACTURING'
    WHEN status LIKE 'DELIVERY_%' OR status = 'PAUSED_DELIVERY' THEN 'DELIVERY'
    WHEN status LIKE 'INSTALLATION_%' OR status = 'PAUSED_INSTALLATION' THEN 'INSTALLATION'
    WHEN status IN ('COMPLETED', 'CLOSED') THEN 'CLOSING'
    WHEN status = 'CANCELLED' THEN 'CANCELLED'
    ELSE 'UNKNOWN'
  END
) STORED;
```

**г) Міграція даних**
Оскільки сиріт у базі 0, а всі замовлення — тестові (близько 20 шт.), замість складної логіки просто зачищаємо будь-які можливі залишкові паузи:
```sql
DELETE FROM public.orders WHERE status = 'PAUSED';
```

**д) Видалення колонки `previous_status`**
```sql
ALTER TABLE public.orders DROP COLUMN previous_status;
```

**е) Оновлення `change_order_status`**
Видалення старої логіки для обробки `p_new_status = 'RESUME'`, оскільки тепер фронтенд буде надсилати конкретний цільовий статус (початок макро-етапу), а БД буде перевіряти його легальність через таблицю `status_transitions`.

---

## 2. Словник Макро/Мікро на фронті
Створення файлу `src/utils/orderStages.ts` з:
- Мапінгом всіх мікро-статусів до локалізованих назв.
- Функцією `getMacroStage(status: string): string`, яка дублює логіку БД для швидкої фільтрації на фронті.

---

## 3. Фронт-компоненти для рефакторингу
Ось список усіх компонентів, де необхідно позбутися хардкоду глобальної паузи та інших прямих порівнянь:

- **OrdersList.tsx** 
- **OrderCard.tsx** 
- **MapPanel.tsx** 
- **GanttChartPrototype.tsx** 
- **ProductionBoard.tsx** 
- **EngineeringBoard.tsx** 
- **EngineeringBacklog.tsx** 
- **CalendarPanel.tsx** 

Усі ці місця будуть переведені на перевірку `getMacroStage(status) === 'PAUSED_*'` або точкові мікро-статуси.

---

## 4. Тестовий план
1. Виконати `SELECT count(*) FROM orders WHERE status='PAUSED'` після міграції → має бути **0**.
2. Створити нове замовлення, натиснути "Пауза" на етапі Заміру → статус стає `PAUSED_MEASUREMENT`.
3. Натиснути "Відновити" → статус стає `MEASUREMENT_SCHEDULING` (незалежно від того, чи була пауза на SCHEDULED).
4. Перевірити `SELECT DISTINCT macro_stage FROM orders` → має повернути зрозумілі макро-етапи.
5. Перевірити, що всі фільтри списку замовлень (OrdersList) продовжують працювати.

---

## 5. Ризики
а) **Невідомі `previous_status`**: Усунуто (перевірено, записів 0).
б) **Пропущений хардкод `status === '...'`**: Фронт великий, можливі пропуски в глибоких компонентах. Вирішується ретельним пошуком `grep`.
в) **Блокуючі індекси**: Видалення `previous_status` може зламати існуючі view або функції. (Їх наразі немає, але треба уважно `DROP`).
г) **Залишки гілки `RESUME`**: Потребує суворого рефакторингу у фронті.

---

## 6. Оцінка часу
Спрощений план: **3-5 календарних днів** (швидке впровадження).
