import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface PixelEvent {
  type: string;
  url?: string;
  referrer?: string;
  page_title?: string;
  product?: { id?: string; name?: string; price?: number; image?: string; url?: string; variant_id?: string; currency?: string };
  cart?: { value?: number; items?: any[] };
  order?: { id?: string; value?: number; items?: any[] };
  identify?: { email?: string; phone?: string; name?: string; document?: string };
  custom?: Record<string, any>;
  utm?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
  ts?: number;
}

interface Payload {
  key: string;
  visitor_id: string;
  session_key: string;
  events: PixelEvent[];
  user_agent?: string;
}

function normPhone(p?: string): string | null {
  if (!p) return null;
  const d = p.replace(/\D+/g, "");
  return d.length >= 10 ? d : null;
}

function normEmail(e?: string): string | null {
  if (!e) return null;
  const t = e.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Payload;
    if (!body?.key || !body?.visitor_id || !Array.isArray(body.events)) {
      return new Response(JSON.stringify({ error: "invalid payload" }), { status: 400, headers: corsHeaders });
    }

    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id")
      .eq("pixel_public_key", body.key)
      .maybeSingle();

    if (tErr || !tenant) {
      return new Response(JSON.stringify({ error: "invalid key" }), { status: 401, headers: corsHeaders });
    }

    const tenantId = tenant.id as string;
    const visitorId = body.visitor_id;
    const sessionKey = body.session_key;
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const country = req.headers.get("cf-ipcountry") || null;
    const ua = body.user_agent || req.headers.get("user-agent") || null;

    // Upsert visitor
    const firstUtm = body.events.find((e) => e.utm)?.utm || {};
    const identifyEvt = body.events.find((e) => e.type === "identify")?.identify;
    const email = normEmail(identifyEvt?.email);
    const phone = normPhone(identifyEvt?.phone);
    const document = identifyEvt?.document?.replace(/\D+/g, "") || null;

    const visitorPatch: Record<string, any> = {
      tenant_id: tenantId,
      visitor_id: visitorId,
      last_seen_at: new Date().toISOString(),
      user_agent: ua,
      ip,
      country,
    };
    if (email) visitorPatch.email = email;
    if (phone) visitorPatch.phone = phone;
    if (document) visitorPatch.document = document;
    if (firstUtm.source) visitorPatch.utm_source = firstUtm.source;
    if (firstUtm.medium) visitorPatch.utm_medium = firstUtm.medium;
    if (firstUtm.campaign) visitorPatch.utm_campaign = firstUtm.campaign;
    if (firstUtm.content) visitorPatch.utm_content = firstUtm.content;
    if (firstUtm.term) visitorPatch.utm_term = firstUtm.term;

    await supabase
      .from("pixel_visitors")
      .upsert(visitorPatch, { onConflict: "tenant_id,visitor_id" });

    // Insert events
    const rows = body.events.map((e) => ({
      tenant_id: tenantId,
      visitor_id: visitorId,
      session_id: sessionKey,
      event_type: e.type,
      url: e.url || null,
      referrer: e.referrer || null,
      page_title: e.page_title || null,
      product_id: e.product?.id || null,
      product_name: e.product?.name || null,
      product_price: e.product?.price ?? null,
      product_image: e.product?.image || null,
      product_url: e.product?.url || null,
      variant_id: e.product?.variant_id || null,
      currency: e.product?.currency || "BRL",
      cart_value: e.cart?.value ?? e.order?.value ?? null,
      order_id: e.order?.id || null,
      user_agent: ua,
      ip,
      metadata: {
        identify: e.identify || undefined,
        custom: e.custom || undefined,
        cart_items: e.cart?.items || undefined,
        order_items: e.order?.items || undefined,
        utm: e.utm || undefined,
        client_ts: e.ts || undefined,
      },
    }));

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("pixel_events").insert(rows);
      if (insErr) console.error("Insert events error:", insErr);
    }

    // Update session aggregate
    const productEvents = body.events.filter((e) => e.type === "product_view" && e.product?.id);
    const checkoutEvt = body.events.find((e) => e.type === "checkout_started");
    const purchaseEvt = body.events.find((e) => e.type === "purchase");
    const cartEvt = body.events.find((e) => e.type === "add_to_cart" || e.type === "checkout_started");

    const { data: existingSession } = await supabase
      .from("pixel_sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("session_key", sessionKey)
      .maybeSingle();

    const newProducts = productEvents.map((e) => ({
      id: e.product?.id,
      name: e.product?.name,
      price: e.product?.price,
      image: e.product?.image,
      url: e.product?.url,
      at: new Date().toISOString(),
    }));

    const sessionPatch: Record<string, any> = {
      tenant_id: tenantId,
      visitor_id: visitorId,
      session_key: sessionKey,
      last_activity_at: new Date().toISOString(),
      pages_viewed: (existingSession?.pages_viewed || 0) + body.events.filter((e) => e.type === "page_view").length,
    };

    if (newProducts.length > 0) {
      const merged = [...(existingSession?.products_viewed || []), ...newProducts].slice(-20);
      sessionPatch.products_viewed = merged;
    }
    if (cartEvt) {
      sessionPatch.cart_value = cartEvt.cart?.value ?? cartEvt.order?.value ?? null;
      sessionPatch.cart_items = cartEvt.cart?.items || null;
    }
    if (checkoutEvt) {
      sessionPatch.checkout_started = true;
      sessionPatch.checkout_url = checkoutEvt.url || null;
    }
    if (purchaseEvt) {
      sessionPatch.purchased = true;
      sessionPatch.ended = true;
    }

    await supabase
      .from("pixel_sessions")
      .upsert(sessionPatch, { onConflict: "tenant_id,session_key" });

    return new Response(JSON.stringify({ ok: true, count: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("pixel-collect error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
