/**
 * WhatsApp Archive Conversation
 *
 * Marca conversa como arquivada e dispara automação conversation_archived
 * POST /whatsapp-archive-conversation
 * Body: { tenant_id, customer_id, reason? }
 */

import { createClient } from "npm:@supabase/supabase-js";
import { emitConversationArchived } from "../_shared/automation-emitters.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { tenant_id, customer_id, phone, reason } = await req.json();

    if (!tenant_id || (!customer_id && !phone)) {
      return new Response(
        JSON.stringify({ error: "tenant_id and (customer_id or phone) are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let resolvedCustomerId = customer_id;
    let resolvedPhone = phone;

    // Resolver customer_id se só phone foi fornecido
    if (!resolvedCustomerId && phone) {
      const { data: customer } = await supabase
        .from("customers")
        .select("id, phone")
        .eq("tenant_id", tenant_id)
        .eq("phone", phone)
        .single();

      if (customer) {
        resolvedCustomerId = customer.id;
        resolvedPhone = customer.phone;
      } else {
        return new Response(
          JSON.stringify({ error: "Customer not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Resolver phone se só customer_id foi fornecido
    if (!resolvedPhone && resolvedCustomerId) {
      const { data: customer } = await supabase
        .from("customers")
        .select("phone")
        .eq("id", resolvedCustomerId)
        .single();

      if (customer?.phone) {
        resolvedPhone = customer.phone;
      }
    }

    // Marcar mensagens como arquivadas (metadata flag)
    const { error: updateError } = await supabase
      .from("whatsapp_messages")
      .update({
        metadata: supabase.raw(`
          CASE
            WHEN metadata IS NULL THEN '{"archived": true, "archived_at": "${new Date().toISOString()}"}'::jsonb
            ELSE metadata || '{"archived": true, "archived_at": "${new Date().toISOString()}"}'::jsonb
          END
        `),
      })
      .eq("tenant_id", tenant_id)
      .eq("customer_id", resolvedCustomerId)
      .is("metadata->archived", null);

    if (updateError) {
      console.error("[archive] Error updating messages:", updateError);
    }

    // Emitir evento de automação
    await emitConversationArchived(
      supabase,
      tenant_id,
      resolvedCustomerId,
      resolvedPhone || "",
      reason
    );

    console.log(
      `[archive] Conversation archived for customer ${resolvedCustomerId}, automation event emitted`
    );

    return new Response(
      JSON.stringify({
        success: true,
        customer_id: resolvedCustomerId,
        phone: resolvedPhone,
        message: "Conversation archived and automation triggered",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[archive] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
