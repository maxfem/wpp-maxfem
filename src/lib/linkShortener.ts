import { supabase } from "@/integrations/supabase/client";

function generateCode(length = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

interface CreateTrackedLinkParams {
  tenantId: string;
  originalUrl: string;
  campaignId?: string;
  customerId?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmSource?: string;
  utmMedium?: string;
}

export async function createTrackedLink(params: CreateTrackedLinkParams): Promise<string> {
  const code = generateCode();

  const { error } = await supabase.from("tracked_links" as any).insert({
    tenant_id: params.tenantId,
    code,
    original_url: params.originalUrl,
    campaign_id: params.campaignId || null,
    customer_id: params.customerId || null,
    utm_source: params.utmSource || "whatsapp",
    utm_medium: params.utmMedium || "message",
    utm_campaign: params.utmCampaign || null,
    utm_content: params.utmContent || null,
  } as any);

  if (error) {
    console.error("Error creating tracked link:", error);
    throw error;
  }

  return `https://wpp.maxapps.com.br/r/${code}`;
}

/**
 * Replace URLs in a message body with tracked short links.
 */
export async function replaceUrlsWithTrackedLinks(
  body: string,
  params: Omit<CreateTrackedLinkParams, "originalUrl">
): Promise<string> {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  const urls = body.match(urlRegex);
  if (!urls) return body;

  let result = body;
  for (const url of urls) {
    try {
      const shortUrl = await createTrackedLink({ ...params, originalUrl: url });
      result = result.replace(url, shortUrl);
    } catch {
      // Keep original URL if tracking fails
    }
  }
  return result;
}
