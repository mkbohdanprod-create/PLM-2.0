const fs = require('fs');
const oldMigration = fs.readFileSync('c:/hhgh/PLM module/supabase/migrations/20260717055339_wave3_measurement_installation_regressions.sql', 'utf8');
const lines = oldMigration.split(/\r?\n/);
const start = lines.findIndex(l => l.includes('CREATE OR REPLACE FUNCTION public.change_order_status('));
const end = lines.findIndex((l, i) => i > start && l.trim() === '$function$;');
let funcBody = lines.slice(start, end + 1).join('\n');

const routingLogic = `
  -- Автоматична маршрутизація для Хвилі 5 (Доставки)
  IF v_current_status = 'PRODUCTION_COMPLETED' AND p_new_status IN ('DELIVERY_SCHEDULING', 'READY_FOR_PICKUP') THEN
     IF (SELECT delivery_method FROM public.orders WHERE id = p_order_id) = 'PICKUP' THEN
         p_new_status := 'READY_FOR_PICKUP';
         v_target_status := 'READY_FOR_PICKUP';
     ELSE
         p_new_status := 'DELIVERY_SCHEDULING';
         v_target_status := 'DELIVERY_SCHEDULING';
     END IF;
  END IF;

  IF v_current_status = 'DELIVERY_IN_TRANSIT' AND p_new_status IN ('INSTALLATION_SCHEDULING', 'COMPLETED') THEN
     IF (SELECT order_type FROM public.orders WHERE id = p_order_id) = 'NO_INSTALLATION' THEN
         p_new_status := 'COMPLETED';
         v_target_status := 'COMPLETED';
     ELSE
         p_new_status := 'INSTALLATION_SCHEDULING';
         v_target_status := 'INSTALLATION_SCHEDULING';
     END IF;
  END IF;
`;

funcBody = funcBody.replace('  v_target_status := p_new_status;', '  v_target_status := p_new_status;\n' + routingLogic + '\n');

const triggerSql = `
-- 9. Trigger: Auto CALL activity on DELIVERY_SCHEDULING
CREATE OR REPLACE FUNCTION public.trg_auto_call_delivery()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'DELIVERY_SCHEDULING' AND OLD.status != 'DELIVERY_SCHEDULING' THEN
    INSERT INTO public.order_activities (order_id, type, title, planned_at, assigned_to_role, status)
    VALUES (NEW.id, 'CALL', 'Зателефонувати для планування доставки', now() + interval '4 hours', 'DISPATCHER', 'PENDING');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_call_delivery ON public.orders;
CREATE TRIGGER trigger_auto_call_delivery
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_call_delivery();
`;

let finalFile = fs.readFileSync('c:/hhgh/PLM module/supabase/migrations/20260717102559_wave5_delivery_stage.sql', 'utf8');
finalFile += '\n\n-- 8. UPDATE change_order_status\n' + funcBody + '\n\n' + triggerSql;
fs.writeFileSync('c:/hhgh/PLM module/supabase/migrations/20260717102559_wave5_delivery_stage.sql', finalFile);
console.log('Migration updated.');
