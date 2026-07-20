# Машина Статусів Замовлення (Order State Machine)

> [!IMPORTANT]
> Цей документ описує ФАКТИЧНИЙ стан машини статусів станом на завершення Хвилі 7.5.
> Згенеровано на основі реальної бази даних (`status_transitions` та `orders.status`).

## 1. Загальна Архітектура (Плоска Модель)

Спочатку (в Хвилі 2) планувалася двошарова модель статусів (де `status` і `sub_status` зберігались би окремо). Однак, ця концепція була **скасована**.
Зараз система використовує **ПЛОСКУ МОДЕЛЬ**:
- Єдине поле `status` (text) в таблиці `orders`.
- Для реалізації паузи використовується єдиний статус `PAUSED`, а попередній статус зберігається у колонці `previous_status` (щоб знати, куди повертатися після розпаужування).
- Для рекламацій використовується прапорець `is_reclamation_frozen` (boolean) ПОВЕРХ будь-якого виробничого чи монтажного статусу, що дозволяє заморозити батьківське замовлення, не змінюючи його поточний етап.

## 2. Повний перелік фактичних статусів (з БД)

Наступні статуси реально існують і використовуються в таблиці `status_transitions`:

- `CANCELLED`
- `CLIENT_APPROVAL`
- `COMPLETED`
- `DELIVERY_IN_TRANSIT`
- `DELIVERY_SCHEDULING`
- `ENGINEERING_IN_PROGRESS`
- `ENGINEERING_NESTING`
- `ENGINEERING_QUEUE`
- `IN_PRODUCTION`
- `INSTALLATION_COMPLETED`
- `INSTALLATION_FAILED`
- `INSTALLATION_FINISHED_ON_SITE`
- `INSTALLATION_IN_PROGRESS`
- `INSTALLATION_RECLAMATION`
- `INSTALLATION_SCHEDULED`
- `INSTALLATION_SCHEDULING`
- `MEASUREMENT_CANCELED_BY_MEASURER`
- `MEASUREMENT_COMPLETED`
- `MEASUREMENT_FAILED`
- `MEASUREMENT_FINISHED_ON_SITE`
- `MEASUREMENT_IN_PROGRESS`
- `MEASUREMENT_PRE_SCHEDULED`
- `MEASUREMENT_SCHEDULED`
- `MEASUREMENT_SCHEDULING`
- `PAUSED`
- `PRODUCTION_COMPLETED`
- `PRODUCTION_QUEUE`
- `READY_FOR_PICKUP`

## 3. Макро-Етапи (Macro Stages)

Макро-етапи використовуються для загального бачення процесу (наприклад, для відображення прогрес-бару на UI). В базі це реалізовано через generated column `macro_stage` (або computed field) в `orders`.

Фактична `CASE`-експресія з бази даних:

```sql
CASE
    WHEN status IN ('MEASUREMENT_SCHEDULING', 'MEASUREMENT_PRE_SCHEDULED', 'MEASUREMENT_SCHEDULED', 'MEASUREMENT_IN_PROGRESS', 'MEASUREMENT_FINISHED_ON_SITE', 'MEASUREMENT_COMPLETED', 'MEASUREMENT_FAILED', 'MEASUREMENT_CANCELED_BY_MEASURER') THEN 'MEASUREMENT'
    WHEN status IN ('ENGINEERING_QUEUE', 'ENGINEERING_IN_PROGRESS', 'ENGINEERING_NESTING') THEN 'ENGINEERING'
    WHEN status IN ('PRODUCTION_QUEUE', 'IN_PRODUCTION', 'PRODUCTION_COMPLETED') THEN 'PRODUCTION'
    WHEN status IN ('READY_FOR_PICKUP', 'DELIVERY_SCHEDULING', 'DELIVERY_IN_TRANSIT') THEN 'DELIVERY'
    WHEN status IN ('INSTALLATION_SCHEDULING', 'INSTALLATION_SCHEDULED', 'INSTALLATION_IN_PROGRESS', 'INSTALLATION_FINISHED_ON_SITE', 'INSTALLATION_FAILED', 'INSTALLATION_RECLAMATION') THEN 'INSTALLATION'
    WHEN status = 'COMPLETED' THEN 'COMPLETED'
    WHEN status = 'CANCELLED' THEN 'CANCELLED'
    WHEN status = 'PAUSED' THEN 'PAUSED'
    ELSE 'OTHER'
END
```
