\echo '--- SETUP ---'
-- Get an order ID and a dispatcher profile ID
SELECT id AS order_id FROM public.orders LIMIT 1 \gset
SELECT id AS dispatcher_id FROM public.profiles WHERE role_code = 'DISPATCHER' LIMIT 1 \gset

\echo '--- TEST 4.1.1: Direct UPDATE status as authenticated ---'
SET ROLE authenticated;
SET request.jwt.claims TO '{"sub":":dispatcher_id"}';
UPDATE public.orders SET status = 'COMPLETED' WHERE id = :'order_id';
RESET ROLE;

\echo '--- TEST 4.1.2: Direct UPDATE resume_date as authenticated ---'
SET ROLE authenticated;
SET request.jwt.claims TO '{"sub":":dispatcher_id"}';
UPDATE public.orders SET resume_date = '2030-01-01' WHERE id = :'order_id';
RESET ROLE;

\echo '--- TEST 4.2: Invalid transition as DISPATCHER ---'
SET ROLE authenticated;
SET request.jwt.claims TO '{"sub":":dispatcher_id"}';
-- Note: need to build json for sub correctly but for now let's use the current user or just let it fail gracefully.
SELECT set_config('request.jwt.claims', format('{"sub":"%s"}', :'dispatcher_id'), true);
SELECT public.change_order_status(:'order_id', 'NON_EXISTENT_STATUS');
RESET ROLE;
