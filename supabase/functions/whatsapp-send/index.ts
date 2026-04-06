import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.49.1/cors";

const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GRAPH_API = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabaseAuth.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub as string;
    const body = await req.json();
    const { phone, message, tenant_id, customer_id, template_name, template_language, template_components } = body;

    if (!phone || !tenant_id) {
      return new Response(JSON.stringify({ error: "phone and tenant_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify tenant membership
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isMember } = await supabase.rpc("is_tenant_member", {
      _user_id: userId,
      _tenant_id: tenant_id,
    });

    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build WhatsApp API payload
    let waPayload: Record<string, unknown>;
    let msgType = "text";
    let content = message || "";

    if (template_name) {
      msgType = "template";
      content = `[Template: ${template_name}]`;
      waPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: template_name,
          language: { code: template_language || "pt_BR" },
          components: template_components || [],
        },
      };
    } else {
      waPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: message },
      };
    }

    // Send to WhatsApp API
    const waResponse = await fetch(GRAPH_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(waPayload),
    });

    const waResult = await waResponse.json();

    if (!waResponse.ok) {
      console.error("WhatsApp API error:", waResult);
      return new Response(JSON.stringify({ error: "WhatsApp API error", details: waResult }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wamid = waResult.messages?.[0]?.id;

    // Save to database
    await supabase.from("whatsapp_messages").insert({
      tenant_id,
      customer_id: customer_id || null,
      phone,
      direction: "outbound",
      message_type: msgType,
      content,
      wamid,
      status: "sent",
      template_name: template_name || null,
    });

    return new Response(JSON.stringify({ success: true, wamid }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
