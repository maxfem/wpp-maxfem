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

async function yampiGetAll(alias: string, path: string, token: string, secret: string, limit = 100) {
  const allData: any[] = [];
  let page = 1;
  let totalPages = 1;
  const maxPages = 100; // 100 pages * 100 = 10,000

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

async function runSync(supabase: any, tenant_id: string, integration: any) {
  const config = integration.config as any;
  const syncSettings = integration.sync_settings as any;
  const { alias, user_token, user_secret_key } = config;

  let customersSynced = 0;
  let ordersSynced = 0;
  let cartsSynced = 0;

  try {
    // ===== SYNC CUSTOMERS =====
    if (syncSettings?.customers !== false) {
      console.log("Syncing customers from Yampi...");
      const customers = await yampiGetAll(alias, "customers", user_token, user_secret_key);

      // Process in batches of 50
      const batchSize = 50;
      for (let i = 0; i < customers.length; i += batchSize) {
        const batch = customers.slice(i, i + batchSize);
        const phones = batch.map((c: any) => c.phone?.full_number).filter(Boolean);
        const emails = batch.map((c: any) => c.email).filter(Boolean);

        // Fetch existing customers by phone
        const { data: existingByPhone } = phones.length > 0
          ? await supabase.from("customers").select("id, phone, email").eq("tenant_id", tenant_id).in("phone", phones)
          : { data: [] };

        // Fetch existing by email for those without phone match
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

          const customerData: any = {
            tenant_id,
            name,
            phone,
            email,
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

        // Batch insert
        if (toInsert.length > 0) {
          const { error } = await supabase.from("customers").insert(toInsert);
          if (error) console.error("Batch insert error:", error.message);
        }

        // Updates still need to be individual
        for (const u of toUpdate) {
          await supabase.from("customers").update(u.data).eq("id", u.id);
        }

        customersSynced += batch.length;
      }
      console.log(`Synced ${customersSynced} customers`);
    }

    // ===== SYNC ORDERS =====
    if (syncSettings?.orders !== false) {
      console.log("Syncing orders from Yampi...");
      const orders = await yampiGetAll(alias, "orders", user_token, user_secret_key);

      // Get all yampi customer IDs from orders
      const yampiCustomerIds = [...new Set(orders.map((o: any) => o.customer_id).filter(Boolean))];

      // Batch fetch customers that have yampi_id
      const { data: allCustomers } = await supabase
        .from("customers")
        .select("id, custom_attributes")
        .eq("tenant_id", tenant_id);

      const yampiIdToCustomer = new Map<number, string>();
      for (const c of (allCustomers || [])) {
        const attrs = c.custom_attributes as any;
        if (attrs?.yampi_id) yampiIdToCustomer.set(attrs.yampi_id, c.id);
      }

      // Fetch existing orders
      const externalIds = orders.map((o: any) => `yampi_${o.id}`);
      const { data: existingOrders } = externalIds.length > 0
        ? await supabase.from("orders").select("id, external_id").eq("tenant_id", tenant_id).in("external_id", externalIds.slice(0, 1000))
        : { data: [] };
      const existingOrderMap = new Map((existingOrders || []).map((o: any) => [o.external_id, o.id]));

      const statusMap: Record<string, string> = {
        waiting_payment: "pending",
        paid: "paid",
        invoiced: "invoiced",
        shipped: "shipped",
        delivered: "delivered",
        cancelled: "cancelled",
        refunded: "refunded",
      };

      const toInsertOrders: any[] = [];

      for (const o of orders) {
        const customerId = yampiIdToCustomer.get(o.customer_id);
        if (!customerId) continue;

        const orderStatus = o.status?.data?.alias || "pending";
        const mappedStatus = statusMap[orderStatus] || orderStatus;
        const isPix = o.payments?.data?.some((p: any) =>
          p.payment_method?.alias === "pix" && p.status !== "paid"
        );

        const orderData: any = {
          tenant_id,
          customer_id: customerId,
          external_id: `yampi_${o.id}`,
          total: o.value_total || 0,
          status: mappedStatus,
          mapped_status: isPix ? "pix_pending" : mappedStatus,
        };

        const existingId = existingOrderMap.get(`yampi_${o.id}`);
        if (existingId) {
          await supabase.from("orders").update(orderData).eq("id", existingId);
        } else {
          toInsertOrders.push(orderData);
        }
        ordersSynced++;
      }

      // Batch insert new orders
      if (toInsertOrders.length > 0) {
        for (let i = 0; i < toInsertOrders.length; i += 50) {
          const batch = toInsertOrders.slice(i, i + 50);
          const { error } = await supabase.from("orders").insert(batch);
          if (error) console.error("Order batch insert error:", error.message);
        }
      }
      console.log(`Synced ${ordersSynced} orders`);
    }

    // ===== SYNC ABANDONED CARTS =====
    if (syncSettings?.abandoned_carts !== false) {
      console.log("Syncing abandoned carts from Yampi...");
      try {
        const carts = await yampiGetAll(alias, "checkout/carts", user_token, user_secret_key);

        const { data: allCustomers } = await supabase
          .from("customers")
          .select("id, custom_attributes")
          .eq("tenant_id", tenant_id);

        const yampiIdToCustomer = new Map<number, { id: string; custom_attributes: any }>();
        for (const c of (allCustomers || [])) {
          const attrs = c.custom_attributes as any;
          if (attrs?.yampi_id) yampiIdToCustomer.set(attrs.yampi_id, { id: c.id, custom_attributes: attrs });
        }

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
          cartsSynced++;
        }
        console.log(`Synced ${cartsSynced} abandoned carts`);
      } catch (cartErr) {
        console.warn("Erro ao sincronizar carrinhos:", cartErr);
      }
    }

    // Mark success
    await supabase.from("integrations").update({
      sync_status: "success",
      sync_error: null,
      last_synced_at: new Date().toISOString(),
    }).eq("id", integration.id);

    console.log(`Sync complete: ${customersSynced} customers, ${ordersSynced} orders, ${cartsSynced} carts`);
  } catch (syncErr) {
    const errMsg = String(syncErr);
    console.error("Sync error:", errMsg);
    await supabase.from("integrations").update({
      sync_status: "failed",
      sync_error: errMsg,
    }).eq("id", integration.id);
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

    // Verify auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenant_id } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get integration config
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

    if (!alias || !user_token || !user_secret_key) {
      return new Response(JSON.stringify({ error: "Credenciais Yampi incompletas" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Test credentials first
    const testRes = await yampiGet(alias, "customers", user_token, user_secret_key, { limit: "1" });
    if (!testRes) {
      await supabase.from("integrations").update({
        sync_status: "failed",
        sync_error: "Falha na autenticação com a API Yampi. Verifique alias, token e secret key.",
      }).eq("id", integration.id);

      return new Response(JSON.stringify({ error: "Falha na autenticação com a API Yampi. Verifique suas credenciais." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as syncing and return immediately - sync runs in background
    await supabase.from("integrations")
      .update({ sync_status: "syncing", sync_error: null })
      .eq("id", integration.id);

    // Fire and forget - run sync in background
    runSync(supabase, tenant_id, integration).catch(err => {
      console.error("Background sync failed:", err);
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Sincronização iniciada em segundo plano. Acompanhe o status nesta página.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("yampi-sync error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
