import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_API_VERSION = "2025-01";
const PAGE_LIMIT = 250; // máximo permitido pelo Shopify REST

interface ShopifyConfig {
  shop_domain: string;
  access_token: string;
  api_version?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const tenantId = body.tenant_id;
    const phase: "customers" | "orders" | "all" = body.phase || "all";
    const maxPages: number = body.max_pages || 50;
    const sinceId: string | null = body.since_id || null;
    const startPageInfo: string | null = body.page_info || null;
    // Limite de tempo INTERNO pra cortar antes do timeout do Supabase (150s).
    // Reservamos 20s pra finalizar (recalc + update integrations).
    const deadline = Date.now() + (body.deadline_ms || 130_000);

    if (!tenantId) {
      return jsonError(400, "tenant_id required");
    }

    const { data: integration } = await supabase
      .from("integrations")
      .select("config, is_active, sync_settings")
      .eq("tenant_id", tenantId)
      .eq("provider", "shopify")
      .maybeSingle();

    if (!integration?.is_active) {
      return jsonError(400, "Shopify não conectado pra esse tenant");
    }

    const cfg = integration.config as unknown as ShopifyConfig;
    if (!cfg?.shop_domain || !cfg?.access_token) {
      return jsonError(400, "Credenciais Shopify ausentes (shop_domain/access_token)");
    }

    const apiVersion = cfg.api_version || DEFAULT_API_VERSION;
    const baseUrl = `https://${cfg.shop_domain}/admin/api/${apiVersion}`;

