import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  // Webhook verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // Incoming messages (POST)
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const entries = body?.entry;
      if (!entries) return new Response("OK", { status: 200 });

      for (const entry of entries) {
        const changes = entry?.changes;
        if (!changes) continue;

        for (const change of changes) {
          const value = change?.value;
          if (!value) continue;

          // Handle status updates
          if (value.statuses) {
            for (const status of value.statuses) {
              const { id: wamid, status: msgStatus } = status;
              const updateData: Record<string, string> = { status: msgStatus };
              if (msgStatus === "delivered") updateData.delivered_at = new Date().toISOString();
              if (msgStatus === "read") updateData.read_at = new Date().toISOString();

              // Update in campaign_activities if exists
              await supabase
                .from("whatsapp_messages")
                .update({ status: msgStatus })
                .eq("wamid", wamid);
            }
          }

          // Handle incoming messages
          if (value.messages) {
            const contact = value.contacts?.[0];
            const phoneNumberId = value.metadata?.phone_number_id;

            for (const message of value.messages) {
              const phone = message.from;
              const wamid = message.id;
              const msgType = message.type || "text";

              let content = "";
              let mediaUrl = "";

              switch (msgType) {
                case "text":
                  content = message.text?.body || "";
                  break;
                case "image":
                case "video":
                case "audio":
                case "document":
                  content = message[msgType]?.caption || "";
                  mediaUrl = message[msgType]?.id || "";
                  break;
                case "reaction":
                  content = message.reaction?.emoji || "";
                  break;
                case "location":
                  content = `${message.location?.latitude},${message.location?.longitude}`;
                  break;
                default:
                  content = JSON.stringify(message[msgType] || {});
              }

              // Find customer by phone
              const { data: customers } = await supabase
                .from("customers")
                .select("id, tenant_id")
                .eq("phone", phone)
                .limit(1);

              // Also try with country code variations
              let customer = customers?.[0];
              if (!customer) {
                const cleanPhone = phone.replace(/\D/g, "");
                const { data: customers2 } = await supabase
                  .from("customers")
                  .select("id, tenant_id")
                  .or(`phone.eq.${cleanPhone},phone.eq.+${cleanPhone},phone.eq.55${cleanPhone},phone.eq.+55${cleanPhone}`)
                  .limit(1);
                customer = customers2?.[0];
              }

              if (!customer) {
                // Find tenant by phone_number_id mapping or use first tenant
                const { data: tenants } = await supabase
                  .from("tenants")
                  .select("id")
                  .limit(1);

                const tenantId = tenants?.[0]?.id;
                if (!tenantId) {
                  console.error("No tenant found");
                  continue;
                }

                // Create customer as lead
                const { data: newCustomer } = await supabase
                  .from("customers")
                  .insert({
                    name: contact?.profile?.name || phone,
                    phone: phone,
                    tenant_id: tenantId,
                    is_lead: true,
                  })
                  .select("id, tenant_id")
                  .single();

                customer = newCustomer;
              }

              if (!customer) {
                console.error("Could not create customer");
                continue;
              }

              // Save message
              await supabase.from("whatsapp_messages").insert({
                tenant_id: customer.tenant_id,
                customer_id: customer.id,
                phone,
                direction: "inbound",
                message_type: msgType,
                content,
                media_url: mediaUrl || null,
                wamid,
                status: "received",
                metadata: { phone_number_id: phoneNumberId, contact_name: contact?.profile?.name },
              });

              console.log(`Message saved from ${phone}: ${content.substring(0, 50)}`);
            }
          }
        }
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response("OK", { status: 200 }); // Always return 200 to Meta
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
