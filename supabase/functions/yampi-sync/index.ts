import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const YAMPI_BASE = "https://api.dooki.com.br/v2";
const PAGES_PER_BATCH = 3; // Max pages fetched per invocation to stay under CPU limit
const ENRICHMENT_BATCH = 5; // Max orders enriched per invocation

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

/** Fetch pages from Yampi starting at `startPage`, up to `maxPages` pages. Extra params merged in. */
async function yampiGetBatch(alias: string, path: string, token: string, secret: string, startPage = 1, maxPages = PAGES_PER_BATCH, limit = 50, extraParams: Record<string, string> = {}) {
  const allData: any[] = [];
  let page = startPage;
  let totalPages = startPage;

  let fetched = 0;
  while (page <= totalPages && fetched < maxPages) {
    const res = await yampiGet(alias, path, token, secret, { page: String(page), limit: String(limit), ...extraParams });
    if (!res) break;
    allData.push(...(res.data || []));
    totalPages = res.meta?.pagination?.total_pages || 1;
    page++;
    fetched++;
    if (page <= totalPages && fetched < maxPages) await new Promise(r => setTimeout(r, 50));
  }

  const hasMore = page <= totalPages;
  console.log(`Fetched ${allData.length} records from ${path} (pages ${startPage}-${page - 1} of ${totalPages})`);
  return { data: allData, nextPage: hasMore ? page : null, totalPages };
}

function normalizeCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const clean = cpf.replace(/\D/g, "");
  return clean.length >= 11 ? clean : null;
}

