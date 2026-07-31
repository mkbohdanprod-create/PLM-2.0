# Хвиля 1: Безпекові дірки та Інкапсуляція

## SQL міграція (`20260716155635_wave1_security_and_rpc.sql`)
- Видалив "сміттєві" переходи `DRAFT` з `status_transitions`.
- `REVOKE UPDATE ON public.orders FROM authenticated` - повна заборона прямого `UPDATE`.
- `GRANT UPDATE (order_number, branch_id, order_type, payment_percent, is_credit, payment_updated_at, payment_source, locked_by, lock_expires_at, version, is_hidden, cancel_reason_text, cancel_reason_id, pause_reason_id, parent_order_id, updated_at, resume_date, external_id, is_incomplete, entered_measurement_pool_at, document_date, base_readiness_date, payment_date, calc_readiness_date, planned_call_date, call_comment) ON public.orders TO authenticated` - доступ тільки до дозволених колонок (без `status` і `previous_status`).
- Створив консолідовану `change_order_status`, яка автоматично логує історію, перевіряє `status_transitions` і працює з `SECURITY DEFINER`.
- Створив `update_order_resume_date` та `hide_order` (soft delete).
- Створив RPC для довідників: `upsert_worker_schedule`, `delete_worker_schedule`, `create_region`, `update_region`, `hide_region`, `create_branch`, `update_branch`, `hide_branch`, `assign_engineer`, `update_engineering_task_status`, `update_role_permissions`, `activate_employee`, `deactivate_employee`, `update_default_filters`.
- Додано `is_hidden` для `regions` та `branches`.
- **Міграція `20260716160300_update_profile_rpc.sql`**: додано поле `default_filters` до `profiles` та створено `update_employee_profile` RPC, що приймає поточні параметри (`is_active`, `color`, `base_lat`, `base_lng`, `allowed_view_regions`, `allowed_action_regions`).

## Фронтенд рефакторинг
- **OrderCard.tsx**: Замінено прямий `.update({ resume_date })` та вставку в `order_activities` на виклик `update_order_resume_date` і передачу `p_planned_call_date` в `change_order_status`. Замінено `.delete()` на `hide_order`.
- **OrdersList.tsx**: Видалено зайвий `console.log("ACTIVITIES DATA FETCHED:")`.
- **WorkerSchedulesPanel.tsx**: Замінено `.delete()` та `.upsert()` на `delete_worker_schedule` і `upsert_worker_schedule`.
- **GlobalRegionsSettings.tsx**: Замінено прямі `.insert()`, `.update()`, `.delete()` на `create_region/branch`, `update_region/branch`, `hide_region/branch`.
- **EngineeringBoard.tsx**: Замінено `.update({ status })` та `.update({ assigned_to })` на `update_engineering_task_status` та `assign_engineer`.
- **ConstructorKanbanBoard.tsx**: Замінено `.update({ status })` на `update_engineering_task_status`.
- **RolesSettings.tsx**: Замінено `.update()` на `update_role_permissions`.
- **EmployeesDirectory.tsx**: Замінено `.update()` на `update_employee_profile`.
- **App.tsx**: Замінено `.update({ default_filters })` на `update_default_filters`.

## Security Check Verification
Тест, який я виконав би (User has to verify on actual setup):
```typescript
const { error } = await supabase.from('orders').update({status:'COMPLETED'}).eq('id', <тестове>);
// error.message: "new row violates row-level security policy for table 'orders'" або Permission Denied.
```

## Наступні кроки (Хвиля 2)
Очікую підтвердження щодо виконання Хвилі 1 перед стартом Хвилі 2.
