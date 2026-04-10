import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;

interface BulkSendRequest {
  tenant_id: string;
  template_id: string;
  customer_ids?: string[];
  list_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    const body: BulkSendRequest = await req.json();
    const { tenant_id, template_id, customer_ids, list_id } = body;

    if (!tenant_id || !template_id) {
      return new Response(JSON.stringify({ error: "tenant_id and template_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!customer_ids?.length && !list_id) {
      return new Response(JSON.stringify({ error: "customer_ids or list_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify tenant membership
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

    // Get template
    const { data: template, error: tplErr } = await supabase
      .from("message_templates")
      .select("*")
      .eq("id", template_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (tplErr || !template) {
      return new Response(JSON.stringify({ error: "Template not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (template.status !== "approved") {
      return new Response(JSON.stringify({ error: "Template must be approved by Meta before bulk sending" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get phone_number_id
    let phoneNumberId = WHATSAPP_PHONE_NUMBER_ID;
    const { data: waAccount } = await supabase
      .from("whatsapp_accounts")
      .select("phone_number_id")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (waAccount?.phone_number_id) {
      phoneNumberId = waAccount.phone_number_id;
    }

    // Resolve customers
    let customers: { id: string; phone: string | null; name: string }[] = [];

    if (list_id) {
      // Get customers from list
      const { data: members } = await supabase
        .from("contact_list_members")
        .select("customer_id")
        .eq("list_id", list_id);

      if (members?.length) {
        const ids = members.map((m) => m.customer_id);
        const { data } = await supabase
          .from("customers")
          .select("id, phone, name")
          .eq("tenant_id", tenant_id)
          .in("id", ids);
        customers = data || [];
      }
    } else if (customer_ids?.length) {
      const { data } = await supabase
        .from("customers")
        .select("id, phone, name")
        .eq("tenant_id", tenant_id)
        .in("id", customer_ids);
      customers = data || [];
    }

    // Filter only customers with phone
    const validCustomers = customers.filter((c) => c.phone?.trim());

    if (validCustomers.length === 0) {
      return new Response(JSON.stringify({ error: "No customers with valid phone numbers found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GRAPH_API = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;
    const results = { sent: 0, failed: 0, errors: [] as string[] };

    // Send to each customer with rate limiting (batch of 10, 1s delay between batches)
    const batchSize = 10;
    for (let i = 0; i < validCustomers.length; i += batchSize) {
      const batch = validCustomers.slice(i, i + batchSize);

      const promises = batch.map(async (customer) => {
        const phone = customer.phone!.replace(/\D/g, "");
        try {
          const waPayload = {
            messaging_product: "whatsapp",
            to: phone,
            type: "template",
            template: {
              name: template.name,
              language: { code: template.language },
              components: [],
            },
          };

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
            console.error(`Failed to send to ${phone}:`, waResult);
            results.failed++;
            results.errors.push(`${customer.name} (${phone}): ${waResult.error?.message || "Unknown error"}`);
            return;
          }

          const wamid = waResult.messages?.[0]?.id;

          // Save message record
          await supabase.from("whatsapp_messages").insert({
            tenant_id,
            customer_id: customer.id,
            phone,
            direction: "outbound",
            message_type: "template",
            content: `[Template: ${template.name}]`,
            wamid,
            status: "sent",
            template_name: template.name,
          });

          results.sent++;
        } catch (err) {
          console.error(`Error sending to ${phone}:`, err);
          results.failed++;
          results.errors.push(`${customer.name} (${phone}): ${String(err)}`);
        }
      });

      await Promise.all(promises);

      // Rate limiting delay between batches
      if (i + batchSize < validCustomers.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: validCustomers.length,
        sent: results.sent,
        failed: results.failed,
        errors: results.errors.slice(0, 10), // Only first 10 errors
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Bulk send error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