    await supabase
      .from("integrations")
      .update({ sync_status: "syncing", sync_error: null, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("provider", "shopify");

    const stats = {
      customers_inserted: 0,
      customers_updated: 0,
      customers_merged: 0,
      orders_inserted: 0,
      orders_updated: 0,
      pages_fetched: 0,
      errors: [] as string[],
      next_page_info: null as string | null,
      done: true,
      phase,
    };

    if (phase === "customers" || phase === "all") {
      const r = await syncCustomers(supabase, tenantId, baseUrl, cfg.access_token, stats, maxPages, sinceId, startPageInfo, deadline);
      stats.next_page_info = r.nextPageInfo;
      stats.done = r.done;
    }

    if ((phase === "orders" || phase === "all") && stats.done) {
      const r = await syncOrders(supabase, tenantId, baseUrl, cfg.access_token, stats, maxPages, sinceId, phase === "orders" ? startPageInfo : null, deadline);
      stats.next_page_info = r.nextPageInfo;
      stats.done = r.done;
      stats.phase = "orders";
    }

    // Recalcula só quando terminou (evita custo a cada batch).
    if (stats.done) {
      const { error: recalcErr } = await supabase.rpc("recalc_customer_metrics", { _tenant_id: tenantId });
      if (recalcErr) stats.errors.push(`recalc: ${recalcErr.message}`);
    }

    await supabase
      .from("integrations")
      .update({
        sync_status: stats.errors.length > 0 ? "error" : "idle",
        sync_error: stats.errors.length > 0 ? stats.errors.join(" | ").slice(0, 500) : null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("provider", "shopify");

    return jsonOk(stats);
  } catch (err: any) {
    console.error("shopify-sync error:", err);
    await supabase
      .from("integrations")
      .update({ sync_status: "error", sync_error: String(err.message || err).slice(0, 500), updated_at: new Date().toISOString() })
      .eq("tenant_id", body?.tenant_id || "00000000-0000-0000-0000-000000000000")
      .eq("provider", "shopify");
    return jsonError(500, err.message || String(err));
  }
});

async function syncCustomers(
  supabase: any,
  tenantId: string,
  baseUrl: string,
  accessToken: string,
  stats: any,
  maxPages: number,
  sinceId: string | null,
  startPageInfo: string | null,
  deadline: number,
): Promise<{ nextPageInfo: string | null; done: boolean }> {
  let pageInfo: string | null = startPageInfo;
  let pageCount = 0;

  while (pageCount < maxPages) {
    if (Date.now() >= deadline) {
      return { nextPageInfo: pageInfo, done: false };
    }
    pageCount++;
    stats.pages_fetched++;

    const url = pageInfo
      ? `${baseUrl}/customers.json?limit=${PAGE_LIMIT}&page_info=${encodeURIComponent(pageInfo)}`
      : sinceId
        ? `${baseUrl}/customers.json?limit=${PAGE_LIMIT}&since_id=${sinceId}`
        : `${baseUrl}/customers.json?limit=${PAGE_LIMIT}`;

    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": accessToken, Accept: "application/json" },
    });

    if (!res.ok) {
      const txt = await res.text();
      stats.errors.push(`customers page ${pageCount}: HTTP ${res.status} ${txt.slice(0, 100)}`);
      break;
    }

    const data = await res.json();
    const customers = data.customers || [];

    if (customers.length === 0) return { nextPageInfo: null, done: true };

    // Manda página inteira pra RPC do Postgres que faz upsert + merge JSONB em
    // uma única transação. Evita N+1 queries + estouro de memória da edge fn.
    const payload = customers.map((c: any) => {
      const email = (c.email || "").trim().toLowerCase() || null;
      const phone = normalizePhone(c.phone || c.default_address?.phone);
      const addr = c.default_address || {};
      return {
        email,
        phone,
        name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || email || "Cliente Shopify",
        custom_attributes: {
          shopify_id: c.id,
          source: "shopify",
          city: addr.city,
          state: addr.province_code || addr.province,
          country: addr.country_code || addr.country,
          zipcode: addr.zip,
          birthday: c.birthday,
          marketing_consent: String(c.accepts_marketing === true),
          shopify_tags: c.tags,
          shopify_total_spent: c.total_spent,
          shopify_orders_count: c.orders_count,
          shopify_state: c.state,
          synced_at: new Date().toISOString(),
        },
      };
    });

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("upsert_shopify_customers", {
      _tenant_id: tenantId,
      _customers: payload,
    });
    if (rpcErr) {
      stats.errors.push(`upsert page ${pageCount}: ${rpcErr.message?.slice(0, 120)}`);
    } else if (rpcRes) {
      stats.customers_inserted += rpcRes.inserted || 0;
      stats.customers_updated += rpcRes.updated || 0;
      stats.customers_merged += rpcRes.merged || 0;
    }

    const linkHeader = res.headers.get("link") || res.headers.get("Link");
    pageInfo = extractPageInfo(linkHeader);
    if (!pageInfo) return { nextPageInfo: null, done: true };
  }
  return { nextPageInfo: pageInfo, done: pageInfo === null };
}

