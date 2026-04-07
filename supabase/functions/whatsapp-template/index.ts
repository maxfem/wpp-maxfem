import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const WHATSAPP_BUSINESS_ACCOUNT_ID = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GRAPH_API = `https://graph.facebook.com/v22.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`;

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

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { template_id, tenant_id } = body;

    if (!template_id || !tenant_id) {
      return new Response(JSON.stringify({ error: "template_id and tenant_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify tenant membership
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isMember } = await supabase.rpc("is_tenant_member", {
      _user_id: user.id,
      _tenant_id: tenant_id,
    });

    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch template from DB
    const { data: template, error: fetchError } = await supabase
      .from("message_templates")
      .select("*")
      .eq("id", template_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (fetchError || !template) {
      return new Response(JSON.stringify({ error: "Template not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build Meta API payload
    const components: Record<string, unknown>[] = [];

    // Header component
    if (template.header_type && template.header_type !== "none") {
      const headerComponent: Record<string, unknown> = {
        type: "HEADER",
        format: template.header_type.toUpperCase(),
      };
      if (template.header_type === "text" && template.header_content) {
        headerComponent.text = template.header_content;
      }
      if (["image", "video", "document"].includes(template.header_type) && template.header_content) {
        headerComponent.example = {
          header_handle: [template.header_content],
        };
      }
      components.push(headerComponent);
    }

    // Body component
    const bodyComponent: Record<string, unknown> = {
      type: "BODY",
      text: template.body,
    };

    // Add example values for variables
    const varMatches = template.body.match(/\{\{\d+\}\}/g);
    if (varMatches && varMatches.length > 0) {
      const sampleValues = (template.sample_values as string[]) || [];
      const examples = varMatches.map((_: string, i: number) => sampleValues[i] || `exemplo_${i + 1}`);
      bodyComponent.example = { body_text: [examples] };
    }
    components.push(bodyComponent);

    // Footer component
    if (template.footer) {
      components.push({
        type: "FOOTER",
        text: template.footer,
      });
    }

    // Buttons component
    const buttons = (template.buttons as { type: string; text: string; url?: string; phone_number?: string }[]) || [];
    if (buttons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: buttons.map((btn) => {
          if (btn.type === "URL") {
            return { type: "URL", text: btn.text, url: btn.url };
          }
          if (btn.type === "PHONE_NUMBER") {
            return { type: "PHONE_NUMBER", text: btn.text, phone_number: btn.phone_number };
          }
          return { type: "QUICK_REPLY", text: btn.text };
        }),
      });
    }

    const metaPayload = {
      name: template.name,
      language: template.language,
      category: template.category.toUpperCase(),
      components,
    };

    console.log("Submitting template to Meta:", JSON.stringify(metaPayload, null, 2));

    // Submit to Meta API
    const metaResponse = await fetch(GRAPH_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metaPayload),
    });

    const metaResult = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error("Meta API error:", metaResult);
      return new Response(JSON.stringify({ error: "Meta API error", details: metaResult }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Meta API success:", metaResult);

    // Update template with Meta ID and status
    await supabase
      .from("message_templates")
      .update({
        meta_template_id: metaResult.id,
        status: metaResult.status === "APPROVED" ? "approved" : "pending",
      })
      .eq("id", template_id);

    return new Response(JSON.stringify({ 
      success: true, 
      meta_template_id: metaResult.id,
      status: metaResult.status,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Template submission error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
