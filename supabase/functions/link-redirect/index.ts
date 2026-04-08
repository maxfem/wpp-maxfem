import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("c");

  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Look up the tracked link
    const { data: link, error } = await supabase
      .from("tracked_links")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !link) {
      return new Response("Link not found", { status: 404 });
    }

    // Record the click
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const userAgent = req.headers.get("user-agent") || "";
    const referer = req.headers.get("referer") || "";

    await supabase.from("link_clicks").insert({
      link_id: link.id,
      ip,
      user_agent: userAgent,
      referer,
    });

    // Update campaign_activities clicked_at if campaign + customer exist
    if (link.campaign_id && link.customer_id) {
      await supabase
        .from("campaign_activities")
        .update({ clicked_at: new Date().toISOString() })
        .eq("campaign_id", link.campaign_id)
        .eq("customer_id", link.customer_id)
        .is("clicked_at", null);
    }

    // Build redirect URL with UTMs
    const redirectUrl = new URL(link.original_url);
    if (link.utm_source) redirectUrl.searchParams.set("utm_source", link.utm_source);
    if (link.utm_medium) redirectUrl.searchParams.set("utm_medium", link.utm_medium);
    if (link.utm_campaign) redirectUrl.searchParams.set("utm_campaign", link.utm_campaign);
    if (link.utm_content) redirectUrl.searchParams.set("utm_content", link.utm_content);

    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl.toString() },
    });
  } catch (err) {
    console.error("link-redirect error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
