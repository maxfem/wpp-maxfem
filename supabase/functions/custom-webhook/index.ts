/**
 * Custom Webhook Handler
 *
 * Recebe webhooks customizados de sistemas externos e dispara automações.
 * URL: https://<project>.supabase.co/functions/v1/custom-webhook?webhook_id=<id>
 */

import { createClient } from "npm:@supabase/supabase-js";
import { emitWebhookEvent } from "../_shared/automation-emitters.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const webhookId = url.searchParams.get("webhook_id");

    if (!webhookId) {
      return new Response(
        JSON.stringify({ error: "Missing webhook_id parameter. Use ?webhook_id=<your-webhook-id>" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar configuração do webhook
    const { data: webhookConfig, error: webhookError } = await supabase
      .from("webhook_configs")
      .select("*")
      .eq("webhook_id", webhookId)
      .eq("is_active", true)
      .maybeSingle();

    if (webhookError || !webhookConfig) {
      console.error("[custom-webhook] Webhook not found or inactive:", webhookId);
      return new Response(
        JSON.stringify({ error: "Webhook not found or inactive" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validar secret se configurado
    if (webhookConfig.secret) {
      const providedSecret = req.headers.get("x-webhook-secret");
      if (providedSecret !== webhookConfig.secret) {
        console.error("[custom-webhook] Invalid secret for webhook:", webhookId);
        return new Response(
          JSON.stringify({ error: "Invalid webhook secret" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Parsear payload
    const contentType = req.headers.get("content-type") || "";
    let payload: Record<string, any> = {};

    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      payload = Object.fromEntries(formData.entries());
    } else {
      payload = { raw: await req.text() };
    }

    console.log(`[custom-webhook] Received webhook ${webhookId}:`, JSON.stringify(payload).slice(0, 200));

    // Resolver customer_id se fornecido
    let customerId: string | undefined;

    if (payload.customer_id) {
      customerId = payload.customer_id;
    } else if (payload.email || payload.phone || payload.document) {
      // Tentar encontrar cliente por email, phone ou document
      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("tenant_id", webhookConfig.tenant_id)
        .or(
          [
            payload.email ? `email.eq.${payload.email}` : null,
            payload.phone ? `phone.eq.${payload.phone}` : null,
            payload.document ? `document.eq.${payload.document}` : null,
          ]
            .filter(Boolean)
            .join(",")
        )
        .limit(1)
        .maybeSingle();

      if (customer) {
        customerId = customer.id;
        console.log(`[custom-webhook] Resolved customer_id: ${customerId}`);
      }
    }

    // Registrar recebimento
    await supabase.from("webhook_logs").insert({
      tenant_id: webhookConfig.tenant_id,
      webhook_id: webhookId,
      payload,
      customer_id: customerId || null,
      status: "received",
      received_at: new Date().toISOString(),
    });

    // Emitir evento de automação
    await emitWebhookEvent(
      supabase,
      webhookConfig.tenant_id,
      webhookId,
      payload,
      customerId
    );

    console.log(`[custom-webhook] Processed webhook ${webhookId} successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        webhook_id: webhookId,
        customer_id: customerId || null,
        message: "Webhook received and automations triggered",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[custom-webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
