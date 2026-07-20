-- A1
SELECT column_name FROM information_schema.columns 
WHERE table_name='orders' AND column_name='previous_status';

-- A2
SELECT DISTINCT status FROM orders WHERE status LIKE 'PAUSED%';
SELECT DISTINCT from_status, to_status FROM status_transitions 
WHERE from_status='PAUSED' OR to_status='PAUSED';

-- A3
INSERT INTO orders (order_number, client_id, branch_id, order_type, status) VALUES 
  ('TEST-M-IP', (SELECT id FROM clients LIMIT 1), (SELECT id FROM branches LIMIT 1), 'FULL_CYCLE', 'MEASUREMENT_IN_PROGRESS'),
  ('TEST-M-FS', (SELECT id FROM clients LIMIT 1), (SELECT id FROM branches LIMIT 1), 'FULL_CYCLE', 'MEASUREMENT_FINISHED_ON_SITE'),
  ('TEST-M-FL', (SELECT id FROM clients LIMIT 1), (SELECT id FROM branches LIMIT 1), 'FULL_CYCLE', 'MEASUREMENT_FAILED'),
  ('TEST-M-CM', (SELECT id FROM clients LIMIT 1), (SELECT id FROM branches LIMIT 1), 'FULL_CYCLE', 'MEASUREMENT_CANCELED_BY_MEASURER'),
  ('TEST-I-IP', (SELECT id FROM clients LIMIT 1), (SELECT id FROM branches LIMIT 1), 'FULL_CYCLE', 'INSTALLATION_IN_PROGRESS'),
  ('TEST-I-FL', (SELECT id FROM clients LIMIT 1), (SELECT id FROM branches LIMIT 1), 'FULL_CYCLE', 'INSTALLATION_FAILED');

SELECT order_number, status, macro_stage FROM orders WHERE order_number LIKE 'TEST-%';
DELETE FROM orders WHERE order_number LIKE 'TEST-%';

-- A4
-- We will run A4 separately or save the output.