async function syncOrders(
  supabase: any,
  tenantId: string,
  baseUrl: string,
  accessToken: string,
  stats: any,
  maxPages: number,
  sinceId: string | null,
  startPageInfo: string | null,
  deadline: number,
): Promise<{ nextPageInfo: string | null; done: boolean }> {
  let pageInfo: string | null = startPageInfo;
  let pageCount = 0;

  while (pageCount < maxPages) {
    if (Date.now() >= deadline) {
      return { nextPageInfo: pageInfo, done: false };
    }
    pageCount++;
    stats.pages_fetched++;

    const url = pageInfo
      ? `${baseUrl}/orders.json?limit=${PAGE_LIMIT}&page_info=${encodeURIComponent(pageInfo)}`
      : sinceId
        ? `${baseUrl}/orders.json?limit=${PAGE_LIMIT}&status=any&since_id=${sinceId}`
        : `${baseUrl}/orders.json?limit=${PAGE_LIMIT}&status=any`;

    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": accessToken, Accept: "application/json" },
    });

    if (!res.ok) {
      const txt = await res.text();
      stats.errors.push(`orders page ${pageCount}: HTTP ${res.status} ${txt.slice(0, 100)}`);
      break;
    }

    const data = await res.json();
    const orders = data.orders || [];

    if (orders.length === 0) return { nextPageInfo: null, done: true };

    const payload = orders.map((o: any) => {
      const email = (o.email || o.customer?.email || "").trim().toLowerCase() || null;
      const phone = normalizePhone(o.phone || o.customer?.phone);
      const items = (o.line_items || []).map((li: any) => ({
        name: li.title || li.name, qty: li.quantity, price: li.price, sku: li.sku,
      }));
      return {
        external_id: `shopify_${o.id}`,
        order_number: String(o.order_number ?? o.number ?? o.name ?? o.id),
        total: Number(o.total_price || 0),
        status: mapShopifyStatus(o.financial_status, o.fulfillment_status),
        status_alias: o.financial_status || o.fulfillment_status || "unknown",
        mapped_status: mapShopifyStatus(o.financial_status, o.fulfillment_status),
        created_at: o.created_at,
        updated_at_ext: o.updated_at,
        tracking_code: o.fulfillments?.[0]?.tracking_number || null,
        tracking_url: o.fulfillments?.[0]?.tracking_url || null,
        carrier: o.fulfillments?.[0]?.tracking_company || null,
        items_summary: items,
        payment_summary: {
          gateway: o.gateway,
          payment_method: o.payment_gateway_names?.[0],
          subtotal: o.subtotal_price,
          total: o.total_price,
          currency: o.currency,
          financial_status: o.financial_status,
          shipping: o.total_shipping_price_set?.shop_money?.amount,
        },
        utm_source: o.source_name === "web" ? null : o.source_name,
        coupon_code: o.discount_codes?.[0]?.code || null,
        // Pra resolver/criar customer
        customer_email: email,
        customer_phone: phone,
        customer_shopify_id: o.customer?.id ? String(o.customer.id) : null,
        customer_name: o.customer
          ? `${o.customer.first_name || ""} ${o.customer.last_name || ""}`.trim() || email || "Cliente Shopify"
          : email || "Cliente Shopify",
      };
    });

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("upsert_shopify_orders", {
      _tenant_id: tenantId,
      _orders: payload,
    });
    if (rpcErr) {
      stats.errors.push(`upsert ord page ${pageCount}: ${rpcErr.message?.slice(0, 120)}`);
    } else if (rpcRes) {
      stats.orders_inserted += rpcRes.orders_inserted || 0;
      stats.orders_updated += rpcRes.orders_updated || 0;
      stats.customers_inserted += rpcRes.customers_inserted || 0;
    }

    const linkHeader = res.headers.get("link") || res.headers.get("Link");
    pageInfo = extractPageInfo(linkHeader);
    if (!pageInfo) return { nextPageInfo: null, done: true };
  }
  return { nextPageInfo: pageInfo, done: pageInfo === null };
}

function extractPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Formato: <https://...page_info=XXX>; rel="next", <...>; rel="previous"
  const matches = linkHeader.split(",");
  for (const m of matches) {
    const relMatch = m.match(/rel="(\w+)"/);
    if (relMatch && relMatch[1] === "next") {
      const urlMatch = m.match(/<([^>]+)>/);
      if (urlMatch) {
        const u = new URL(urlMatch[1]);
        return u.searchParams.get("page_info");
      }
    }
  }
  return null;
}

function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = String(p).replace(/\D/g, "");
  if (!digits) return null;
  // Shopify retorna E.164 (ex: +5511999999999) → guardamos só dígitos
  return digits;
}

function mapShopifyStatus(financial: string | null, fulfillment: string | null): string {
  // Prioriza fulfillment quando entregue/enviado, senão financial.
  // Mapeia pra status canônicos usados pelo recalc_customer_metrics (blocklist).
  if (fulfillment === "fulfilled" || fulfillment === "delivered") return "delivered";
  if (fulfillment === "partial" || fulfillment === "shipped") return "shipped";
  if (financial === "paid") return "paid";
  if (financial === "refunded" || financial === "partially_refunded") return "refunded";
  if (financial === "voided") return "cancelled";
  if (financial === "pending" || financial === "authorized") return "pending";
  return financial || fulfillment || "unknown";
}

function jsonOk(body: any) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
