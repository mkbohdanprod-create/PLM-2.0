# Етап 2: Машина станів (State Machine) та Безпека

Цей файл описує налаштування машини станів (FSM) для замовлень в Supabase.
Всі зміни статусу проходять через захищену RPC-функцію, яка гарантує валідацію.

## 1. Заборона прямого оновлення статусу
Ми гарантуємо, що клієнтські додатки не можуть безпосередньо змінювати статус (поле `status`).

```sql
REVOKE UPDATE ON public.orders FROM authenticated;
GRANT UPDATE (
  order_number, branch_id, order_type,
  payment_percent, is_credit, payment_updated_at, payment_source,
  locked_by, lock_expires_at, version, is_hidden, cancel_reason,
  parent_order_id, updated_at
) ON public.orders TO authenticated;
```

> [!WARNING]
> Зміна статусу відбувається виключно через RPC `change_order_status` (з правами SECURITY DEFINER).

## 2. Обов'язкові поля для статусів (`status_required_fields`)
Таблиця для декларативних перевірок (що має бути заповнено для переходу).

```sql
CREATE TABLE public.status_required_fields (
  id serial PRIMARY KEY,
  status text NOT NULL,
  required_table text NOT NULL,
  required_columns text[] NOT NULL
);

INSERT INTO public.status_required_fields (status, required_table, required_columns) VALUES
('MEASUREMENT_SCHEDULING', 'order_contacts', '{phone, full_name}'),
('MEASUREMENT_SCHEDULING', 'order_addresses', '{city, street}');
```

## 3. Матриця дозволених переходів (`status_transitions`)

```sql
CREATE TABLE public.status_transitions (
  id serial PRIMARY KEY,
  from_status text NOT NULL,
  to_status text NOT NULL,
  allowed_roles text[] NOT NULL
);

-- Приклад (див. order_stages_and_pause_rules.md для повного графа)
INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
('MEASUREMENT_SCHEDULING', 'MEASUREMENT_SCHEDULED', '{SUPER_ADMIN, REGION_MANAGER, DISPATCHER}'),
('MEASUREMENT_SCHEDULING', 'PAUSED', '{SUPER_ADMIN, REGION_MANAGER, DISPATCHER}'),
('MEASUREMENT_SCHEDULING', 'CANCELLED', '{SUPER_ADMIN, REGION_MANAGER, DISPATCHER}');
```

## 4. Фінальна RPC-функція (`change_order_status`)

> [!IMPORTANT]
> Це **фінальна** версія функції. Уся логіка "Активностей" (дати продзвону, коментарі) винесена в окрему таблицю `order_activities` (Етап 2.8) і не стосується машини станів. Ця функція займається виключно FSM-переходами.

```sql
CREATE OR REPLACE FUNCTION public.change_order_status(
  p_order_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_current_status text;
  v_is_incomplete boolean;
  v_role text;
  v_target_status text;
  v_req record;
  v_check_query text;
  v_is_valid boolean;
BEGIN
  -- 1. Lock record & get data
  SELECT status, is_incomplete INTO v_current_status, v_is_incomplete 
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
  
  v_role := public.get_user_role();
  v_target_status := p_new_status;
  
  IF v_current_status = p_new_status THEN
    RETURN;
  END IF;

  -- 2. Resume from PAUSED
  IF v_current_status = 'PAUSED' AND p_new_status = 'RESUME' THEN
    SELECT previous_status INTO v_target_status FROM public.orders WHERE id = p_order_id;
    IF v_target_status IS NULL THEN
      SELECT CASE WHEN order_type = 'BY_DRAWING' THEN 'ENGINEERING_DESIGN' ELSE 'MEASUREMENT_SCHEDULING' END 
      INTO v_target_status FROM public.orders WHERE id = p_order_id;
    END IF;
  ELSE
    -- 3. Check transition exists (SUPER_ADMIN bypasses)
    IF v_role != 'SUPER_ADMIN' AND NOT EXISTS (
      SELECT 1 FROM public.status_transitions 
      WHERE from_status = v_current_status AND to_status = p_new_status AND v_role = ANY(allowed_roles)
    ) THEN
      RAISE EXCEPTION 'Transition from % to % not allowed for role %', v_current_status, p_new_status, v_role;
    END IF;
  END IF;

  -- 4. is_incomplete guard
  IF v_is_incomplete = true AND v_target_status IN ('MEASUREMENT_SCHEDULED', 'ENGINEERING_NESTING') THEN
    RAISE EXCEPTION 'Cannot transition: Order is incomplete. Please fill all required fields.';
  END IF;

  -- 5. Check required fields dynamically (skip for PAUSED/CANCELLED)
  IF v_target_status NOT IN ('PAUSED', 'CANCELLED') THEN
    FOR v_req IN SELECT * FROM public.status_required_fields WHERE status = v_target_status LOOP
      v_check_query := format(
        'SELECT EXISTS(SELECT 1 FROM public.%I WHERE order_id = $1 AND %I IS NOT NULL)', 
        v_req.required_table, v_req.required_columns[1]
      );
      EXECUTE v_check_query INTO v_is_valid USING p_order_id;
      IF NOT v_is_valid THEN
        RAISE EXCEPTION 'Required field % in % is missing', v_req.required_columns[1], v_req.required_table;
      END IF;
    END LOOP;
  END IF;

  -- 6. Update order
  UPDATE public.orders 
  SET status = v_target_status,
      previous_status = CASE 
        WHEN v_target_status = 'PAUSED' THEN v_current_status 
        ELSE previous_status
      END,
      entered_measurement_pool_at = CASE 
        WHEN v_target_status = 'MEASUREMENT_SCHEDULING' THEN COALESCE(entered_measurement_pool_at, now())
        ELSE entered_measurement_pool_at 
      END
  WHERE id = p_order_id;
  
  -- 7. Log status history
  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, changed_by, source, reason
  ) VALUES (
    p_order_id, v_current_status, v_target_status, auth.uid(), 
    COALESCE(current_setting('app.source', true), 'UI'), 
    p_reason
  );
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
