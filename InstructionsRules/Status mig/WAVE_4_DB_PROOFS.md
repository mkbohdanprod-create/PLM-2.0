# WAVE 4: Детальні SQL Пруфи

## 1. create_activity
```sql
CREATE OR REPLACE FUNCTION public.create_activity(p_order_id uuid, p_type activity_type, p_planned_at timestamp with time zone, p_title text, p_comment text DEFAULT NULL::text, p_assigned_to_role text DEFAULT NULL::text, p_skip_access_check boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF NOT p_skip_access_check THEN
    IF auth.uid() IS NOT NULL AND current_user != 'postgres' AND current_user != 'service_role' THEN
      IF NOT public.can_access_order(p_order_id) THEN
        RAISE EXCEPTION 'Access denied';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.order_activities (order_id, activity_type, planned_at, title, comment, assigned_to_role, created_by)
  VALUES (p_order_id, p_type, p_planned_at, p_title, p_comment, p_assigned_to_role, auth.uid())
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$function$
```

## 2. cancel_activity
```sql
CREATE OR REPLACE FUNCTION public.cancel_activity(p_activity_id uuid, p_reason text)
...
```

## 3. reschedule_activity
```sql
CREATE OR REPLACE FUNCTION public.reschedule_activity(p_activity_id uuid, p_new_planned_at timestamp with time zone)
...
```

## 4. Логіка MEASUREMENT_SCHEDULING (+ 4 години)
**З функції create_order:**
```sql
  IF v_initial_status = 'MEASUREMENT_SCHEDULING' THEN
    PERFORM public.create_activity(v_order_id, 'CALL', now() + interval '4 hours', 'Перший контакт', 'Нове замовлення', 'DISPATCHER', true);
  END IF;
```

## 5. Логіка MEASUREMENT_SCHEDULED (закриття старих і -1 доба)
**З функції change_order_status:**
```sql
  IF v_target_status IN ('MEASUREMENT_SCHEDULED', 'INSTALLATION_SCHEDULED') THEN
    UPDATE public.order_activities
    SET status = 'CANCELLED', outcome_notes = 'замінена автоматичною при плануванні', completed_at = now()
    WHERE order_id = p_order_id AND status = 'PENDING' AND activity_type = 'CALL';

    -- Створення нової на (дата виїзду - 1 доба)
    DECLARE
      v_task_date timestamptz;
    BEGIN
      IF v_target_status = 'MEASUREMENT_SCHEDULED' THEN
        SELECT scheduled_date INTO v_task_date FROM public.measurement_tasks WHERE order_id = p_order_id ORDER BY created_at DESC LIMIT 1;
      ELSE
        SELECT scheduled_date INTO v_task_date FROM public.installation_tasks WHERE order_id = p_order_id ORDER BY created_at DESC LIMIT 1;
      END IF;
      
      IF v_task_date IS NOT NULL THEN
        PERFORM public.create_activity(p_order_id, 'CALL', v_task_date - interval '1 day', 'Контроль перед виїздом', 'Автоматичне нагадування', 'DISPATCHER', true);
      END IF;
    END;
  END IF;
```

## 6. next_activity_at
```sql
CREATE OR REPLACE FUNCTION public.next_activity_at(order_row orders)
...
```

## 7. Індекс (WHERE status='PENDING')
```sql
CREATE INDEX idx_order_activities_pending_planned ON public.order_activities USING btree (order_id, planned_at) WHERE (status = 'PENDING'::text)
```

## 8. RLS Політики
```json
[
  {
    "policyname": "allow_insert_activities",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "can_access_order(order_id)"
  },
  {
    "policyname": "allow_select_activities",
    "cmd": "SELECT",
    "qual": "can_access_order(order_id)",
    "with_check": null
  },
  {
    "policyname": "allow_update_activities",
    "cmd": "UPDATE",
    "qual": "(can_access_order(order_id) AND ((get_user_role() = 'SUPER_ADMIN'::text) OR (assigned_to_role IS NULL) OR (get_user_role() = assigned_to_role)))",
    "with_check": null
  }
]
```
*Примітка: Політика DELETE відсутня, що означає заборону за замовчуванням (Default Deny) для всіх ролей крім postgres/superuser.*

## 9. E2E DB Flow Скрипт та Результат
**Код тесту (test_wave4_e2e_final.js):**
Створюється замовлення, закривається NO_ANSWER, потім замовлення ставиться на паузу, потім відновлюється.

**Результат виконання тесту:**
```text
--- E2E DB Flow (Full Cycle) ---
1. Ordered created. Activities:
[
  {
    "id": "720eb2eb-2fb4-4255-9918-bb45fa92e5ea",
    "title": "Перший контакт",
    "activity_type": "CALL",
    "planned_at": "2026-07-17T12:49:02.977Z",
    "status": "PENDING"
  }
]

2. Complete with NO_ANSWER:
[
  {
    "title": "Перший контакт",
    "planned_at": "2026-07-17T12:49:02.977Z",
    "status": "COMPLETED",
    "outcome": "NO_ANSWER"
  },
  {
    "title": "Повтор: Перший контакт",
    "planned_at": "2026-07-18T08:49:02.990Z",
    "status": "PENDING",
    "outcome": null
  }
]

3. Pause Order (PAUSED):
[
  {
    "title": "Перший контакт",
    "planned_at": "2026-07-17T12:49:02.977Z",
    "status": "COMPLETED",
    "outcome_notes": "Не взяли слухавку"
  },
  {
    "title": "Повтор: Перший контакт",
    "planned_at": "2026-07-18T08:49:02.990Z",
    "status": "CANCELLED",
    "outcome_notes": "Пауза: клієнт попросив"
  },
  {
    "title": "Уточнити дату повернення з паузи для замовлення O-5D88F1",
    "planned_at": "2026-07-20T08:49:02.997Z",
    "status": "PENDING",
    "outcome_notes": null
  }
]

4. Resume Order (RESUME):
Order Status now: MEASUREMENT_SCHEDULING
Resume Date updated: 2026-07-19T21:00:00.000Z
Activities after resume: [
  {
    "title": "Перший контакт",
    "planned_at": "2026-07-17T12:49:02.977Z",
    "status": "COMPLETED",
    "outcome_notes": "Не взяли слухавку"
  },
  {
    "title": "Повтор: Перший контакт",
    "planned_at": "2026-07-18T08:49:02.990Z",
    "status": "CANCELLED",
    "outcome_notes": "Пауза: клієнт попросив"
  },
  {
    "title": "Уточнити дату повернення з паузи для замовлення O-5D88F1",
    "planned_at": "2026-07-20T08:49:02.997Z",
    "status": "CANCELLED",
    "outcome_notes": "Відновлено з паузи"
  }
]
```
