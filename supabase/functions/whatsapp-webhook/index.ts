import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function findCustomerByPhone(phone: string, tenantId?: string) {
  const clean = normalizePhone(phone);
  const variations = new Set<string>();
  variations.add(clean);
  variations.add(`+${clean}`);
  if (clean.startsWith("55") && clean.length >= 12) {
    variations.add(clean.slice(2));
    variations.add(`+${clean.slice(2)}`);
  } else {
    variations.add(`55${clean}`);
    variations.add(`+55${clean}`);
  }

  const orFilter = Array.from(variations).map(v => `phone.eq.${v}`).join(",");
  let query = supabase.from("customers").select("id, tenant_id, name, phone").or(orFilter).limit(1);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  if (error) console.error("findCustomerByPhone error:", error);
  return data?.[0] || null;
}

async function resolveTenantByPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("whatsapp_accounts")
    .select("tenant_id")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error || !data) {
    console.warn(`[webhook] No whatsapp_account for phone_number_id=${phoneNumberId}, fallback`);
    const { data: tenants } = await supabase.from("tenants").select("id").limit(1);
    return tenants?.[0]?.id || null;
  }
  return data.tenant_id;
}

/** Download media from Meta Graph API and upload to Supabase Storage */
async function downloadAndStoreMedia(mediaId: string, mimeType: string, tenantId: string): Promise<string | null> {
  try {
    // Step 1: Get the media URL from Meta
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
    });
    if (!metaRes.ok) {
      console.error(`[webhook] Failed to get media URL for ${mediaId}: ${metaRes.status}`);
      return null;
    }
    const metaData = await metaRes.json();
    const downloadUrl = metaData.url;
    if (!downloadUrl) return null;

    // Step 2: Download the actual media
    const mediaRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
    });
    if (!mediaRes.ok) {
      console.error(`[webhook] Failed to download media: ${mediaRes.status}`);
      return null;
    }
    const mediaBlob = await mediaRes.blob();

    // Determine file extension from mime type
    const extMap: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
      "video/mp4": "mp4", "video/3gpp": "3gp",
      "audio/aac": "aac", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/amr": "amr", "audio/ogg": "ogg",
      "application/pdf": "pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    };
    const ext = extMap[mimeType] || "bin";
    const filePath = `${tenantId}/${mediaId}.${ext}`;

    // Step 3: Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("whatsapp-media")
      .upload(filePath, mediaBlob, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error(`[webhook] Storage upload error:`, uploadError);
      return null;
    }

    // Step 4: Get public URL
    const { data: urlData } = supabase.storage.from("whatsapp-media").getPublicUrl(filePath);
    console.log(`[webhook] Media stored: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (err) {
    console.error(`[webhook] downloadAndStoreMedia error:`, err);
    return null;
  }
}

async function propagateStatusToActivity(wamid: string, status: string) {
  const { data: msg } = await supabase
    .from("whatsapp_messages")
    .select("customer_id, tenant_id")
    .eq("wamid", wamid)
    .limit(1)
    .single();

  if (!msg?.customer_id) return;

  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  if (status === "delivered") {
    await supabase.from("campaign_activities").update({ delivered_at: now })
      .eq("customer_id", msg.customer_id).eq("tenant_id", msg.tenant_id)
      .is("delivered_at", null).gte("sent_at", cutoff);
  } else if (status === "read") {
    await supabase.from("campaign_activities").update({ read_at: now })
      .eq("customer_id", msg.customer_id).eq("tenant_id", msg.tenant_id)
      .is("read_at", null).gte("sent_at", cutoff);
  } else if (status === "failed") {
    await supabase.from("campaign_activities").update({ status: "failed" })
      .eq("customer_id", msg.customer_id).eq("tenant_id", msg.tenant_id)
      .eq("status", "pending").gte("sent_at", cutoff);
  }
}

async function markRepliedActivity(customerId: string, tenantId: string) {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  await supabase.from("campaign_activities").update({ replied_at: now })
    .eq("customer_id", customerId).eq("tenant_id", tenantId)
    .is("replied_at", null).gte("sent_at", cutoff);
}

Deno.serve(async (req) => {
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

  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("[webhook] POST received");

      const entries = body?.entry;
      if (!entries || !Array.isArray(entries)) {
        return new Response("OK", { status: 200 });
      }

      for (const entry of entries) {
        const changes = entry?.changes;
        if (!changes || !Array.isArray(changes)) continue;

        for (const change of changes) {
          const value = change?.value;
          if (!value) continue;

          const phoneNumberId = value.metadata?.phone_number_id;
          const tenantId = await resolveTenantByPhoneNumberId(phoneNumberId || "");
          if (!tenantId) {
            console.error("[webhook] Could not resolve tenant for:", phoneNumberId);
            continue;
          }

          // Handle status updates
          if (value.statuses && Array.isArray(value.statuses)) {
            for (const status of value.statuses) {
              const { id: wamid, status: msgStatus } = status;
              await supabase.from("whatsapp_messages").update({ status: msgStatus }).eq("wamid", wamid);
              await propagateStatusToActivity(wamid, msgStatus);
            }
          }

          // Handle incoming messages
          if (value.messages && Array.isArray(value.messages)) {
            const contact = value.contacts?.[0];

            for (const message of value.messages) {
              const phone = message.from;
              const wamid = message.id;
              const msgType = message.type || "text";

              let content = "";
              let mediaUrl: string | null = null;

              switch (msgType) {
                case "text":
                  content = message.text?.body || "";
                  break;
                case "image":
                case "video":
                case "audio":
                case "document": {
                  const mediaData = message[msgType];
                  content = mediaData?.caption || "";
                  const mediaId = mediaData?.id;
                  const mimeType = mediaData?.mime_type || "application/octet-stream";
                  if (mediaId) {
                    mediaUrl = await downloadAndStoreMedia(mediaId, mimeType, tenantId);
                  }
                  // Store filename for documents
                  if (msgType === "document" && mediaData?.filename) {
                    content = content || mediaData.filename;
                  }
                  break;
                }
                case "sticker": {
                  const stickerId = message.sticker?.id;
                  const stickerMime = message.sticker?.mime_type || "image/webp";
                  if (stickerId) {
                    mediaUrl = await downloadAndStoreMedia(stickerId, stickerMime, tenantId);
                  }
                  content = "[Sticker]";
                  break;
                }
                case "reaction":
                  content = message.reaction?.emoji || "";
                  break;
                case "location":
                  content = `📍 ${message.location?.latitude},${message.location?.longitude}`;
                  break;
                default:
                  content = `[${msgType}]`;
              }

              // Find or create customer
              let customer = await findCustomerByPhone(phone, tenantId);
              if (!customer) {
                const customerName = contact?.profile?.name || phone;
                const { data: newCustomer, error: createError } = await supabase
                  .from("customers")
                  .insert({ name: customerName, phone, tenant_id: tenantId, is_lead: true })
                  .select("id, tenant_id, name, phone")
                  .single();
                if (createError) { console.error("[webhook] Create customer error:", createError); continue; }
                customer = newCustomer;
              }

              // Save message with resolved media URL
              await supabase.from("whatsapp_messages").insert({
                tenant_id: tenantId,
                customer_id: customer!.id,
                phone,
                direction: "inbound",
                message_type: msgType === "sticker" ? "image" : msgType,
                content,
                media_url: mediaUrl,
                wamid,
                status: "received",
                metadata: { phone_number_id: phoneNumberId, contact_name: contact?.profile?.name },
              });

              await markRepliedActivity(customer!.id, tenantId);
              console.log(`[webhook] Saved ${msgType} from ${phone}${mediaUrl ? " (with media)" : ""}`);
            }
          }
        }
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("[webhook] Error:", error);
      return new Response("OK", { status: 200 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
