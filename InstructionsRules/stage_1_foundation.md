# Етап 1: Фундамент і безпека (Повний SQL для рев'ю)

Цей документ містить точний SQL-код з наших міграцій для ретельного рев'ю RLS та тригерів, а також тест Multi-Tenancy.

> [!NOTE]
> На даному етапі (MVP) RLS-політики та `status_transitions` використовують жорстку перевірку ролей (напр. `REGION_MANAGER`) та функціональну перевірку регіонів. Рішення щодо остаточної моделі доступу (використання масивів `allowed_view_regions` чи збереження функціональних перевірок) відкладене до Етапу 6.

## 1. RLS-політики (profiles та orders)

**Політики для `profiles`:**
```sql
CREATE POLICY "Profiles viewable by everyone" ON profiles 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Profiles editable by SUPER_ADMIN or self" ON profiles 
FOR UPDATE USING (
  auth.uid() = id OR public.get_user_role() = 'SUPER_ADMIN'
);

-- Ця політика дозволяє тригеру реєстрації вставляти профіль
CREATE POLICY "Profiles insertable by trigger" ON profiles 
FOR INSERT WITH CHECK (true);
```

**Політики для `orders` (Multi-Tenancy):**
```sql
CREATE POLICY "Orders viewable by SUPER_ADMIN" ON orders 
FOR SELECT USING (public.get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "Orders editable by SUPER_ADMIN" ON orders 
FOR ALL USING (public.get_user_role() = 'SUPER_ADMIN');

-- Підзапит `is_order_in_user_region` перевіряє, чи філія замовлення належить тому ж регіону, що й філія користувача.
CREATE POLICY "Orders viewable by REGION_MANAGER" ON orders 
FOR SELECT USING (
  public.get_user_role() = 'REGION_MANAGER' AND public.is_order_in_user_region(branch_id)
);

CREATE POLICY "Orders editable by REGION_MANAGER" ON orders 
FOR ALL USING (
  public.get_user_role() = 'REGION_MANAGER' AND public.is_order_in_user_region(branch_id)
);

CREATE POLICY "Orders viewable by BRANCH_MANAGER_DISPATCHER" ON orders 
FOR SELECT USING (
  public.get_user_role() IN ('BRANCH_MANAGER', 'DISPATCHER') AND branch_id = public.get_user_branch()
);

CREATE POLICY "Orders editable by BRANCH_MANAGER_DISPATCHER" ON orders 
FOR ALL USING (
  public.get_user_role() IN ('BRANCH_MANAGER', 'DISPATCHER') AND branch_id = public.get_user_branch()
);
```

## 2. Журнал змін: Тригер `log_changes()`

```sql
CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS trigger AS $$
DECLARE
  v_old_data jsonb := NULL;
  v_new_data jsonb := NULL;
  v_record_id text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id::text;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_record_id := OLD.id::text;
  ELSIF TG_OP = 'INSERT' THEN
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id::text;
  END IF;

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, changed_by, source)
  VALUES (
    TG_TABLE_NAME, 
    v_record_id, 
    TG_OP, 
    v_old_data, 
    v_new_data, 
    auth.uid(), 
    COALESCE(NULLIF(current_setting('app.source', true), ''), 'UI')
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Прив'язка до orders:
CREATE TRIGGER audit_orders_changes
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
```

## 3. Конкурентність: `lock_order()`

Тут ми використовуємо атомарний `UPDATE` з `RETURNING`, щоб уникнути race conditions:

```sql
CREATE OR REPLACE FUNCTION public.lock_order(order_id uuid)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.orders 
  SET 
    locked_by = auth.uid(), 
    lock_expires_at = now() + interval '10 minutes'
  WHERE id = order_id 
    AND (locked_by IS NULL OR lock_expires_at < now())
  RETURNING id INTO v_id;

  RETURN v_id; -- Поверне NULL, якщо замок вже взято іншим користувачем
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 4. Симуляція JWT у тесті Multi-Tenancy

Ось реальний код SQL-файлу `test_rls.sql`, який виконувався через `psql`. Ключовий момент — використання `request.jwt.claim.sub` та `request.jwt.claim.role` для симуляції Supabase Auth.

```sql
-- ... (тут було створення філій та тестового профілю в базі) ...

\echo '--- Test Multi-Tenancy (REGION_MANAGER: Center) ---'

-- Симуляція входу користувача
SET ROLE authenticated;
SET request.jwt.claim.sub TO '11111111-1111-1111-1111-111111111111';
SET request.jwt.claim.role TO 'authenticated';

\echo 'Manager Center sees these orders (Should only be ORD-CENTER-01):'
SELECT order_number FROM public.orders;

\echo 'Count of West orders visible to Center manager (Should be 0):'
SELECT count(*) as count_west_orders FROM public.orders WHERE order_number = 'ORD-WEST-01';

-- Скидання доступу
RESET ROLE;
```

## 5. Приклад Edge Function з передачею `source`

У Supabase (через PostgREST) ми не можемо напряму робити `SET LOCAL` з фронтенду. Тому для зовнішніх систем (Edge Function для MES або AppSheet) ми робимо RPC-функцію:

**У Deno Edge Function:**
```typescript
const { data, error } = await supabase.rpc('update_order_status', {
  p_order_id: '123-uuid',
  p_new_status: 'PRODUCTION_QUEUE',
  p_source: 'MES' // <--- Явно передаємо джерело
});
```

**У базі (RPC):**
```sql
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id uuid, p_new_status text, p_source text DEFAULT 'UI')
RETURNS void AS $$
BEGIN
  -- Встановлюємо локальну змінну транзакції, яку прочитає тригер log_changes()
  PERFORM set_config('app.source', p_source, true);
  
  -- Робимо апдейт. Тригер автоматично підхопить app.source = 'MES'
  UPDATE public.orders SET status = p_new_status WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