// ===== PHASE: CUSTOMERS =====
async function syncCustomers(supabase: any, tenant_id: string, config: any, startPage: number) {
  const { alias, user_token, user_secret_key } = config;
  const { data: customers, nextPage } = await yampiGetBatch(alias, "customers", user_token, user_secret_key, startPage, PAGES_PER_BATCH, 50, { sort: "-id" });
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

  console.log(`Phase customers batch: synced ${synced}, nextPage=${nextPage}`);
  return { synced, nextPage };
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

// ===== Helper to fetch all rows from DB =====
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

// ===== PHASE: ORDERS =====
async function syncOrders(supabase: any, tenant_id: string, config: any, startPage: number, lastSyncedAt?: string | null, sortBy: string = "-updated_at") {
  const { alias, user_token, user_secret_key } = config;
  
  // Use date filter for incremental sync (only fetch orders updated since last sync)
  const extraParams: Record<string, string> = { "sort": sortBy };
  if (lastSyncedAt) {
    const sinceDate = new Date(new Date(lastSyncedAt).getTime() - 48 * 60 * 60 * 1000);
    extraParams["updated_at_min"] = sinceDate.toISOString().split("T")[0];
    if (startPage === 1) {
      console.log(`Incremental sync (${sortBy}): orders since ${extraParams["updated_at_min"]}`);
    }
  }
  
  const { data: orders, nextPage } = await yampiGetBatch(alias, "orders?include=shipments,transactions.payment,status,items,customer,pix", user_token, user_secret_key, startPage, PAGES_PER_BATCH, 50, extraParams);

  // Build customer lookup: load all customers in single paginated query (minimal columns)
  const yampiIdToCustomer = new Map<number, { id: string; total_orders: number }>();
  let from = 0;
  while (true) {
    const { data: custs } = await supabase
      .from("customers")
      .select("id, custom_attributes, total_orders")
      .eq("tenant_id", tenant_id)
      .range(from, from + 999);
    if (!custs || custs.length === 0) break;
    for (const c of custs) {
      const yid = (c.custom_attributes as any)?.yampi_id;
      if (yid) yampiIdToCustomer.set(yid, { id: c.id, total_orders: c.total_orders || 0 });
    }
    if (custs.length < 1000) break;
    from += 1000;
  }

  // Check existing orders
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
    let customerEntry = yampiIdToCustomer.get(o.customer_id);

    // Auto-create customer if not found (avoids skipping orders for unsynchronized customers)
    if (!customerEntry) {
      const customerName = o.customer?.data?.name || `${o.customer?.data?.first_name || ""} ${o.customer?.data?.last_name || ""}`.trim() || "Cliente";
      const customerPhone = o.customer?.data?.phone?.full_number || null;
      const customerEmail = o.customer?.data?.email || null;
      const customerCpf = normalizeCpf(o.customer?.data?.cpf);

      if (customerName) {
        // Check if customer already exists by phone or email
        let existingCustomerId: string | null = null;
        if (customerPhone) {
          const { data: byPhone } = await supabase.from("customers").select("id, total_orders").eq("tenant_id", tenant_id).eq("phone", customerPhone).limit(1).maybeSingle();
          if (byPhone) existingCustomerId = byPhone.id;
        }
        if (!existingCustomerId && customerEmail) {
          const { data: byEmail } = await supabase.from("customers").select("id, total_orders").eq("tenant_id", tenant_id).eq("email", customerEmail).limit(1).maybeSingle();
          if (byEmail) existingCustomerId = byEmail.id;
        }

        if (existingCustomerId) {
          // Update existing customer with yampi_id
          await supabase.from("customers").update({
            custom_attributes: { yampi_id: o.customer_id, cpf: o.customer?.data?.cpf },
          }).eq("id", existingCustomerId);
          customerEntry = { id: existingCustomerId, total_orders: 0 };
          yampiIdToCustomer.set(o.customer_id, customerEntry);
          console.log(`Linked existing customer ${existingCustomerId} to yampi_id ${o.customer_id}`);
        } else {
          // Create new customer
          const { data: newCust, error: custErr } = await supabase.from("customers").insert({
            tenant_id,
            name: customerName,
            phone: customerPhone,
            email: customerEmail,
            document: customerCpf,
            custom_attributes: { yampi_id: o.customer_id, cpf: o.customer?.data?.cpf },
          }).select("id").single();

          if (custErr) {
            console.error(`Auto-create customer failed for yampi_id ${o.customer_id}:`, custErr.message);
            continue;
          }
          customerEntry = { id: newCust.id, total_orders: 0 };
          yampiIdToCustomer.set(o.customer_id, customerEntry);
          console.log(`Auto-created customer ${newCust.id} for yampi_id ${o.customer_id}`);
        }
      } else {
        continue;
      }
    }

    const customerId = customerEntry.id;

    const orderStatus = o.status?.data?.alias || "pending";
    const mappedStatus = STATUS_MAP[orderStatus] || orderStatus;
    const txData = o.transactions?.data;
    const txList = Array.isArray(txData) ? txData : (txData ? [txData] : []);
    const isPix = txList.some((tx: any) => tx.payment?.data?.is_pix && !["captured", "paid", "approved"].includes(tx.status));

    const paymentSummary = txList.map((tx: any) => ({
      method: tx.payment?.data?.name || tx.payment?.data?.alias || "N/A",
      alias: tx.payment?.data?.alias || "",
      is_pix: tx.payment?.data?.is_pix || false,
      is_billet: tx.payment?.data?.is_billet || false,
      is_credit_card: tx.payment?.data?.is_credit_card || false,
      status: tx.status || "N/A",
      value: tx.amount || tx.buyer_amount || 0,
      installments: tx.installments || 1,
    }));

    const trackingCode = o.track_code || o.tracking_code || null;
    const trackingUrl = o.track_url || o.tracking_url || null;
    const carrier = o.shipment_service || o.carrier || null;
    let deliveryEstimate: string | null = null;
    if (o.date_delivery) {
      if (typeof o.date_delivery === "object" && o.date_delivery?.date) {
        deliveryEstimate = String(o.date_delivery.date).substring(0, 19);
      } else if (typeof o.date_delivery === "string") {
        deliveryEstimate = o.date_delivery;
      }
    }

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
      mapped_status: isPix && !["paid", "invoiced", "shipped", "on_carriage", "in_transit", "delivered"].includes(mappedStatus) ? "pix_pending" : mappedStatus,
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

  // Enrichment — limited per batch
  const needsEnrichment = orders.filter((o: any) => {
    const status = o.status?.data?.alias || "";
    const hasTracking = o.track_code;
    const txData = o.transactions?.data;
    const hasTransactions = txData && (Array.isArray(txData) ? txData.length > 0 : !!txData.payment);
    return ["shipped", "on_carriage", "in_transit", "invoiced", "paid", "pending", "waiting_payment", "standby"].includes(status) && (!hasTracking || !hasTransactions);
  });

  for (const o of needsEnrichment.slice(0, ENRICHMENT_BATCH)) {
    try {
      const detailRes = await yampiGet(alias, `orders/${o.id}?include=transactions.payment`, user_token, user_secret_key);
      const d = detailRes?.data;
      if (!d) continue;

      const trackCode = d.track_code || null;
      const trackUrl = d.track_url || null;
      const trackCarrier = d.shipment_service || null;

      const txData = d.transactions?.data;
      const txListDetail = Array.isArray(txData) ? txData : (txData ? [txData] : []);
      const detailPayments = txListDetail.map((tx: any) => ({
        method: tx.payment?.data?.name || tx.payment?.data?.alias || "N/A",
        alias: tx.payment?.data?.alias || "",
        is_pix: tx.payment?.data?.is_pix || false,
        is_billet: tx.payment?.data?.is_billet || false,
        is_credit_card: tx.payment?.data?.is_credit_card || false,
        status: tx.status || "N/A",
        value: tx.amount || tx.buyer_amount || 0,
        installments: tx.installments || 1,
      }));

      if (txListDetail.length > 0 && !o.transactions?.data) {
        o.transactions = { data: txListDetail.length === 1 ? txListDetail[0] : txListDetail };
      }

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
        }
      }
    } catch (e) {
      console.error(`[sync] Error fetching order detail ${o.id}:`, e);
    }
  }

  // Insert new orders
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

  // Enqueue automation triggers
  const orderTriggerTypes = [
    "order_created", "order_created_pix", "order_created_boleto", "order_paid",
    "order_rejected_card", "order_approved", "order_delivered", "invoice_issued",
    "return_approved", "first_purchase",
  ];
  const { data: orderAutomations } = await supabase
    .from("campaigns")
    .select("id, trigger_type, start_date, updated_at, created_at")
    .eq("tenant_id", tenant_id)
    .eq("kind", "automation")
    .eq("status", "running")
    .in("trigger_type", orderTriggerTypes);

  if (orderAutomations && orderAutomations.length > 0) {
    let enqueued = 0;
    for (const o of orders) {
      const customerEntry = yampiIdToCustomer.get(o.customer_id);
      if (!customerEntry) continue;
      const customerId = customerEntry.id;
      const orderNum = String(o.number || o.id);

      const orderStatus = o.status?.data?.alias || "pending";
      const txData = o.transactions?.data;
      const txList = Array.isArray(txData) ? txData : (txData ? [txData] : []);
      const tx = txList[0];
      const isPix = tx?.payment?.data?.is_pix || false;
      const isBillet = tx?.payment?.data?.is_billet || false;
      const isCreditCard = tx?.payment?.data?.is_credit_card || false;
      const txStatus = tx?.status || "";
      const paymentAlias = tx?.payment?.data?.alias || "";

      const matchedTriggers: string[] = [];
      // Only fire generic order_created if the order is NOT awaiting Pix/Boleto payment
      const isAwaitingPixOrBoleto = (isPix || isBillet) && txStatus !== "captured" && orderStatus !== "paid" && orderStatus !== "cancelled" && !["approved", "invoiced"].includes(orderStatus);
      if (!isAwaitingPixOrBoleto) {
        matchedTriggers.push("order_created");
      }
      if (isPix && txStatus !== "captured" && orderStatus !== "paid" && orderStatus !== "cancelled") matchedTriggers.push("order_created_pix");
      if (isBillet && txStatus !== "captured" && orderStatus !== "paid" && orderStatus !== "cancelled") matchedTriggers.push("order_created_boleto");

      // Debug log for Pix orders
      if (isPix) {
        console.log(`[DEBUG] Pix order #${orderNum} (yampi ${o.id}): status=${orderStatus}, txStatus=${txStatus}, triggers=${matchedTriggers.join(",")}, rawDate=${o.created_at?.date || o.created_at}`);
      }
      if (orderStatus === "paid" || txStatus === "captured") matchedTriggers.push("order_paid");
      if (isCreditCard && ["refused", "rejected", "cancelled"].includes(txStatus)) matchedTriggers.push("order_rejected_card");
      if (["approved", "invoiced", "paid"].includes(orderStatus)) matchedTriggers.push("order_approved");
      if (["delivered", "entregue"].includes(orderStatus)) matchedTriggers.push("order_delivered");
      if (orderStatus === "invoiced") matchedTriggers.push("invoice_issued");
      if (["returned", "exchanged", "refunded"].includes(orderStatus)) matchedTriggers.push("return_approved");
      if ((orderStatus === "paid" || txStatus === "captured") && customerId) {
        if (customerEntry.total_orders <= 1) matchedTriggers.push("first_purchase");
      }

      for (const automation of orderAutomations) {
        if (!matchedTriggers.includes(automation.trigger_type)) continue;
        // Only enqueue events that happened AFTER the automation was activated
        const activationDate = automation.start_date || automation.created_at;
        // Yampi returns created_at.date as naive São Paulo time — append timezone offset
        const rawOrderDate = o.created_at?.date || o.created_at || "";
        const orderDate = typeof rawOrderDate === "string" && !rawOrderDate.includes("+") && !rawOrderDate.includes("Z")
          ? rawOrderDate.replace(" ", "T") + "-03:00"
          : rawOrderDate;
        if (activationDate && orderDate && new Date(orderDate) < new Date(activationDate)) continue;
        const { error: qErr } = await supabase.from("automation_queue").insert({
          tenant_id,
          campaign_id: automation.id,
          customer_id: customerId,
          trigger_type: automation.trigger_type,
          trigger_data: {
            yampi_order_id: o.id,
            order_number: String(o.number || o.id),
            total: o.value_total || 0,
            payment_method: paymentAlias,
            status: orderStatus,
            pix_qr_code: o.pix?.data?.pix_qr_code || null,
          },
          status: "pending",
          current_node_id: "start",
        });
        if (qErr && !qErr.message?.includes("duplicate")) {
          console.error("Order queue insert error:", qErr.message);
        } else if (!qErr) {
          enqueued++;
        }
      }
    }
    console.log(`Phase orders batch: enqueued ${enqueued} automation triggers`);
  }

  console.log(`Phase orders batch: synced ${synced}, nextPage=${nextPage}`);
  return { synced, nextPage };
}

