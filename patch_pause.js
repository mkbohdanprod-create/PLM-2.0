const fs = require('fs');

let func = fs.readFileSync('wave4_activities_triggers.sql', 'utf8');

// We need to inject the order_number fetch and modify the PAUSED logic.
// Find the DECLARE block of change_order_status
func = func.replace(
  /v_days_shifted int := 0;/,
  `v_days_shifted int := 0;
  v_order_number text;`
);

// Fetch order_number
func = func.replace(
  /SELECT status, is_incomplete, previous_status INTO v_current_status, v_is_incomplete, v_previous_status/,
  `SELECT status, is_incomplete, previous_status, order_number INTO v_current_status, v_is_incomplete, v_previous_status, v_order_number`
);

// Modify the PAUSED block
func = func.replace(
  /IF p_planned_call_date IS NOT NULL THEN\s+PERFORM public\.create_activity\(p_order_id, 'CALL', p_planned_call_date - interval '1 day', 'Контроль паузи', COALESCE\(p_call_comment, 'Автоматичне нагадування по паузі'\), 'DISPATCHER'\);\s+END IF;/g,
  `IF p_planned_call_date IS NOT NULL THEN
      PERFORM public.create_activity(p_order_id, 'CALL', p_planned_call_date - interval '1 day', 'Контроль паузи', COALESCE(p_call_comment, 'Автоматичне нагадування по паузі'), 'DISPATCHER');
    ELSE
      PERFORM public.create_activity(p_order_id, 'CALL', now() + interval '3 days', 'Уточнити дату повернення з паузи для замовлення ' || v_order_number, 'Сирота-пауза (без дати)', 'DISPATCHER');
    END IF;`
);

fs.writeFileSync('wave4_activities_triggers_patch.sql', func);
