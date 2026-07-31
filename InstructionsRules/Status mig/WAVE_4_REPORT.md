# WAVE 4: Звіт про виконання SQL-міграції (Activities)

## Загальна оцінка часу:
Підтверджую, згідно з `GAP_ANALYSIS_AND_MIGRATION_PLAN.md`, реалізація Хвилі 4 разом із фронтенд-частиною займе **6-8 днів**. SQL-фундамент повністю завершено.

## 1. Сирота-активність (PAUSE fallback)
Якщо `p_planned_call_date` не передана, система створює активність за замовчуванням на `now() + 3 дні` зі спеціальним заголовком, що містить номер замовлення.

**Пруф (витяг з `change_order_status`):**
```sql
  IF v_target_status = 'PAUSED' OR v_target_status LIKE 'PAUSED\_%' THEN
    UPDATE public.order_activities
    SET status = 'CANCELLED', outcome_notes = 'Пауза: ' || COALESCE(p_reason, ''), completed_at = now()
    WHERE order_id = p_order_id AND status = 'PENDING' AND activity_type = 'CALL';
    
    IF p_planned_call_date IS NOT NULL THEN
      PERFORM public.create_activity(p_order_id, 'CALL', p_planned_call_date - interval '1 day', 'Контроль паузи', COALESCE(p_call_comment, 'Автоматичне нагадування по паузі'), 'DISPATCHER');
    ELSE
      PERFORM public.create_activity(p_order_id, 'CALL', now() + interval '3 days', 'Уточнити дату повернення з паузи для замовлення ' || v_order_number, 'Сирота-пауза (без дати)', 'DISPATCHER');
    END IF;
  END IF;
```

## 2. Авто-створення `NO_ANSWER` / `RESCHEDULED` (`complete_activity`)
Якщо користувач закриває активність і не вказує наступну дату, система бере `now() + 1 day`.

**Пруф (витяг з `complete_activity`):**
```sql
  IF p_outcome IN ('NO_ANSWER', 'RESCHEDULED') THEN
    v_actual_next := COALESCE(p_next_planned_at, now() + interval '1 day');
    INSERT INTO public.order_activities (order_id, activity_type, planned_at, title, comment, assigned_to_role, created_by)
    VALUES (v_order_id, v_type, v_actual_next, 'Повтор: ' || v_title, 'Авто-створено після ' || p_outcome::text, v_assigned, auth.uid());
  END IF;
```

## 3. Constraint для `assigned_to_role`
Таблиця `order_activities` тепер має строгий CHECK для ролей.

**Пруф з БД (`SELECT pg_get_constraintdef`):**
```sql
CHECK ((assigned_to_role = ANY (ARRAY['DISPATCHER'::text, 'MANAGER'::text, 'CONSTRUCTOR'::text, 'MEASURER'::text, 'INSTALLER'::text, 'SUPER_ADMIN'::text])))
```

## 4. Схема `order_activities`
**Пруф полів:**
- `id` uuid PRIMARY KEY
- `order_id` uuid REFERENCES orders(id) ON DELETE CASCADE
- `title` text NOT NULL
- `activity_type` public.activity_type NOT NULL
- `planned_at` timestamptz NOT NULL
- `status` text DEFAULT 'PENDING'
- `outcome` public.activity_outcome
- `assigned_to_role` text (із вказаним Constraint)
- + audit_log тригер
- + RLS увімкнено та налаштовано для UI та Edge Functions.

## Наступний крок
SQL-міграція готова і протестована скриптом E2E-DB-Flow. Готовий розпочинати розробку UI (`OrdersList.tsx` та `OrderCard.tsx`).
