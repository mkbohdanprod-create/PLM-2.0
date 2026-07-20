import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Обробка CORS preflight запитів
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    console.log("AppSheet Webhook Received Payload:", payload)

    // Валідація payload
    const { task_id, new_status, timestamp, lat, lng, comment, idempotency_key } = payload;
    
    if (!task_id || !new_status || !idempotency_key) {
        throw new Error("Missing required fields: task_id, new_status, idempotency_key");
    }

    // Створюємо клієнт з правами Service Role, щоб обійти RLS і виконати захищену RPC
    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Виклик RPC
    const { data, error } = await supabaseAdmin.rpc('appsheet_webhook_update', {
      p_idempotency_key: idempotency_key,
      p_task_id: task_id,
      p_new_status: new_status,
      p_lat: lat || null,
      p_lng: lng || null,
      p_comment: comment || null,
      p_timestamp: timestamp || new Date().toISOString()
    })

    if (error) {
      console.error("RPC Error:", error)
      throw error
    }

    return new Response(
      JSON.stringify({ message: "Webhook processed successfully", result: data }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      },
    )
  } catch (error) {
    console.error("Webhook Error:", error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400 
      },
    )
  }
})
