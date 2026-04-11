import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Resolve a variable key like "customer.name" or "order.total" from context data
function resolveVariable(key: string, ctx: {
  customer: any;
  order: any;
  campaign: any;
}): string {
  const { customer, order, campaign } = ctx;
  const attrs = customer?.custom_attributes || {};
  const cart = attrs?.abandoned_cart || {};

  switch (key) {
    // Customer fields
    case "customer.name":
      return customer?.name || "Cliente";
    case "customer.first_name":
      return (customer?.name || "Cliente").split(" ")[0];
    case "customer.phone":
      return customer?.phone || "";
    case "customer.email":
      return customer?.email || "";
    case "customer.city":
      return attrs?.city || "";
    case "customer.state":
      return attrs?.state || "";
    case "customer.days_since_order": {
      if (!attrs?.last_order_date) return "-";
      const lastDate = new Date(attrs.last_order_date);
      const diff = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      return String(diff);
    }
    case "customer.last_product":
      return attrs?.last_product || "seu produto favorito";
    case "customer.last_order_value":
      return attrs?.last_order_value ? formatCurrency(attrs.last_order_value) : "-";

    // Cart (abandoned) fields
    case "cart.recovery_url":
      return cart?.recovery_url || "";
    case "cart.value":
      return cart?.value ? formatCurrency(cart.value) : "-";
    case "cart.items_count":
      return String(cart?.items_count || 0);
    case "cart.items_summary":
      return cart?.items_summary || "seus itens selecionados";

    // Order fields
    case "order.number":
      return order?.external_id?.replace("yampi_", "") || order?.id?.slice(0, 8) || "-";
    case "order.total":
      return order?.total ? formatCurrency(order.total) : "-";
    case "order.status":
      return order?.mapped_status || order?.status || "-";
    case "order.tracking_code":
      return order?.tracking_code || "-";
    case "order.delivery_days":
      return order?.delivery_days || "5 a 8";

    // Campaign-level fields (set by campaign creator)
    case "campaign.coupon":
      return campaign?.coupon || "-";
    case "campaign.discount":
      return campaign?.discount || "-";
    case "campaign.product_name":
      return campaign?.product_name || "-";
    case "campaign.product_desc":
      return campaign?.product_desc || "-";
    case "campaign.return_days":
      return campaign?.return_days || "5";

    default:
      return "-";
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Build template components with parameters filled from resolved variables
function buildTemplateComponents(
  variableMappings: string[],
  ctx: { customer: any; order: any; campaign: any },
  bodyVarCount: number,
  hasHeaderVar: boolean,
) {
  const components: any[] = [];

  // Header parameters (if template header has {{1}})
  if (hasHeaderVar) {
    components.push({
      type: "header",
      parameters: [{ type: "text", text: resolveVariable("customer.name", ctx) }],
    });
  }

  // Body parameters
  if (bodyVarCount > 0) {
    const params: any[] = [];
    for (let i = 0; i < bodyVarCount; i++) {
      const key = variableMappings[i] || "customer.name";
      const value = resolveVariable(key, ctx);
      params.push({ type: "text", text: value || "-" });
    }
    components.push({ type: "body", parameters: params });
  }

  return components;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find campaigns ready to send
    const { data: campaigns, error: campErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());

    if (campErr) {
      console.error("Error fetching campaigns:", campErr);
      return new Response(JSON.stringify({ error: campErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!campaigns || campaigns.length === 0) {
      return new Response(JSON.stringify({ message: "No campaigns to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const campaign of campaigns) {
      console.log(`Processing campaign: ${campaign.id} - ${campaign.name}`);

      // Mark as sending to prevent duplicate processing
      const { error: lockErr } = await supabase
        .from("campaigns")
        .update({ status: "sending" })
        .eq("id", campaign.id)
        .eq("status", "scheduled");

      if (lockErr) {
        console.error(`Failed to lock campaign ${campaign.id}:`, lockErr);
        continue;
      }

      let lastError = "";

      try {
        // Get WhatsApp account for this tenant
        const { data: waAccount } = await supabase
          .from("whatsapp_accounts")
          .select("phone_number_id")
          .eq("tenant_id", campaign.tenant_id)
          .eq("is_active", true)
          .limit(1)
          .single();

        const phoneNumberId = waAccount?.phone_number_id || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
        const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");

        if (!phoneNumberId || !accessToken) {
          const errMsg = "Credenciais do WhatsApp não encontradas (phone_number_id ou access_token)";
          console.error(`Campaign ${campaign.id}: ${errMsg}`);
          await supabase.from("campaigns").update({ status: "failed", last_error: errMsg }).eq("id", campaign.id);
          results.push({ campaign_id: campaign.id, error: errMsg });
          continue;
        }

        // Extract template from flow_data
        const flowData = campaign.flow_data as any;
        let templateName: string | null = null;
        let templateLanguage = "pt_BR";

        if (flowData?.nodes) {
          const sendNode = flowData.nodes.find(
            (n: any) => n.data?.nodeType === "sendWhatsApp" && (n.data?.template || n.data?.templateName)
          );
          if (sendNode) {
            templateName = sendNode.data.template || sendNode.data.templateName;
            templateLanguage = sendNode.data.templateLanguage || "pt_BR";
          }
        }

        if (!templateName) {
          const errMsg = "Nenhum template de WhatsApp encontrado no fluxo da campanha";
          console.error(`Campaign ${campaign.id}: ${errMsg}`);
          await supabase.from("campaigns").update({ status: "failed", last_error: errMsg }).eq("id", campaign.id);
          results.push({ campaign_id: campaign.id, error: errMsg });
          continue;
        }

        // Fetch template from DB to detect variables AND get sample_values mappings
        const { data: templateRecord } = await supabase
          .from("message_templates")
          .select("body, header_type, header_content, sample_values")
          .eq("name", templateName)
          .eq("tenant_id", campaign.tenant_id)
          .limit(1)
          .single();

        // Count body variables like {{1}}, {{2}}, etc.
        const bodyVarCount = templateRecord?.body
          ? (templateRecord.body.match(/\{\{\d+\}\}/g) || []).length
          : 0;
        const hasHeaderVar = templateRecord?.header_type === "text" &&
          templateRecord?.header_content?.includes("{{");

        // Get variable mappings from sample_values (e.g. ["customer.name", "order.total"])
        const variableMappings: string[] = (templateRecord?.sample_values as string[]) || [];

        console.log(`Campaign ${campaign.id}: template ${templateName} has ${bodyVarCount} body vars, headerVar=${hasHeaderVar}, mappings=${JSON.stringify(variableMappings)}`);

        // Extract campaign-level variables from actions/flow
        const campaignVars: any = {};
        if (flowData?.nodes) {
          for (const node of flowData.nodes) {
            if (node.data?.coupon) campaignVars.coupon = node.data.coupon;
            if (node.data?.discount) campaignVars.discount = node.data.discount;
            if (node.data?.product_name) campaignVars.product_name = node.data.product_name;
            if (node.data?.product_desc) campaignVars.product_desc = node.data.product_desc;
            if (node.data?.return_days) campaignVars.return_days = node.data.return_days;
          }
        }

        // Determine if we need order data
        const needsOrderData = variableMappings.some((m) => m.startsWith("order."));

        // Get contacts with FULL data (including custom_attributes for Yampi fields)
        let customers: any[] = [];
        if (campaign.list_id) {
          const { data: members } = await supabase
            .from("contact_list_members")
            .select("customer_id, customers(id, name, phone, email, custom_attributes)")
            .eq("list_id", campaign.list_id);
          customers = (members || [])
            .map((m: any) => m.customers)
            .filter((c: any) => c?.phone);
        } else {
          const { data } = await supabase
            .from("customers")
            .select("id, name, phone, email, custom_attributes")
            .eq("tenant_id", campaign.tenant_id)
            .not("phone", "is", null);
          customers = data || [];
        }

        // If templates need order data, fetch latest order for each customer
        let ordersByCustomer = new Map<string, any>();
        if (needsOrderData && customers.length > 0) {
          const customerIds = customers.map((c) => c.id);
          // Fetch most recent order per customer (batch of 500)
          for (let i = 0; i < customerIds.length; i += 500) {
            const batch = customerIds.slice(i, i + 500);
            const { data: orders } = await supabase
              .from("orders")
              .select("id, customer_id, external_id, total, status, mapped_status")
              .eq("tenant_id", campaign.tenant_id)
              .in("customer_id", batch)
              .order("created_at", { ascending: false });

            for (const o of (orders || [])) {
              if (!ordersByCustomer.has(o.customer_id)) {
                ordersByCustomer.set(o.customer_id, o);
              }
            }
          }
          console.log(`Campaign ${campaign.id}: fetched orders for ${ordersByCustomer.size} customers`);
        }

        console.log(`Campaign ${campaign.id}: sending to ${customers.length} contacts, template: ${templateName}`);

        if (customers.length === 0) {
          console.warn(`Campaign ${campaign.id} has no valid recipients`);
          const errMsg = "Nenhum contato válido com telefone encontrado na lista selecionada";
          await supabase
            .from("campaigns")
            .update({ status: "failed", last_error: errMsg })
            .eq("id", campaign.id);

          results.push({
            campaign_id: campaign.id,
            sent: 0,
            failed: 0,
            total: 0,
            status: "failed",
            error: errMsg,
          });
          continue;
        }

        let sentCount = 0;
        let failedCount = 0;

        for (const customer of customers) {
          try {
            // Normalize phone
            let phone = customer.phone.replace(/[\s\-\(\)\+]/g, "");
            if (!phone.startsWith("55") && phone.length <= 11) {
              phone = "55" + phone;
            }

            // Build context for variable resolution
            const ctx = {
              customer,
              order: ordersByCustomer.get(customer.id) || null,
              campaign: campaignVars,
            };

            // Send via Meta Graph API
            const waRes = await fetch(
              `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  to: phone,
                  type: "template",
                  template: {
                    name: templateName,
                    language: { code: templateLanguage },
                    components: buildTemplateComponents(variableMappings, ctx, bodyVarCount, hasHeaderVar),
                  },
                }),
              }
            );

            const waData = await waRes.json();

            if (waData.messages?.[0]?.id) {
              // Save to whatsapp_messages
              await supabase.from("whatsapp_messages").insert({
                tenant_id: campaign.tenant_id,
                customer_id: customer.id,
                phone,
                direction: "outbound",
                message_type: "template",
                template_name: templateName,
                wamid: waData.messages[0].id,
                status: "sent",
                content: `[Template: ${templateName}]`,
              });

              // Save campaign activity
              await supabase.from("campaign_activities").insert({
                tenant_id: campaign.tenant_id,
                campaign_id: campaign.id,
                customer_id: customer.id,
                status: "sent",
                channel: "whatsapp",
                sent_at: new Date().toISOString(),
              });

              sentCount++;
            } else {
              const apiErr = waData?.error?.message || JSON.stringify(waData);
              console.error(`Failed to send to ${phone}: ${apiErr}`);
              lastError = apiErr;
              failedCount++;
            }

            // Rate limiting: 100ms delay between messages
            await new Promise((r) => setTimeout(r, 100));
          } catch (err) {
            console.error(`Error sending to customer ${customer.id}:`, err);
            failedCount++;
          }
        }

        const finalStatus = sentCount > 0 ? "sent" : "failed";
        const errorMsg = finalStatus === "failed"
          ? `Todos os ${failedCount} envios falharam. Último erro: ${lastError}`
          : null;

        // Mark campaign with the real sending outcome
        await supabase
          .from("campaigns")
          .update({ status: finalStatus, last_error: errorMsg })
          .eq("id", campaign.id);

        results.push({
          campaign_id: campaign.id,
          sent: sentCount,
          failed: failedCount,
          total: customers.length,
          status: finalStatus,
        });

        console.log(`Campaign ${campaign.id} completed with status ${finalStatus}: ${sentCount} sent, ${failedCount} failed`);
      } catch (err) {
        const errMsg = `Erro interno: ${String(err)}`;
        console.error(`Error processing campaign ${campaign.id}:`, errMsg);
        await supabase.from("campaigns").update({ status: "failed", last_error: errMsg }).eq("id", campaign.id);
        results.push({ campaign_id: campaign.id, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ processed: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Campaign executor error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
