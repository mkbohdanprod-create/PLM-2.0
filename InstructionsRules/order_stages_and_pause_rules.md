# Етапи, Підстатуси та Правила проходження карток (SlabCut Planner)

# Етапи, Підстатуси та Правила проходження карток (SlabCut Planner)

## ФАКТИЧНА реалізація (станом на Хвилю 7.5)

Цей документ описує початковий концепт і цільове бачення. Проте в ході Хвиль 1-7.5 **архітектура була адаптована** до реалій. 

**Що РЕАЛІЗОВАНО за поточним дизайном:**
- ✅ Всі 8 макро-етапів (реалізовані через `macro_stage` case).
- ✅ Усі виробничі та монтажні підстатуси (Enum) додані в базу.
- ✅ Регресії (повернення етапів) та Додаткові дії (Activities).
- ✅ Механізм Рекламацій (Parent-Child) — дочірня картка з посиланням на `parent_order_id`.

**Що ЗМІНЕНО (Фактичний відступ від дизайну):**
- ❌ **Підстатуси пауз (`PAUSED_*`) НЕ реалізовано.** Ми використовуємо єдиний глобальний статус `PAUSED`, а етап запам'ятовується в колонці `previous_status` (плоска модель). 
- ❌ **Двошарова модель (Status + Sub-Status) СКАСОВАНА.** Модель залишилася ПЛОСКОЮ (тільки поле `status`).
- 🚨 **Заморозка рекламацій:** Через те, що рекламація може прилетіти як з цеху, так і з монтажу, ми **відмовилися** від статусу `INSTALLATION_RECLAMATION` для блокування батьківської картки. Натомість використовується прапорець `is_reclamation_frozen = TRUE` ПОВЕРХ будь-якого поточного статусу (IN_PRODUCTION, INSTALLATION_IN_PROGRESS тощо).

Нижче наведено оригінальний словник та бачення (для історії) та актуальні матриці, згенеровані з БД.

## 1. Порівняння Логік: Етапи (Макро) vs Підстатуси (Мікро)

Технічна структура бази даних може містити багато дрібних станів (підстатусів) для внутрішньої "кухні", але концептуально для користувача та бізнесу замовлення рухається по **8 базових Етапах**.

| Глобальний Етап (Stage) | Хто відповідає | Що відбувається (Суть) |
| :--- | :--- | :--- |
| **0. Пауза (PAUSE)** | Глобально | Замовлення заморожено. Має таймер нагадування. |
| **1. Планування заміру** | Диспетчер | Картка в пулі нерозподілених, чекає drag-and-drop або висить як "попередньо запланована". |
| **2. Замір** | Замірник | Замірник бачить завдання в AppSheet, їде на об'єкт, робить скетч. Сюди ж входить "перезамір". |
| **3. Конструктив** | Конструктор | Створення креслень, погодження з клієнтом, підготовка CAM-файлів. |
| **4. Виробництво** | MES (Цех) | Фізичне виготовлення деталей. Замовлення повністю Read-Only для офісу. |
| **5. Планування монтажу** | Диспетчер | Готові вироби на складі, диспетчер шукає бригаду. |
| **6. Доставки** | Водій / Диспетчер | Формування рейсів доставки на об'єкт клієнта (чи самовивіз). |
| **7. Монтаж** | Монтажна бригада | Монтажники на об'єкті ставлять виріб. |
| **8. Готово** | Архів | Акти підписано, гроші отримано. Закрито. |

---
V
## 2. Словник Підстатусів (Таблиця перекладу для UI)

Це детальна таблиця всіх технічних станів (DB Enum), які існують "під капотом" Макро-Етапів. Саме ці українські назви повинні використовуватись у React-додатку для бейджів, випадаючих списків та історії (Audit Log).

