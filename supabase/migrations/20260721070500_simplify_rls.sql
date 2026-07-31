-- Спрощення RLS для orders (дозволяємо читати всім, зберігаємо is_hidden)
DROP POLICY IF EXISTS "Orders viewable by region" ON public.orders;

CREATE POLICY "Orders viewable by everyone" 
ON public.orders 
FOR SELECT 
TO authenticated 
USING (is_hidden = false);
