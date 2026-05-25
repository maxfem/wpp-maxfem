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
    const maxPages: number = body.max_pages || 50; // segurança contra loop infinito
    const sinceId: string | null = body.since_id || null;

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
    };

    if (phase === "customers" || phase === "all") {
      await syncCustomers(supabase, tenantId, baseUrl, cfg.access_token, stats, maxPages, sinceId);
    }

    if (phase === "orders" || phase === "all") {
      await syncOrders(supabase, tenantId, baseUrl, cfg.access_token, stats, maxPages, sinceId);
    }

    // Recalcula métricas agregadas — first_order_at, total_orders etc.
    const { error: recalcErr } = await supabase.rpc("recalc_customer_metrics", { _tenant_id: tenantId });
    if (recalcErr) stats.errors.push(`recalc: ${recalcErr.message}`);

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
) {
  let pageInfo: string | null = null;
  let pageCount = 0;

  while (pageCount < maxPages) {
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

    if (customers.length === 0) break;

    for (const c of customers) {
      try {
        const email = (c.email || "").trim().toLowerCase() || null;
        const phone = normalizePhone(c.phone || c.default_address?.phone);
        const name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "Cliente Shopify";
        const addr = c.default_address || {};

        const customAttrs = {
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
        };

        // Dedup: tenta achar por shopify_id → email → phone (nesta ordem)
        let existingId: string | null = null;

        const { data: byShopify } = await supabase
          .from("customers")
          .select("id, custom_attributes")
          .eq("tenant_id", tenantId)
          .filter("custom_attributes->>shopify_id", "eq", String(c.id))
          .maybeSingle();
        if (byShopify) existingId = byShopify.id;

        if (!existingId && email) {
          const { data: byEmail } = await supabase
            .from("customers")
            .select("id, custom_attributes")
            .eq("tenant_id", tenantId)
            .eq("email", email)
            .maybeSingle();
          if (byEmail) {
            existingId = byEmail.id;
            stats.customers_merged++;
          }
        }

        if (!existingId && phone) {
          const { data: byPhone } = await supabase
            .from("customers")
            .select("id, custom_attributes")
            .eq("tenant_id", tenantId)
            .eq("phone", phone)
            .maybeSingle();
          if (byPhone) {
            existingId = byPhone.id;
            stats.customers_merged++;
          }
        }

        if (existingId) {
          // Merge: preserva custom_attributes existentes, sobrescreve campos shopify_*
          const { data: existingFull } = await supabase
            .from("customers")
            .select("custom_attributes")
            .eq("id", existingId)
            .maybeSingle();
          const merged = { ...(existingFull?.custom_attributes || {}), ...customAttrs };
          await supabase
            .from("customers")
            .update({
              name,
              email: email || undefined,
              phone: phone || undefined,
              custom_attributes: merged,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingId);
          stats.customers_updated++;
        } else {
          await supabase.from("customers").insert({
            tenant_id: tenantId,
            name,
            email,
            phone,
            custom_attributes: customAttrs,
          });
          stats.customers_inserted++;
        }
      } catch (err: any) {
        stats.errors.push(`customer ${c.id}: ${err.message}`);
      }
    }

    // Paginação via Link header (Shopify REST)
    const linkHeader = res.headers.get("link") || res.headers.get("Link");
    pageInfo = extractPageInfo(linkHeader);
    if (!pageInfo) break;
  }
}

async function syncOrders(
  supabase: any,
  tenantId: string,
  baseUrl: string,
  accessToken: string,
  stats: any,
  maxPages: number,
  sinceId: string | null,
) {
  let pageInfo: string | null = null;
  let pageCount = 0;

  while (pageCount < maxPages) {
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

    if (orders.length === 0) break;

    for (const o of orders) {
      try {
        // Resolve customer_id na nossa base
        const email = (o.email || o.customer?.email || "").trim().toLowerCase() || null;
        const phone = normalizePhone(o.phone || o.customer?.phone);
        const shopifyCustomerId = o.customer?.id;

        let customerId: string | null = null;

        if (shopifyCustomerId) {
          const { data: byShopify } = await supabase
            .from("customers")
            .select("id")
            .eq("tenant_id", tenantId)
            .filter("custom_attributes->>shopify_id", "eq", String(shopifyCustomerId))
            .maybeSingle();
          if (byShopify) customerId = byShopify.id;
        }
        if (!customerId && email) {
          const { data: byEmail } = await supabase
            .from("customers")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("email", email)
            .maybeSingle();
          if (byEmail) customerId = byEmail.id;
        }
        if (!customerId && phone) {
          const { data: byPhone } = await supabase
            .from("customers")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("phone", phone)
            .maybeSingle();
          if (byPhone) customerId = byPhone.id;
        }

        // Cria customer stub se ainda não existe (pedido sem customer cadastrado)
        if (!customerId && (email || phone)) {
          const stubName = o.customer
            ? `${o.customer.first_name || ""} ${o.customer.last_name || ""}`.trim()
            : (email || "Cliente Shopify");
          const { data: newCust } = await supabase.from("customers").insert({
            tenant_id: tenantId,
            name: stubName || "Cliente Shopify",
            email,
            phone,
            custom_attributes: {
              shopify_id: shopifyCustomerId,
              source: "shopify",
              created_from_order: true,
            },
          }).select("id").maybeSingle();
          if (newCust) {
            customerId = newCust.id;
            stats.customers_inserted++;
          }
        }

        const externalId = `shopify_${o.id}`;
        const orderNumber = String(o.order_number ?? o.number ?? o.name ?? o.id);

        const items = (o.line_items || []).map((li: any) => ({
          name: li.title || li.name,
          qty: li.quantity,
          price: li.price,
          sku: li.sku,
        }));

        const paymentSummary = {
          gateway: o.gateway,
          payment_method: o.payment_gateway_names?.[0],
          subtotal: o.subtotal_price,
          total: o.total_price,
          currency: o.currency,
          financial_status: o.financial_status,
          shipping: o.total_shipping_price_set?.shop_money?.amount,
        };

        const orderRow = {
          tenant_id: tenantId,
          customer_id: customerId,
          external_id: externalId,
          order_number: orderNumber,
          total: Number(o.total_price || 0),
          // Status canônico: usamos o financial_status (paid/pending/refunded/voided) +
          // fulfillment_status (shipped/delivered) combinado.
          status: mapShopifyStatus(o.financial_status, o.fulfillment_status),
          status_alias: o.financial_status || o.fulfillment_status || "unknown",
          mapped_status: mapShopifyStatus(o.financial_status, o.fulfillment_status),
          created_at: o.created_at,
          updated_at: o.updated_at,
          tracking_code: o.fulfillments?.[0]?.tracking_number || null,
          tracking_url: o.fulfillments?.[0]?.tracking_url || null,
          carrier: o.fulfillments?.[0]?.tracking_company || null,
          items_summary: items,
          payment_summary: paymentSummary,
          utm_source: o.source_name === "web" ? null : o.source_name,
          coupon_code: o.discount_codes?.[0]?.code || null,
        };

        // Upsert por external_id (assume UNIQUE(tenant_id, external_id) — confirmar)
        const { data: existing } = await supabase
          .from("orders")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("external_id", externalId)
          .maybeSingle();

        if (existing) {
          await supabase.from("orders").update(orderRow).eq("id", existing.id);
          stats.orders_updated++;
        } else {
          const { error: insErr } = await supabase.from("orders").insert(orderRow);
          if (insErr) {
            stats.errors.push(`order ${o.id}: ${insErr.message}`);
          } else {
            stats.orders_inserted++;
          }
        }
      } catch (err: any) {
        stats.errors.push(`order ${o.id}: ${err.message}`);
      }
    }

    const linkHeader = res.headers.get("link") || res.headers.get("Link");
    pageInfo = extractPageInfo(linkHeader);
    if (!pageInfo) break;
  }
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
