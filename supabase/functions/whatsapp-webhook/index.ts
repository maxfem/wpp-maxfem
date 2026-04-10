import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/** Remove all non-digit chars */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Try to find a customer by phone with multiple format variations */
async function findCustomerByPhone(phone: string, tenantId?: string) {
  const clean = normalizePhone(phone);
  
  // Build variations: raw, +raw, with 55 prefix, without 55 prefix
  const variations = new Set<string>();
  variations.add(clean);
  variations.add(`+${clean}`);
  if (clean.startsWith("55") && clean.length >= 12) {
    variations.add(clean.slice(2)); // without country code
    variations.add(`+${clean.slice(2)}`);
  } else {
    variations.add(`55${clean}`);
    variations.add(`+55${clean}`);
  }

  const orFilter = Array.from(variations).map(v => `phone.eq.${v}`).join(",");
  
  let query = supabase
    .from("customers")
    .select("id, tenant_id, name, phone")
    .or(orFilter)
    .limit(1);
  
  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("findCustomerByPhone error:", error);
  }
  return data?.[0] || null;
}

/** Resolve tenant_id from phone_number_id via whatsapp_accounts table */
async function resolveTenantByPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("whatsapp_accounts")
    .select("tenant_id")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error || !data) {
    console.warn(`[webhook] No whatsapp_account found for phone_number_id=${phoneNumberId}, falling back to first tenant`);
    // Fallback: first tenant (backward compat)
    const { data: tenants } = await supabase.from("tenants").select("id").limit(1);
    return tenants?.[0]?.id || null;
  }
  return data.tenant_id;
}

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
      console.log("[webhook] POST received, body:", JSON.stringify(body).substring(0, 2000));

      const entries = body?.entry;
      if (!entries || !Array.isArray(entries)) {
        console.log("[webhook] No entries in body");
        return new Response("OK", { status: 200 });
      }

      for (const entry of entries) {
        const changes = entry?.changes;
        if (!changes || !Array.isArray(changes)) continue;

        for (const change of changes) {
          const value = change?.value;
          if (!value) continue;

          const phoneNumberId = value.metadata?.phone_number_id;
          console.log("[webhook] phone_number_id:", phoneNumberId);

          // Resolve tenant from phone_number_id
          const tenantId = await resolveTenantByPhoneNumberId(phoneNumberId || "");
          if (!tenantId) {
            console.error("[webhook] Could not resolve tenant for phone_number_id:", phoneNumberId);
            continue;
          }
          console.log("[webhook] Resolved tenant_id:", tenantId);

          // Handle status updates
          if (value.statuses && Array.isArray(value.statuses)) {
            for (const status of value.statuses) {
              const { id: wamid, status: msgStatus } = status;
              console.log("[webhook] Status update:", wamid, "->", msgStatus);
              
              const { error: updateError } = await supabase
                .from("whatsapp_messages")
                .update({ status: msgStatus })
                .eq("wamid", wamid);
              
              if (updateError) {
                console.error("[webhook] Status update error:", updateError);
              }
            }
          }

          // Handle incoming messages
          if (value.messages && Array.isArray(value.messages)) {
            const contact = value.contacts?.[0];

            for (const message of value.messages) {
              const phone = message.from;
              const wamid = message.id;
              const msgType = message.type || "text";

              console.log("[webhook] Incoming message from:", phone, "type:", msgType, "wamid:", wamid);

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

              // Find customer by phone (with normalization)
              let customer = await findCustomerByPhone(phone, tenantId);
              console.log("[webhook] Customer lookup result:", customer ? `found id=${customer.id}` : "not found");

              if (!customer) {
                // Create customer as lead
                const customerName = contact?.profile?.name || phone;
                console.log("[webhook] Creating new customer/lead:", customerName);
                
                const { data: newCustomer, error: createError } = await supabase
                  .from("customers")
                  .insert({
                    name: customerName,
                    phone: phone,
                    tenant_id: tenantId,
                    is_lead: true,
                  })
                  .select("id, tenant_id, name, phone")
                  .single();

                if (createError) {
                  console.error("[webhook] Failed to create customer:", createError);
                  continue;
                }
                customer = newCustomer;
                console.log("[webhook] Created customer:", customer?.id);
              }

              // Save message
              const { error: insertError } = await supabase.from("whatsapp_messages").insert({
                tenant_id: tenantId,
                customer_id: customer!.id,
                phone,
                direction: "inbound",
                message_type: msgType,
                content,
                media_url: mediaUrl || null,
                wamid,
                status: "received",
                metadata: { phone_number_id: phoneNumberId, contact_name: contact?.profile?.name },
              });

              if (insertError) {
                console.error("[webhook] Failed to save message:", insertError);
              } else {
                console.log("[webhook] Message saved successfully from", phone, "content:", content.substring(0, 80));
              }
            }
          }
        }
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("[webhook] Unhandled error:", error);
      return new Response("OK", { status: 200 }); // Always return 200 to Meta
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
