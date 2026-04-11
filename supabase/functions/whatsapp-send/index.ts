import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      phone, message, tenant_id, customer_id,
      template_name, template_language, template_components,
      media_type, media_url, filename,
    } = body;

    if (!phone || !tenant_id) {
      return new Response(JSON.stringify({ error: "phone and tenant_id are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isMember } = await supabase.rpc("is_tenant_member", {
      _user_id: user.id, _tenant_id: tenant_id,
    });

    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve phone_number_id
    let phoneNumberId = WHATSAPP_PHONE_NUMBER_ID;
    const { data: waAccount } = await supabase
      .from("whatsapp_accounts")
      .select("phone_number_id")
      .eq("tenant_id", tenant_id).eq("is_active", true).limit(1).single();
    if (waAccount?.phone_number_id) phoneNumberId = waAccount.phone_number_id;

    const GRAPH_API = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

    let waPayload: Record<string, unknown>;
    let msgType = "text";
    let content = message || "";
    let savedMediaUrl: string | null = null;

    if (template_name) {
      // Template message
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
    } else if (media_type && media_url) {
      // Media message (image, video, audio, document)
      msgType = media_type;
      savedMediaUrl = media_url;
      content = message || `[${media_type === "image" ? "Imagem" : media_type === "video" ? "Vídeo" : media_type === "audio" ? "Áudio" : "Documento"}]`;

      const mediaPayload: Record<string, unknown> = { link: media_url };
      if (message && media_type !== "audio") mediaPayload.caption = message;
      if (media_type === "document" && filename) mediaPayload.filename = filename;

      waPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: media_type,
        [media_type]: mediaPayload,
      };
    } else {
      // Text message
      waPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: message },
      };
    }

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
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wamid = waResult.messages?.[0]?.id;

    await supabase.from("whatsapp_messages").insert({
      tenant_id,
      customer_id: customer_id || null,
      phone,
      direction: "outbound",
      message_type: msgType,
      content,
      media_url: savedMediaUrl,
      wamid,
      status: "sent",
      template_name: template_name || null,
    });

    return new Response(JSON.stringify({ success: true, wamid }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