// ===== PHASE: CARTS =====
async function syncCarts(supabase: any, tenant_id: string, config: any, startPage: number) {
  const { alias, user_token, user_secret_key } = config;
  let synced = 0;

  try {
    const { data: carts, nextPage } = await yampiGetBatch(alias, "checkout/carts", user_token, user_secret_key, startPage);

    // Load customer map in paginated query
    const yampiIdToCustomer = new Map<number, { id: string; custom_attributes: any }>();
    let from = 0;
    while (true) {
      const { data: custs } = await supabase
        .from("customers")
        .select("id, custom_attributes")
        .eq("tenant_id", tenant_id)
        .range(from, from + 999);
      if (!custs || custs.length === 0) break;
      for (const c of custs) {
        const yid = (c.custom_attributes as any)?.yampi_id;
        if (yid) yampiIdToCustomer.set(yid, { id: c.id, custom_attributes: c.custom_attributes });
      }
      if (custs.length < 1000) break;
      from += 1000;
    }

    const { data: automations } = await supabase
      .from("campaigns")
      .select("id, start_date, updated_at")
      .eq("tenant_id", tenant_id)
      .eq("trigger_type", "cart_abandoned")
      .eq("status", "running");

    const activeAutomations = automations || [];

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

      for (const automation of activeAutomations) {
        if (!customer.id) continue;
        // Only enqueue carts created AFTER the automation was activated
        const activationDate = automation.start_date || automation.created_at;
        const cartDate = cart.created_at?.date || cart.created_at || cart.updated_at?.date || cart.updated_at || "";
        if (activationDate && cartDate && new Date(cartDate) < new Date(activationDate)) continue;
        const { error: qErr } = await supabase.from("automation_queue").insert({
          tenant_id,
          campaign_id: automation.id,
          customer_id: customer.id,
          trigger_type: "cart_abandoned",
          trigger_data: { yampi_cart_id: cart.id, value: cartValue, recovery_url: cartUrl },
          status: "pending",
          current_node_id: "start",
        });
        if (qErr && !qErr.message?.includes("duplicate")) {
          console.error("Queue insert error:", qErr.message);
        }
      }

      synced++;
    }

    console.log(`Phase carts batch: synced ${synced}, nextPage=${nextPage}`);
    return { synced, nextPage };
  } catch (cartErr) {
    console.warn("Erro ao sincronizar carrinhos:", cartErr);
    return { synced, nextPage: null };
  }
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
    const { tenant_id, phase = "customers", page_offset = 1, cron = false } = body;

    // CRON MODE — processes in smaller batches too
    if (cron) {
      const { data: integrations } = await supabase
        .from("integrations")
        .select("tenant_id, config, sync_settings, last_synced_at")
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
          const MAX_CRON_PAGES = 1;

          if (syncSettings?.orders !== false) {
            // Pass 1: Newest orders first (catches new Pix/Boleto for automation triggers)
            const newOrdersResult = await syncOrders(supabase, int.tenant_id, cfg, 1, int.last_synced_at, "-id");
            ordersSynced += newOrdersResult.synced;

            // Pass 2: Recently updated orders (catches status changes like shipped, delivered)
            const updatedResult = await syncOrders(supabase, int.tenant_id, cfg, 1, int.last_synced_at, "-updated_at");
            ordersSynced += updatedResult.synced;
          }

          if (syncSettings?.abandoned_carts !== false) {
            let cartPage: number | null = 1;
            let cartPages = 0;
            while (cartPage && cartPages < MAX_CRON_PAGES) {
              const result = await syncCarts(supabase, int.tenant_id, cfg, cartPage);
              cartsSynced += result.synced;
              cartPage = result.nextPage;
              cartPages++;
            }
          }

          // Update last_synced_at after successful sync
          await supabase.from("integrations")
            .update({ last_synced_at: new Date().toISOString(), sync_status: "success", sync_error: null })
            .eq("tenant_id", int.tenant_id)
            .eq("provider", "yampi");

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

    // Auth test on first page of customers
    if (phase === "customers" && page_offset === 1) {
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
    let nextPage: number | null = null;
    let done = false;

    if (phase === "refresh_tracking") {
      const { data: shippedOrders } = await supabase
        .from("orders")
        .select("id, external_id, tracking_code, payment_summary")
        .eq("tenant_id", tenant_id)
        .in("status", ["shipped", "paid", "invoiced"])
        .limit(50);

      const needsRefresh = (shippedOrders || []).filter((o: any) => {
        const noTracking = !o.tracking_code;
        const noPayments = !o.payment_summary || (Array.isArray(o.payment_summary) && o.payment_summary.length === 0);
        return noTracking || noPayments;
      });

      let updated = 0;
      for (const order of needsRefresh.slice(0, ENRICHMENT_BATCH)) {
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
        const result = await syncCustomers(supabase, tenant_id, config, page_offset);
        synced = result.synced;
        nextPage = result.nextPage;
      }
    } else if (phase === "orders") {
      if (syncSettings?.orders !== false) {
        const result = await syncOrders(supabase, tenant_id, config, page_offset, integration.last_synced_at);
        synced = result.synced;
        nextPage = result.nextPage;
      }
    } else if (phase === "carts") {
      if (syncSettings?.abandoned_carts !== false) {
        const result = await syncCarts(supabase, tenant_id, config, page_offset);
        synced = result.synced;
        nextPage = result.nextPage;
      }
    }

    // If no more pages for this phase, mark done for carts (last phase)
    if (!nextPage && phase === "carts") {
      // Calculate RFM scores and sync RFM lists after all data is synced
      try {
        console.log("[rfm] Calculating RFM scores...");
        await supabase.rpc("calculate_rfm_scores", { _tenant_id: tenant_id });
        console.log("[rfm] Syncing RFM lists...");
        await supabase.rpc("sync_rfm_lists", { _tenant_id: tenant_id });
        console.log("[rfm] Done.");
      } catch (rfmErr) {
        console.error("[rfm] Error calculating RFM:", rfmErr);
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
      next_page: nextPage,
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
