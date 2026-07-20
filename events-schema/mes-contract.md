# MES Event Contract

Цей документ визначає схеми (payloads) інтеграційних та доменних подій, що курсують між PLM та MES через внутрішню шину подій (Supabase Realtime / Edge Functions). Усі події слідують правилу зворотної сумісності (backward compatibility).

## Загальна структура події (Envelope)
Усі події обгорнуті в єдиний стандартний конверт:
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

## 1. ProductionOrderReleased
**Хто публікує:** PLM (після підтвердження конструктиву та передачі в роботу)
**Хто підписується:** MES

**Payload (v1.0):**
```json
{
  "order_id": "uuid",
  "external_id": "string",
  "materials": [
    {
      "material_id": "string",
      "quantity": 10.5
    }
  ],
  "expected_completion_date": "YYYY-MM-DD"
}
```

## 2. ProductionProgressed
**Хто публікує:** MES (при зміні статусу на станку/дільниці)
**Хто підписується:** PLM (для оновлення дашбордів та статусів замовлення)

**Payload (v1.0):**
```json
{
  "order_id": "uuid",
  "stage": "string (напр. 'cutting', 'edge_banding')",
  "status": "string ('started', 'completed', 'paused')",
  "operator_id": "string (опційно)"
}
```

## 3. ProductionIssueReported
**Хто публікує:** MES (якщо виник брак матеріалу чи поломка)
**Хто підписується:** PLM (для призупинення логістики та повідомлення менеджера)

**Payload (v1.0):**
```json
{
  "order_id": "uuid",
  "issue_type": "string ('material_defect', 'machine_breakdown')",
  "description": "string",
  "severity": "string ('high', 'medium', 'low')"
}
```
