import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const YAMPI_BASE = "https://api.dooki.com.br/v2";

async function yampiGet(alias: string, path: string, token: string, secret: string, params: Record<string, string> = {}) {
  const url = new URL(`${YAMPI_BASE}/${alias}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      "User-Token": token,
      "User-Secret-Key": secret,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Yampi API error ${res.status} on ${path}: ${body}`);
    return null;
  }

  return res.json();
}

async function yampiGetAll(alias: string, path: string, token: string, secret: string, limit = 50, maxPages = 40) {
  const allData: any[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= maxPages) {
    const res = await yampiGet(alias, path, token, secret, { page: String(page), limit: String(limit) });
    if (!res) break;
    allData.push(...(res.data || []));
    totalPages = res.meta?.pagination?.total_pages || 1;
    page++;
    if (page <= totalPages) await new Promise(r => setTimeout(r, 100));
  }

  console.log(`Fetched ${allData.length} records from ${path} (${page - 1} pages)`);
  return allData;
}

function normalizeCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const clean = cpf.replace(/\D/g, "");
  return clean.length >= 11 ? clean : null;
}

// ===== PHASE: CUSTOMERS =====
async function syncCustomers(supabase: any, tenant_id: string, config: any) {
  const { alias, user_token, user_secret_key } = config;
  const customers = await yampiGetAll(alias, "customers", user_token, user_secret_key);
  let synced = 0;

  const batchSize = 50;
  for (let i = 0; i < customers.length; i += batchSize) {
    const batch = customers.slice(i, i + batchSize);
    const phones = batch.map((c: any) => c.phone?.full_number).filter(Boolean);
    const emails = batch.map((c: any) => c.email).filter(Boolean);

    const { data: existingByPhone } = phones.length > 0
      ? await supabase.from("customers").select("id, phone, email").eq("tenant_id", tenant_id).in("phone", phones)
      : { data: [] };

    const { data: existingByEmail } = emails.length > 0
      ? await supabase.from("customers").select("id, phone, email").eq("tenant_id", tenant_id).in("email", emails)
      : { data: [] };

    const phoneMap = new Map((existingByPhone || []).map((c: any) => [c.phone, c.id]));
    const emailMap = new Map((existingByEmail || []).map((c: any) => [c.email, c.id]));

    const toInsert: any[] = [];
    const toUpdate: { id: string; data: any }[] = [];

    for (const c of batch) {
      const phone = c.phone?.full_number || null;
      const email = c.email || null;
      const name = c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Cliente";
      const cpfNormalized = normalizeCpf(c.cpf);

      const customerData: any = {
        tenant_id,
        name,
        phone,
        email,
        document: cpfNormalized,
        custom_attributes: {
          yampi_id: c.id,
          cpf: c.cpf,
          birthday: c.birthday,
          city: c.spreadsheet?.data?.city,
          state: c.spreadsheet?.data?.uf,
          last_order_date: c.spreadsheet?.data?.last_order_date?.date,
          last_order_value: c.spreadsheet?.data?.last_order_value,
        },
      };

      const existingId = (phone && phoneMap.get(phone)) || (email && emailMap.get(email));
      if (existingId) {
        toUpdate.push({ id: existingId, data: customerData });
      } else {
        toInsert.push(customerData);
      }
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from("customers").insert(toInsert);
      if (error) console.error("Batch insert error:", error.message);
    }

    for (const u of toUpdate) {
      await supabase.from("customers").update(u.data).eq("id", u.id);
    }

    synced += batch.length;
  }

  console.log(`Phase customers: synced ${synced}`);
  return synced;
}

