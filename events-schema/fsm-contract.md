# FSM Event Contract (Mobile API)

Цей документ визначає схеми (payloads) подій для універсального API-приймальника від мобільних додатків (AppSheet, власний застосунок тощо) до PLM-системи. Це забезпечує єдиний формат обміну даними незалежно від обраного мобільного клієнта.

## Загальна структура події (Envelope)
Всі події мають єдиний конверт, аналогічний MES-контракту:
```json
{
  "event_id": "uuid",
  "event_type": "string",
  "event_version": "string (напр. '1.0')",
  "timestamp": "ISO-8601 (UTC)",
  "branch_id": "string (ID філії)",
  "payload": { ... }
}
```

## 1. MeasurementSubmitted
**Хто публікує:** Мобільний додаток замірника
**Що означає:** Замір успішно виконано, додано файли/результати. Переводить замовлення в `MEASUREMENT_COMPLETED`.

**Payload (v1.0):**
```json
{
  "order_id": "uuid",
  "operator_id": "uuid",
  "files": [
    "url_to_storage/file1.pdf",
    "url_to_storage/photo1.jpg"
  ],
  "notes": "string (необов'язкові коментарі з об'єкту)"
}
```

## 2. MeasurementFailedTrip
**Хто публікує:** Мобільний додаток замірника
**Що означає:** Хибний виїзд (клієнт не готовий, немає доступу). Важливо для нарахування ЗП. Повертає в диспетчеризацію або ставить на паузу.

**Payload (v1.0):**
```json
{
  "order_id": "uuid",
  "operator_id": "uuid",
  "reason_code": "string (напр. 'client_absent', 'site_not_ready')",
  "notes": "string (деталі ситуації)",
  "compensate_trip": true
}
```

## 3. InstallationSubmitted
**Хто публікує:** Мобільний додаток монтажника
**Що означає:** Монтаж успішно завершено. Переводить замовлення в `COMPLETED` (або наступний статус закриття).

**Payload (v1.0):**
```json
{
  "order_id": "uuid",
  "operator_id": "uuid",
  "act_signed": true,
  "files": [
    "url_to_storage/act_signed.pdf",
    "url_to_storage/result_photo.jpg"
  ],
  "notes": "string"
}
```

## 4. ReclamationReported
**Хто публікує:** Мобільний додаток монтажника або замірника
**Що означає:** Знайдено брак (рекламація) на об'єкті, виріб клієнт не прийняв. Ініціює петлю переробки та паузу.

**Payload (v1.0):**
```json
{
  "order_id": "uuid",
  "operator_id": "uuid",
  "defect_type": "string (напр. 'dimension_error', 'material_damage')",
  "description": "string",
  "files": [
    "url_to_storage/defect_photo.jpg"
  ],
  "requires_remake": true
}
```
