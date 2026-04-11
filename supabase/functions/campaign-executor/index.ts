import { createClient } from "npm:@supabase/supabase-js@2.49.4";

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
          console.error(`Missing WhatsApp credentials for campaign ${campaign.id}`);
          await supabase.from("campaigns").update({ status: "draft" }).eq("id", campaign.id);
          results.push({ campaign_id: campaign.id, error: "Missing WhatsApp credentials" });
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
          console.error(`No template found in flow_data for campaign ${campaign.id}`);
          await supabase.from("campaigns").update({ status: "draft" }).eq("id", campaign.id);
          results.push({ campaign_id: campaign.id, error: "No template in flow" });
          continue;
        }

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
          await supabase
            .from("campaigns")
            .update({ status: "failed" })
            .eq("id", campaign.id);

          results.push({
            campaign_id: campaign.id,
            sent: 0,
            failed: 0,
            total: 0,
            status: "failed",
            error: "No valid recipients",
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
              console.error(`Failed to send to ${phone}:`, JSON.stringify(waData));
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

        // Mark campaign with the real sending outcome
        await supabase
          .from("campaigns")
          .update({ status: finalStatus })
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
        console.error(`Error processing campaign ${campaign.id}:`, err);
        await supabase.from("campaigns").update({ status: "draft" }).eq("id", campaign.id);
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
