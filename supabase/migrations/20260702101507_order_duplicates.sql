-- 07_order_duplicates.sql

CREATE OR REPLACE FUNCTION public.check_order_duplicates(
  p_full_name text,
  p_phone text,
  p_city text,
  p_street text,
  p_building text
)
RETURNS TABLE (
  order_id uuid,
  order_number text,
  status text,
  match_type text
) AS $$
DECLARE
  v_phone_norm text;
BEGIN
  -- Normalize input phone
  v_phone_norm := regexp_replace(p_phone, '[^0-9]', '', 'g');

  RETURN QUERY
  SELECT 
    o.id, 
    o.order_number, 
    o.status,
    'PHONE_MATCH'::text as match_type
  FROM public.orders o
  JOIN public.order_contacts c ON o.id = c.order_id
  WHERE c.phone_normalized = v_phone_norm
  
  UNION
  
  SELECT 
    o.id, 
    o.order_number, 
    o.status,
    'ADDRESS_MATCH'::text as match_type
  FROM public.orders o
  JOIN public.order_addresses a ON o.id = a.order_id
  WHERE a.city ILIKE '%' || p_city || '%'
    AND a.street ILIKE '%' || p_street || '%'
    AND a.building ILIKE '%' || p_building || '%';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