| Макро-Етап | Технічний Підстатус (DB Enum) | 🇺🇦 Локалізація для UI (Frontend) | Опис / Тригер |
| :--- | :--- | :--- | :--- |
| **Пауза** | *(всі підстатуси `*_PAUSED` нижче)* | **На паузі** | Замовлення заморожено. Будь-який підстатус `*_PAUSED` переводить замовлення у цей Макро-Етап. |
| **Планування заміру** | `MEASUREMENT_SCHEDULING` | **Очікує планування заміру (Нове)** | Нове замовлення у пулі диспетчера. |
| | `MEASUREMENT_PRE_SCHEDULED` | **Попередньо заплановано** | Замовлення затягнуто на календар (з виконавцем або без), але ще НЕ ЗАФІКСОВАНО диспетчером. |
| | `PAUSED` | **Відправлено на паузу** | Заморожено на етапі планування заміру (зберігається previous_status). Причина в коментарі. |
| **Замір** | `MEASUREMENT_SCHEDULED` | **Очікує замір (Заплановано)** | Призначено конкретну дату, час і замірника. |
| | `MEASUREMENT_IN_PROGRESS` | **Замір в роботі** | Замірник натиснув "В дорозі" до об'єкта. |
| | `MEASUREMENT_FINISHED_ON_SITE`| **Завершив роботу на об'єкті** | Замірник поїхав з об'єкта, але ще фіналізує/завантажує файли. |
| | `MEASUREMENT_COMPLETED` | **Замір виконано** | Замірник повністю закрив завдання і завантажив файли. |
| | `MEASUREMENT_FAILED` | **Замір не відбувся** | **Провина клієнта** (напр. немає вдома). Відкат у 'Планування заміру'. Терміни виготовлення ЗСУВАЮТЬСЯ (через Паузу). |
| | `MEASUREMENT_CANCELED_BY_MEASURER` | **Скасовано замірником** | **Провина компанії** (напр. захворів). Відкат у 'Планування заміру' (щоб диспетчер бачив на радарі). Терміни НЕ зсуваються. |
| **Конструктив** | `ENGINEERING_QUEUE` | **Очікує конструювання (Нове)** | Замовлення в пулі конструкторського відділу. |
| | `ENGINEERING_IN_PROGRESS` | **Конструювання в роботі** | Конструктор взяв картку в роботу (малює). |
| | `CLIENT_APPROVAL` | **Очікує погодження клієнта** | Креслення готові, чекаємо підпис клієнта. |
| | `ENGINEERING_NESTING` | **Підготовка розкрою** | Розробка CAM-файлів для ЧПУ станків. |
| | `PAUSED` | **Відправлено на паузу** | Заморожено на етапі конструювання (зберігається previous_status). Причина в коментарі. |
| **Виробництво** | `PRODUCTION_QUEUE` | **В черзі на виробництво (Нове)** | Передано в MES, чекає вільного станка. |
| | `IN_PRODUCTION` | **У виробництві** | Фізичне різання/поклейка (Тотальне блокування UI). |
| | `PRODUCTION_COMPLETED` | **Готово на складі** | Виріб запаковано і лежить у зоні відвантаження. |
| | `PAUSED` | **Відправлено на паузу** | Заморожено на етапі виробництва (зберігається previous_status). Причина в коментарі. |
| **Планування монтажу** | `INSTALLATION_SCHEDULING` | **Очікує планування монтажу (Нове)** | Диспетчер формує пули монтажників. |
| | `PAUSED` | **Відправлено на паузу** | Заморожено на етапі планування монтажу (зберігається previous_status). Причина в коментарі. |
| **Доставки** | `DELIVERY_SCHEDULING` | **Очікує планування доставки (Нове)**| Пошук машини / водія. |
| | `DELIVERY_IN_TRANSIT` | **В дорозі** | Виріб їде до клієнта. |
| | `READY_FOR_PICKUP` | **Готово до самовивозу** | Для клієнтів (B2B), які забирають самі. |
| | `PAUSED` | **Відправлено на паузу** | Заморожено на етапі доставки (зберігається previous_status). Причина в коментарі. |
| **Монтаж** | `INSTALLATION_SCHEDULED` | **Очікує монтаж (Заплановано)** | Призначено конкретну дату, час і бригаду. |
| | `INSTALLATION_IN_PROGRESS` | **Монтаж в роботі** | Бригада натиснула "В дорозі" до об'єкта. |
| | `INSTALLATION_FINISHED_ON_SITE`| **Завершили роботу на об'єкті** | Бригада поїхала з об'єкта, фіналізує акти. |
| | `INSTALLATION_COMPLETED` | **Монтаж виконано** | Завантажено фото та підписані акти. |
| | `INSTALLATION_FAILED` | **Монтаж не відбувся** | **Провина клієнта** (напр. об'єкт не готовий). Відкат у 'Планування монтажу'. Терміни ЗСУВАЮТЬСЯ (Пауза). |
| | `INSTALLATION_RECLAMATION` | **Проблема на монтажі (Рекламація)**| **Провина компанії** (напр. лопнув камінь). Головна картка зависає, генерується дочірня рекламація. Терміни НЕ зсуваються. |
| **Готово** | `COMPLETED` | **Завершено** | Акти підписані, фінанси закриті. |
| **Скасування** | `CANCELLED` | **Скасовано** | Логічне видалення (Soft-delete) з вказанням причини. |

> [!NOTE]
> **UX Особливість: Робочий стіл Конструктора (Personal Kanban)**
> На відміну від замірників (які працюють "в полі" через мобільний додаток AppSheet з двома кнопками), Конструктори працюють за комп'ютерами у повноцінному PLM Manager. 
> Для них етап "Конструктив" буде візуалізований як особистий **Канбан-дошка** (Personal Kanban). Коли диспетчер призначає замовлення на конструктора, воно падає йому в колонку. 
> **Колонки конструктора:** *В черзі* -> *В роботі* -> *Уточнення* -> *Пауза* -> *Готово*. 
> Конструктор просто перетягує картки між цими колонками, що під капотом змінює підстатуси (Enum) у базі даних.

> [!NOTE]
> **UX Особливість: Інтеграція з MES (Виробництво та Рекламації)**
> Етап "Виробництво" є специфічним, оскільки фізична робота ведеться у зовнішній MES-системі.
> 1. **Внутрішні проблеми (напр., лопнув камінь):** Це внутрішні виробничі рекламації, які "ганяють по колу" всередині цеху. У нашому додатку вони будуть просто відображатися для загального розуміння статусу, без відкату етапів.
> 2. **Помилка конструктора (КД невірне):** Якщо цех не може виготовити деталь через помилку в кресленнях, прямо з MES прилітає **Рекламаційна картка на Конструктора**. Це той самий механізм *Гарячих Дочірніх карток*, який летить назад у Конструктив для виправлення, поки головна картка стоїть на Виробництві.

---

## 3. Три Механізми Вирішення Проблем (Обробка збоїв)

Для оцифрування складних життєвих сценаріїв (замір не відбувся, брак на монтажі, зміна рішення клієнта), ми закладаємо в архітектуру **три різні механізми**. Залежно від типу збою, система використовуватиме один із них. Це складний, але єдиний правильний шлях систематизувати реальний хаос.

### 1. Повернення етапу (Регресія / Reset)
- **Суть:** Відкат головної картки назад по дереву статусів.
- **Коли застосовується:** Коли проблема повністю "зжирає" поточний прогрес і етап треба почати з нуля.
- **Приклад:** Замірник захворів до виїзду (`MEASUREMENT_CANCELED_BY_MEASURER`) або клієнта не виявилось вдома (`MEASUREMENT_FAILED`). Поточна бронь часу згорає, і картка фізично відлітає назад диспетчеру в пул `MEASUREMENT_SCHEDULING` для пошуку нової дати.

### 2. Додаткова дія (Activity / Task)
- **Суть:** Створення супутнього завдання (яке вже існує в поточній системі).
- **Коли застосовується:** Коли виникла заминка чи потреба в комунікації, яка не потребує відкату етапу чи складної виробничої рекламації.
- **Приклад:** Менеджеру ставиться задача "Передзвонити клієнту щодо доплат", при цьому сама картка спокійно чекає на своєму етапі.

### 3. Рекламація (Parent-Child Tickets) — *[ПОКИ ЗАБЛОКОВАНО / В РЕЗЕРВІ]*
- **Суть:** Головна картка стоїть на місці, а назад по процесу запускається її "клон" (дочірня картка).
- **Коли застосовується:** Коли проблема виникає на пізніх стадіях (напр., Монтаж), і відкат головної картки назад на Виробництво зруйнує логіку (бо монтажники де-факто все ще закріплені за цим об'єктом, і об'єкт "розкурочений").
- **Механіка:** 
  1. Основна картка замовлення залишається в етапі **"Монтаж"**.
  2. Система генерує **Дочірню Картку (Рекламацію)**, прив'язану до основної (`parent_order_id`).
  3. Ця "гаряча" дочірня картка летить у початок циклу (в Конструктив або Виробництво), щоб виготовити браковану деталь.
  4. Коли нову деталь виготовлено і доставлено, дочірня картка "згоряє", а головна — продовжує свій шлях до Завершення.

---

## 4. Логіка Паузи та Повернення (Скидання прогресу етапу)

Пауза — це окремий Макро-Етап, але під капотом вона реалізована через явні **підстатуси**, специфічні для кожного етапу (наприклад, `MEASUREMENT_SCHEDULING_PAUSED`, `ENGINEERING_PAUSED`).

### Як спрацьовує Пауза?
1. **Зміна Підстатусу:** Якщо замовлення ставлять на паузу, його підстатус змінюється на відповідний `_PAUSED` (напр. "Відправлено на Паузу"). Макро-етап при цьому автоматично визначається як **"Пауза"**.
2. **Ідеальна історія:** В Audit Log чітко фіксується: *"Відправлено на паузу [Ким], [Коли], Причина: [Текст]"*. 
3. **Немає потреби в `previous_status`:** Оскільки сам підстатус (напр. `MEASUREMENT_SCHEDULING_PAUSED`) містить інформацію про те, на якому етапі сталася зупинка, система завжди знає контекст.

### Відновлення з Паузи (Reset)
Найважливіше бізнес-правило: **Вихід з паузи повертає картку на ПОЧАТОК поточного етапу**.
- Наприклад, якщо замір вже був запланований (`MEASUREMENT_SCHEDULED`), але клієнт все скасував і пішов на паузу, то при відновленні картка не може повернутись у "Заплановано" (бо дата і час вже згоріли).
- Вона повертається у статус **"Очікує планування заміру (Нове)"** (`MEASUREMENT_SCHEDULING`).
- Щоб диспетчер розумів, що це не просто нове замовлення, а "повернуте з паузи" (можливо, воно "горить" по термінах), у UI буде спеціальна візуальна відмітка (наприклад, на основі історії чи окремого прапорця `returned_from_pause`).

---

## 5. Архітектурні рішення (Чому обрано саме такі підстатуси)

### Чому "Заплановано" (`MEASUREMENT_SCHEDULED`) — це окремий підстатус, а не просто дата?
Логіка в тому, що коли диспетчер натискає "Зафіксувати", картка має фізично зникнути з пулу "Нерозподілених" і з'явитися в додатку AppSheet у замірника. 
Якби ми не мали окремого підстатусу, системі довелося б робити складну вибірку (напр., перевіряти наявність прив'язки та дати). Наявність явного підстатусу робить логіку фільтрації екранів миттєвою. Тригер бази даних автоматично фіксує цей перехід в Audit Log: *хто, коли і на який час зафіксував замір*, створюючи ідеальну незмінну історію.

### Чому ми створюємо явні підстатуси `_PAUSED`, а не один глобальний?
Це рішення усуває колізії в історії та знімає необхідність тримати колонку `previous_status`. Історія читається як лінійна книга, де зрозуміло, на якому саме етапі сталася заминка. Крім того, це дозволяє реалізувати гнучку логіку "відкату" прогресу при знятті з паузи (картка повертається в пул "Нових" для поточного етапу).

---

## 6. Статуси завдань на виїзд (`measurement_tasks.outcome` / `installation_tasks.outcome`)

Окрім головного статусу замовлення (`orders.status`), існують локальні статуси конкретних завдань для виїзних працівників (замірників / монтажників), які зберігаються в колонці `outcome` відповідних таблиць.

| Outcome (Enum) | Опис | Вплив на головне замовлення |
| :--- | :--- | :--- |
| `SCHEDULED` | Завдання призначено на працівника, він його бачить у плані. | `MEASUREMENT_SCHEDULED` |
| `IN_PROGRESS` | Працівник натиснув "В дорозі" або "Почати роботу". | `MEASUREMENT_IN_PROGRESS` |
| `COMPLETED` | Завдання успішно виконано (акт підписано). | `MEASUREMENT_COMPLETED` |
| `FAILED` | Виїзд відбувся, але роботу не виконано (провина клієнта). | Відкат `orders` у `MEASUREMENT_SCHEDULING` (регресія) з Паузою. |
| `CANCELLED` | Виїзд скасовано до початку (провина компанії/працівника). | Відкат `orders` у `MEASUREMENT_SCHEDULING` (без паузи). |

## 7. Статуси Інтеграцій та Довідників

| Домен | Статус (Enum) | Опис |
| :--- | :--- | :--- |
| Довідники (Етап 2.7) | `DRAFT`, `ACTIVE`, `ARCHIVED` | Стандартний життєвий цикл для записів у довідниках. **УВАГА:** Статус `DRAFT` живе ТІЛЬКИ в Planner-модулі (підсистема прорахунку до передачі в PLM). У `status_transitions` (основній машині станів PLM) його немає, і він буде повністю видалений звідти у Хвилі 1. |
| Google Sheets Sync | `PENDING`, `SYNCED`, `ERROR` | Статус синхронізації з зовнішніми таблицями (якщо використовується fallback-інтеграція). |

## Фактична матриця переходів (з БД)

| Поточний статус (from_status) | Доступний наступний статус (to_status) | Дозволені ролі (allowed_roles) |
|---|---|---|
| CLIENT_APPROVAL | CANCELLED | SUPER_ADMIN, REGION_MANAGER |
| CLIENT_APPROVAL | ENGINEERING_IN_PROGRESS | SUPER_ADMIN, ENGINEER, BRANCH_MANAGER |
| CLIENT_APPROVAL | ENGINEERING_NESTING | SUPER_ADMIN, ENGINEER, BRANCH_MANAGER |
| CLIENT_APPROVAL | MEASUREMENT_SCHEDULING | SUPER_ADMIN, ENGINEER |
| CLIENT_APPROVAL | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER, CONSTRUCTOR |
| CLIENT_APPROVAL | PRODUCTION_QUEUE | SUPER_ADMIN, BRANCH_MANAGER |
| DELIVERY_IN_TRANSIT | COMPLETED | SUPER_ADMIN, DISPATCHER |
| DELIVERY_IN_TRANSIT | DELIVERY_SCHEDULING | SUPER_ADMIN, DISPATCHER |
| DELIVERY_IN_TRANSIT | INSTALLATION_SCHEDULING | SUPER_ADMIN, DISPATCHER |
| DELIVERY_IN_TRANSIT | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| DELIVERY_SCHEDULING | DELIVERY_IN_TRANSIT | SUPER_ADMIN, DISPATCHER |
| DELIVERY_SCHEDULING | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| ENGINEERING_IN_PROGRESS | CLIENT_APPROVAL | SUPER_ADMIN, ENGINEER |
| ENGINEERING_IN_PROGRESS | ENGINEERING_NESTING | SUPER_ADMIN, ENGINEER |
| ENGINEERING_IN_PROGRESS | MEASUREMENT_SCHEDULING | SUPER_ADMIN, ENGINEER |
| ENGINEERING_IN_PROGRESS | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER, CONSTRUCTOR |
| ENGINEERING_NESTING | CANCELLED | SUPER_ADMIN, REGION_MANAGER |
| ENGINEERING_NESTING | CLIENT_APPROVAL | SUPER_ADMIN, ENGINEER |
| ENGINEERING_NESTING | MEASUREMENT_SCHEDULING | SUPER_ADMIN, ENGINEER |
| ENGINEERING_NESTING | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER, CONSTRUCTOR |
| ENGINEERING_NESTING | PRODUCTION_QUEUE | SUPER_ADMIN, ENGINEER |
| ENGINEERING_NESTING | PRODUCTION_QUEUE | SUPER_ADMIN, ENGINEER |
| ENGINEERING_QUEUE | ENGINEERING_IN_PROGRESS | SUPER_ADMIN, ENGINEER |
| ENGINEERING_QUEUE | MEASUREMENT_SCHEDULING | SUPER_ADMIN, ENGINEER |
| ENGINEERING_QUEUE | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER, CONSTRUCTOR |
| IN_PRODUCTION | PAUSED | SUPER_ADMIN |
| IN_PRODUCTION | PRODUCTION_COMPLETED | SUPER_ADMIN |
| INSTALLATION_COMPLETED | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| INSTALLATION_FAILED | INSTALLATION_SCHEDULING | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| INSTALLATION_FAILED | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| INSTALLATION_FINISHED_ON_SITE | INSTALLATION_COMPLETED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER, INSTALLER |
| INSTALLATION_FINISHED_ON_SITE | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| INSTALLATION_IN_PROGRESS | INSTALLATION_FINISHED_ON_SITE | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER, INSTALLER |
| INSTALLATION_IN_PROGRESS | INSTALLATION_RECLAMATION | SUPER_ADMIN, DISPATCHER, INSTALLER |
| INSTALLATION_IN_PROGRESS | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| INSTALLATION_RECLAMATION | INSTALLATION_SCHEDULING | SUPER_ADMIN, DISPATCHER |
| INSTALLATION_RECLAMATION | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| INSTALLATION_SCHEDULED | CANCELLED | SUPER_ADMIN, REGION_MANAGER |
| INSTALLATION_SCHEDULED | COMPLETED | SUPER_ADMIN, DISPATCHER |
| INSTALLATION_SCHEDULED | INSTALLATION_FAILED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| INSTALLATION_SCHEDULED | INSTALLATION_IN_PROGRESS | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER, INSTALLER |
| INSTALLATION_SCHEDULED | INSTALLATION_SCHEDULING | SUPER_ADMIN, DISPATCHER |
| INSTALLATION_SCHEDULED | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| INSTALLATION_SCHEDULING | CANCELLED | SUPER_ADMIN, REGION_MANAGER |
| INSTALLATION_SCHEDULING | INSTALLATION_SCHEDULED | SUPER_ADMIN, DISPATCHER |
| INSTALLATION_SCHEDULING | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| MEASUREMENT_CANCELED_BY_MEASURER | MEASUREMENT_SCHEDULING | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| MEASUREMENT_CANCELED_BY_MEASURER | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| MEASUREMENT_COMPLETED | CANCELLED | SUPER_ADMIN, REGION_MANAGER |
| MEASUREMENT_COMPLETED | ENGINEERING_QUEUE | SUPER_ADMIN, ENGINEER, DISPATCHER |
| MEASUREMENT_COMPLETED | MEASUREMENT_SCHEDULING | SUPER_ADMIN, ENGINEER, DISPATCHER |
| MEASUREMENT_COMPLETED | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| MEASUREMENT_FAILED | MEASUREMENT_SCHEDULING | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| MEASUREMENT_FAILED | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| MEASUREMENT_FINISHED_ON_SITE | MEASUREMENT_COMPLETED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER, MEASURER |
| MEASUREMENT_FINISHED_ON_SITE | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| MEASUREMENT_IN_PROGRESS | MEASUREMENT_FINISHED_ON_SITE | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER, MEASURER |
| MEASUREMENT_IN_PROGRESS | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| MEASUREMENT_PRE_SCHEDULED | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| MEASUREMENT_SCHEDULED | CANCELLED | SUPER_ADMIN, REGION_MANAGER |
| MEASUREMENT_SCHEDULED | MEASUREMENT_CANCELED_BY_MEASURER | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| MEASUREMENT_SCHEDULED | MEASUREMENT_COMPLETED | SUPER_ADMIN, ENGINEER, DISPATCHER |
| MEASUREMENT_SCHEDULED | MEASUREMENT_FAILED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| MEASUREMENT_SCHEDULED | MEASUREMENT_IN_PROGRESS | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER, MEASURER |
| MEASUREMENT_SCHEDULED | MEASUREMENT_SCHEDULING | SUPER_ADMIN, DISPATCHER |
| MEASUREMENT_SCHEDULED | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| MEASUREMENT_SCHEDULING | CANCELLED | SUPER_ADMIN, REGION_MANAGER |
| MEASUREMENT_SCHEDULING | MEASUREMENT_SCHEDULED | SUPER_ADMIN, DISPATCHER |
| MEASUREMENT_SCHEDULING | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| PRODUCTION_COMPLETED | COMPLETED | SUPER_ADMIN, DISPATCHER |
| PRODUCTION_COMPLETED | DELIVERY_SCHEDULING | SUPER_ADMIN, DISPATCHER, MANAGER, CONSTRUCTOR |
| PRODUCTION_COMPLETED | INSTALLATION_SCHEDULING | SUPER_ADMIN, DISPATCHER |
| PRODUCTION_COMPLETED | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| PRODUCTION_COMPLETED | READY_FOR_PICKUP | SUPER_ADMIN, DISPATCHER, MANAGER, CONSTRUCTOR |
| PRODUCTION_QUEUE | CANCELLED | SUPER_ADMIN, REGION_MANAGER |
| PRODUCTION_QUEUE | IN_PRODUCTION | SUPER_ADMIN |
| PRODUCTION_QUEUE | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |
| READY_FOR_PICKUP | COMPLETED | SUPER_ADMIN, DISPATCHER, MANAGER |
| READY_FOR_PICKUP | PAUSED | SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER, DISPATCHER |

## Принцип UI (видимість кнопок)

Кнопки не видають помилок через статус — вони або приховані, або disabled, якщо машина станів не дозволяє дію. Джерело істини — get_allowed_transitions RPC, фронт рендерить кнопки за її відповіддю.


## Доповнення за результатами Хвилі 8 (Wave 8 Adjustments)
- **Пауза та попереднє планування:** При виборі дати 'Попереднього планування' під час паузи, автоматично створюється задача типу MEASUREMENT зі стандартним часом  9:00 - 10:00. Якщо дату не вказано, усі активні задачі примусово скасовуються (CANCELLED_BY_DISPATCHER).
- **Попередньо заплановано:** При перетягуванні картки в календар замовлення автоматично переходить у статус MEASUREMENT_PRE_SCHEDULED.
