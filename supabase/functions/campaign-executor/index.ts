import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Build template components with parameters filled from customer data
function buildTemplateComponents(customer: any, bodyVarCount: number, hasHeaderVar: boolean) {
  const components: any[] = [];
  const customerName = customer.name || "Cliente";

  // Header parameters (if template header has {{1}})
  if (hasHeaderVar) {
    components.push({
      type: "header",
      parameters: [{ type: "text", text: customerName }],
    });
  }

  // Body parameters - fill {{1}} with name, rest with empty/default
  if (bodyVarCount > 0) {
    const params: any[] = [];
    for (let i = 0; i < bodyVarCount; i++) {
      // First variable is typically the customer name
      params.push({ type: "text", text: i === 0 ? customerName : "-" });
    }
    components.push({ type: "body", parameters: params });
  }

  return components;
}


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
            // "template" is the API name (e.g. "boas_vindas_01"), "templateName" is the display name
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

        // Fetch template from DB to detect variables
        const { data: templateRecord } = await supabase
          .from("message_templates")
          .select("body, header_type, header_content")
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

        console.log(`Campaign ${campaign.id}: template ${templateName} has ${bodyVarCount} body vars, headerVar=${hasHeaderVar}`);
        // Get contacts
        let customers: any[] = [];
        if (campaign.list_id) {
          const { data: members } = await supabase
            .from("contact_list_members")
            .select("customer_id, customers(id, name, phone)")
            .eq("list_id", campaign.list_id);
          customers = (members || [])
            .map((m: any) => m.customers)
            .filter((c: any) => c?.phone);
        } else {
          const { data } = await supabase
            .from("customers")
            .select("id, name, phone")
            .eq("tenant_id", campaign.tenant_id)
            .not("phone", "is", null);
          customers = data || [];
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
                    components: buildTemplateComponents(customer, bodyVarCount, hasHeaderVar),
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