// ===== ATTRIBUTION: Link new orders to campaign activities =====
async function attributeConversions(supabase: any, tenant_id: string, orders: { id: string; customer_id: string; total: number }[]) {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  for (const order of orders) {
    const { data: activity } = await supabase
      .from("campaign_activities")
      .select("id")
      .eq("customer_id", order.customer_id)
      .eq("tenant_id", tenant_id)
      .is("converted_at", null)
      .gte("sent_at", cutoff)
      .order("clicked_at", { ascending: false, nullsFirst: false })
      .order("sent_at", { ascending: false })
      .limit(1)
      .single();

    if (activity) {
      await supabase
        .from("campaign_activities")
        .update({
          converted_at: now,
          conversion_value: order.total,
          attribution_order_id: order.id,
        })
        .eq("id", activity.id);
      console.log(`Attribution: order ${order.id} -> activity ${activity.id} (R$${order.total})`);
    }
  }
}

// ===== PHASE: ORDERS =====
async function fetchAllRows(supabase: any, table: string, select: string, filters: Record<string, any>, pageSize = 1000) {
  const allRows: any[] = [];
  let from = 0;
  while (true) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    for (const [k, v] of Object.entries(filters)) {
      query = query.eq(k, v);
    }
    const { data, error } = await query;
    if (error) { console.error(`fetchAllRows ${table} error:`, error.message); break; }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

const STATUS_MAP: Record<string, string> = {
  waiting_payment: "pending",
  paid: "paid",
  invoiced: "invoiced",
  shipped: "shipped",
  on_carriage: "shipped",
  in_transit: "shipped",
  em_transporte: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
  refunded: "refunded",
};

async function syncOrders(supabase: any, tenant_id: string, config: any) {
  const { alias, user_token, user_secret_key } = config;
  const orders = await yampiGetAll(alias, "orders?include=shipments,payments,status,items", user_token, user_secret_key);

  const allCustomers = await fetchAllRows(supabase, "customers", "id, custom_attributes, total_orders", { tenant_id });

  const yampiIdToCustomer = new Map<number, string>();
  for (const c of (allCustomers || [])) {
    const attrs = c.custom_attributes as any;
    if (attrs?.yampi_id) yampiIdToCustomer.set(attrs.yampi_id, c.id);
  }

  const externalIds = orders.map((o: any) => `yampi_${o.id}`);
  const existingOrders: any[] = [];
  for (let i = 0; i < externalIds.length; i += 500) {
    const batch = externalIds.slice(i, i + 500);
    const { data } = await supabase.from("orders").select("id, external_id").eq("tenant_id", tenant_id).in("external_id", batch);
    if (data) existingOrders.push(...data);
  }
  const existingOrderMap = new Map(existingOrders.map((o: any) => [o.external_id, o.id]));

  const toInsertOrders: any[] = [];
  let synced = 0;

  for (const o of orders) {
    const customerId = yampiIdToCustomer.get(o.customer_id);
    if (!customerId) continue;

    const orderStatus = o.status?.data?.alias || "pending";
    const mappedStatus = STATUS_MAP[orderStatus] || orderStatus;
    const isPix = o.payments?.data?.some((p: any) =>
      p.payment_method?.alias === "pix" && p.status !== "paid"
    );

    // Extract tracking/shipping data — Yampi uses track_code/track_url at top level
    const trackingCode = o.track_code || o.tracking_code || null;
    const trackingUrl = o.track_url || o.tracking_url || null;
    const carrier = o.shipment_service || o.carrier || null;
    // delivery_estimate can be a JSON object { date: "...", timezone: "...", timezone_type: 3 }
    let deliveryEstimate: string | null = null;
    if (o.date_delivery) {
      if (typeof o.date_delivery === "object" && o.date_delivery?.date) {
        deliveryEstimate = String(o.date_delivery.date).substring(0, 19);
      } else if (typeof o.date_delivery === "string") {
        deliveryEstimate = o.date_delivery;
      }
    }

    // Extract payment summary
    const paymentSummary = (o.payments?.data || []).map((p: any) => ({
      method: p.payment_method?.name || p.payment_method?.alias || "N/A",
      status: p.status || "N/A",
      value: p.value,
    }));

    // Extract items summary
    const itemsSummary = (o.items?.data || []).slice(0, 10).map((i: any) => ({
      name: i.name || i.sku?.data?.title || "Produto",
      quantity: i.quantity,
      price: i.price,
    }));

    const orderData: any = {
      tenant_id,
      customer_id: customerId,
      external_id: `yampi_${o.id}`,
      total: o.value_total || 0,
      status: mappedStatus,
      mapped_status: isPix ? "pix_pending" : mappedStatus,
      order_number: String(o.number || o.id),
      status_alias: orderStatus,
      tracking_code: trackingCode,
      tracking_url: trackingUrl,
      carrier,
      delivery_estimate: deliveryEstimate,
      payment_summary: paymentSummary,
      items_summary: itemsSummary,
    };

    const existingId = existingOrderMap.get(`yampi_${o.id}`);
    if (existingId) {
      await supabase.from("orders").update(orderData).eq("id", existingId);
    } else {
      toInsertOrders.push(orderData);
    }
    synced++;
  }

  // For orders missing tracking or payment, fetch individual details
  // Include pending/waiting_payment to get payment method (needed for pix/boleto triggers)
  const needsEnrichment = orders.filter((o: any) => {
    const status = o.status?.data?.alias || "";
    const hasTracking = o.track_code;
    const hasPayments = (o.payments?.data || []).length > 0 && o.payments.data.some((p: any) => p.value);
    return ["shipped", "on_carriage", "in_transit", "invoiced", "paid", "pending", "waiting_payment", "standby"].includes(status) && (!hasTracking || !hasPayments);
  });

  for (const o of needsEnrichment.slice(0, 50)) {
    try {
      const detailRes = await yampiGet(alias, `orders/${o.id}?include=payments`, user_token, user_secret_key);
      const d = detailRes?.data;
      if (!d) continue;

      const trackCode = d.track_code || null;
      const trackUrl = d.track_url || null;
      const trackCarrier = d.shipment_service || null;

      // Extract payment from detail if missing
      const detailPayments = (d.payments?.data || []).map((p: any) => ({
        method: p.payment_method?.name || p.payment_method?.alias || "N/A",
        status: p.status || "N/A",
        value: p.value,
        installments: p.installments || 1,
      }));

      const extId = existingOrderMap.get(`yampi_${o.id}`);
      if (extId) {
        const updateData: any = {};
        if (trackCode) {
          updateData.tracking_code = trackCode;
          updateData.tracking_url = trackUrl;
          updateData.carrier = trackCarrier;
        }
        if (detailPayments.length > 0) {
          updateData.payment_summary = detailPayments;
        }
        if (Object.keys(updateData).length > 0) {
          await supabase.from("orders").update(updateData).eq("id", extId);
          console.log(`[sync] Enriched order yampi_${o.id}: tracking=${trackCode}, payments=${detailPayments.length}`);
        }
      }
    } catch (e) {
      console.error(`[sync] Error fetching order detail ${o.id}:`, e);
    }
  }

  if (toInsertOrders.length > 0) {
    for (let i = 0; i < toInsertOrders.length; i += 50) {
      const batch = toInsertOrders.slice(i, i + 50);
      const { data: inserted, error } = await supabase.from("orders").insert(batch).select("id, customer_id, total");
      if (error) {
        console.error("Order batch insert error:", error.message);
      } else if (inserted) {
        await attributeConversions(supabase, tenant_id, inserted);
      }
    }
  }

  // ===== Enqueue order-based automation triggers =====
  // Fetch active automations for order triggers
  const orderTriggerTypes = [
    "order_created", "order_created_pix", "order_created_boleto", "order_paid",
    "order_rejected_card", "order_approved", "order_delivered", "invoice_issued",
    "return_approved", "first_purchase",
  ];
  const { data: orderAutomations } = await supabase
    .from("campaigns")
    .select("id, trigger_type")
    .eq("tenant_id", tenant_id)
    .eq("kind", "automation")
    .eq("status", "running")
    .in("trigger_type", orderTriggerTypes);

  if (orderAutomations && orderAutomations.length > 0) {
    let enqueued = 0;
    for (const o of orders) {
      const customerId = yampiIdToCustomer.get(o.customer_id);
      if (!customerId) continue;

      const orderStatus = o.status?.data?.alias || "pending";
      const payments = o.payments?.data || [];
      const paymentMethod = payments[0]?.payment_method?.alias || "";
      const paymentStatus = payments[0]?.status || "";

      // Determine which triggers this order matches
      const matchedTriggers: string[] = [];

      // order_created — any new order
      matchedTriggers.push("order_created");

      // order_created_pix — Pix payment pending
      if (paymentMethod === "pix" && paymentStatus !== "paid") {
        matchedTriggers.push("order_created_pix");
      }

      // order_created_boleto — Boleto payment pending
      if ((paymentMethod === "boleto" || paymentMethod === "bank_slip") && paymentStatus !== "paid") {
        matchedTriggers.push("order_created_boleto");
      }

      // order_paid — paid orders
      if (orderStatus === "paid" || paymentStatus === "paid") {
        matchedTriggers.push("order_paid");
      }

      // order_rejected_card — card rejected
      if (paymentMethod === "credit_card" && (paymentStatus === "refused" || paymentStatus === "rejected" || paymentStatus === "cancelled")) {
        matchedTriggers.push("order_rejected_card");
      }

      // order_approved — order approved/invoiced
      if (["approved", "invoiced", "paid"].includes(orderStatus)) {
        matchedTriggers.push("order_approved");
      }

      // order_delivered — order delivered
      if (["delivered", "entregue"].includes(orderStatus)) {
        matchedTriggers.push("order_delivered");
      }

      // invoice_issued — NF emitida
      if (orderStatus === "invoiced") {
        matchedTriggers.push("invoice_issued");
      }

      // return_approved — devolução/troca aprovada
      if (["returned", "exchanged", "refunded"].includes(orderStatus)) {
        matchedTriggers.push("return_approved");
      }

      // first_purchase — first order paid
      if ((orderStatus === "paid" || paymentStatus === "paid") && customerId) {
        const cust = allCustomers.find((c: any) => c.id === customerId);
        const totalOrders = (cust as any)?.total_orders ?? 0;
        if (totalOrders <= 1) {
          matchedTriggers.push("first_purchase");
        }
      }

      for (const automation of orderAutomations) {
        if (!matchedTriggers.includes(automation.trigger_type)) continue;
        const { error: qErr } = await supabase.from("automation_queue").insert({
          tenant_id,
          campaign_id: automation.id,
          customer_id: customerId,
          trigger_type: automation.trigger_type,
          trigger_data: {
            yampi_order_id: o.id,
            order_number: String(o.number || o.id),
            total: o.value_total || 0,
            payment_method: paymentMethod,
            status: orderStatus,
          },
          status: "pending",
        });
        if (qErr && !qErr.message?.includes("duplicate")) {
          console.error("Order queue insert error:", qErr.message);
        } else if (!qErr) {
          enqueued++;
        }
      }
    }
    console.log(`Phase orders: enqueued ${enqueued} automation triggers`);
  }

  console.log(`Phase orders: synced ${synced}`);
  return synced;
}

// ===== PHASE: CARTS =====
async function syncCarts(supabase: any, tenant_id: string, config: any) {
  const { alias, user_token, user_secret_key } = config;
  let synced = 0;

  try {
    const carts = await yampiGetAll(alias, "checkout/carts", user_token, user_secret_key);

    const allCustomers = await fetchAllRows(supabase, "customers", "id, custom_attributes", { tenant_id });

    const yampiIdToCustomer = new Map<number, { id: string; custom_attributes: any }>();
    for (const c of (allCustomers || [])) {
      const attrs = c.custom_attributes as any;
      if (attrs?.yampi_id) yampiIdToCustomer.set(attrs.yampi_id, { id: c.id, custom_attributes: attrs });
    }

    const { data: automations } = await supabase
      .from("campaigns")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("trigger_type", "cart_abandoned")
      .eq("status", "running");

    const activeAutomationIds = (automations || []).map((a: any) => a.id);

    for (const cart of carts) {
      if (!cart.customer_id) continue;
      const customer = yampiIdToCustomer.get(cart.customer_id);
      if (!customer) continue;

      const cartValue = cart.totalizers?.total || 0;
      const cartUrl = cart.simulate_url || cart.unauth_simulate_url || "";

      await supabase.from("customers").update({
        custom_attributes: {
          ...(customer.custom_attributes || {}),
          abandoned_cart: {
            yampi_cart_id: cart.id,
            value: cartValue,
            recovery_url: cartUrl,
            items_count: cart.totalizers?.total_items || 0,
            updated_at: new Date().toISOString(),
          },
        },
      }).eq("id", customer.id);

      for (const campaignId of activeAutomationIds) {
        if (!customer.id) continue;
        const { error: qErr } = await supabase.from("automation_queue").insert({
          tenant_id,
          campaign_id: campaignId,
          customer_id: customer.id,
          trigger_type: "cart_abandoned",
          trigger_data: { yampi_cart_id: cart.id, value: cartValue, recovery_url: cartUrl },
          status: "pending",
        });
        if (qErr && !qErr.message?.includes("duplicate")) {
          console.error("Queue insert error:", qErr.message);
        }
      }

      synced++;
    }
  } catch (cartErr) {
    console.warn("Erro ao sincronizar carrinhos:", cartErr);
  }

  console.log(`Phase carts: synced ${synced}, automations enqueued`);
  return synced;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { tenant_id, phase = "customers", cron = false } = body;

    // CRON MODE
    if (cron) {
      const { data: integrations } = await supabase
        .from("integrations")
        .select("tenant_id, config, sync_settings")
        .eq("provider", "yampi")
        .eq("is_active", true);

      if (!integrations || integrations.length === 0) {
        return new Response(JSON.stringify({ message: "No Yampi integrations found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cronResults: any[] = [];
      for (const int of integrations) {
        const cfg = int.config as any;
        if (!cfg?.alias || !cfg?.user_token || !cfg?.user_secret_key) continue;
        const syncSettings = int.sync_settings as any;
        try {
          let ordersSynced = 0;
          let cartsSynced = 0;

          // Sync orders first (triggers pix, boleto, etc.)
          if (syncSettings?.orders !== false) {
            ordersSynced = await syncOrders(supabase, int.tenant_id, cfg);
          }

          // Then sync carts (triggers cart_abandoned)
          if (syncSettings?.abandoned_carts !== false) {
            cartsSynced = await syncCarts(supabase, int.tenant_id, cfg);
          }

          cronResults.push({ tenant_id: int.tenant_id, orders: ordersSynced, carts: cartsSynced });
        } catch (err) {
          console.error(`Cron sync error for tenant ${int.tenant_id}:`, err);
          cronResults.push({ tenant_id: int.tenant_id, error: String(err) });
        }
      }

      return new Response(JSON.stringify({ cron: true, results: cronResults }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integration, error: intErr } = await supabase
      .from("integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "yampi")
      .single();

    if (intErr || !integration) {
      return new Response(JSON.stringify({ error: "Integração Yampi não configurada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = integration.config as any;
    const { alias, user_token, user_secret_key } = config;
    const syncSettings = integration.sync_settings as any;

    if (!alias || !user_token || !user_secret_key) {
      return new Response(JSON.stringify({ error: "Credenciais Yampi incompletas" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (phase === "customers") {
      const testRes = await yampiGet(alias, "customers", user_token, user_secret_key, { limit: "1" });
      if (!testRes) {
        await supabase.from("integrations").update({
          sync_status: "failed",
          sync_error: "Falha na autenticação com a API Yampi.",
        }).eq("id", integration.id);

        return new Response(JSON.stringify({ error: "Falha na autenticação com a API Yampi." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("integrations").update({
        sync_status: "syncing", sync_error: null,
      }).eq("id", integration.id);
    }

    let synced = 0;
    let nextPhase: string | null = null;
    let done = false;

    if (phase === "refresh_tracking") {
      // Refresh tracking AND payment for shipped orders missing data
      const { data: shippedOrders } = await supabase
        .from("orders")
        .select("id, external_id, tracking_code, payment_summary")
        .eq("tenant_id", tenant_id)
        .in("status", ["shipped", "paid", "invoiced"])
        .limit(50);

      // Filter: missing tracking OR empty payment_summary
      const needsRefresh = (shippedOrders || []).filter((o: any) => {
        const noTracking = !o.tracking_code;
        const noPayments = !o.payment_summary || (Array.isArray(o.payment_summary) && o.payment_summary.length === 0);
        return noTracking || noPayments;
      });

      let updated = 0;
      for (const order of needsRefresh) {
        const yampiId = order.external_id?.replace("yampi_", "");
        if (!yampiId) continue;
        try {
          const detailRes = await yampiGet(config.alias, `orders/${yampiId}?include=payments`, config.user_token, config.user_secret_key);
          const d = detailRes?.data;
          if (!d) continue;
          const trackCode = d.track_code || null;
          const trackUrl = d.track_url || null;
          const trackCarrier = d.shipment_service || null;
          const detailPayments = (d.payments?.data || []).map((p: any) => ({
            method: p.payment_method?.name || p.payment_method?.alias || "N/A",
            status: p.status || "N/A",
            value: p.value,
            installments: p.installments || 1,
          }));

          const updateData: any = {};
          if (trackCode) {
            updateData.tracking_code = trackCode;
            updateData.tracking_url = trackUrl;
            updateData.carrier = trackCarrier;
          }
          if (detailPayments.length > 0) {
            updateData.payment_summary = detailPayments;
          }

          console.log(`[refresh] Order ${yampiId}: track_code=${trackCode}, payments=${detailPayments.length}`);
          if (Object.keys(updateData).length > 0) {
            await supabase.from("orders").update(updateData).eq("id", order.id);
            updated++;
          }
        } catch (e) {
          console.error(`[refresh] Error for order ${yampiId}:`, e);
        }
      }

      return new Response(JSON.stringify({ success: true, phase, synced: updated, done: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (phase === "customers") {
      if (syncSettings?.customers !== false) {
        synced = await syncCustomers(supabase, tenant_id, config);
      }
      nextPhase = "orders";
    } else if (phase === "orders") {
      if (syncSettings?.orders !== false) {
        synced = await syncOrders(supabase, tenant_id, config);
      }
      nextPhase = "carts";
    } else if (phase === "carts") {
      if (syncSettings?.abandoned_carts !== false) {
        synced = await syncCarts(supabase, tenant_id, config);
      }
      await supabase.from("integrations").update({
        sync_status: "success",
        sync_error: null,
        last_synced_at: new Date().toISOString(),
      }).eq("id", integration.id);
      done = true;
    }

    return new Response(JSON.stringify({
      success: true,
      phase,
      synced,
      next: nextPhase,
      done,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("yampi-sync error:", err);

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, serviceRoleKey);
      const body = await req.clone().json().catch(() => ({}));
      if (body.tenant_id) {
        await sb.from("integrations").update({
          sync_status: "failed",
          sync_error: String(err),
        }).eq("tenant_id", body.tenant_id).eq("provider", "yampi");
      }
    } catch (_) { /* ignore */ }

    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
