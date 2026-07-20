-- Add DELETE policy to orders table
-- Allows deleting an order if the user has access to its region (same as UPDATE policy)

CREATE POLICY "Orders deletable by region" ON public.orders FOR DELETE
USING (((get_user_allowed_action_regions() IS NULL) OR (( SELECT branches.region_id FROM branches WHERE (branches.id = orders.branch_id)) = ANY (get_user_allowed_action_regions()))));
