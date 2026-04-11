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
    return null; // Return null instead of throwing to allow partial sync
  }

  return res.json();
}

async function yampiGetAll(alias: string, path: string, token: string, secret: string, limit = 50) {
  const allData: any[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await yampiGet(alias, path, token, secret, { page: String(page), limit: String(limit) });
    allData.push(...(res.data || []));
    totalPages = res.meta?.pagination?.total_pages || 1;
    page++;
    // Rate limit
    if (page <= totalPages) await new Promise(r => setTimeout(r, 200));
  }

  return allData;
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
    const syncSettings = integration.sync_settings as any;
    const { alias, user_token, user_secret_key } = config;

    if (!alias || !user_token || !user_secret_key) {
      return new Response(JSON.stringify({ error: "Credenciais Yampi incompletas" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as syncing
    await supabase.from("integrations")
      .update({ sync_status: "syncing", sync_error: null })
      .eq("id", integration.id);

    let customersSynced = 0;
    let ordersSynced = 0;
    let cartsSynced = 0;

    try {
      // ===== SYNC CUSTOMERS =====
      if (syncSettings?.customers !== false) {
        console.log("Syncing customers from Yampi...");
        const customers = await yampiGetAll(alias, "customers", user_token, user_secret_key);

        for (const c of customers) {
          const phone = c.phone?.full_number || c.spreadsheet?.data?.phone || null;
          const email = c.email || null;
          const name = c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Cliente";

          // Upsert by phone or email
          const existing = phone
            ? await supabase.from("customers").select("id").eq("tenant_id", tenant_id).eq("phone", phone).maybeSingle()
            : email
              ? await supabase.from("customers").select("id").eq("tenant_id", tenant_id).eq("email", email).maybeSingle()
              : { data: null };

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

          if (existing?.data?.id) {
            await supabase.from("customers").update(customerData).eq("id", existing.data.id);
          } else {
            await supabase.from("customers").insert(customerData);
          }
          customersSynced++;
        }
        console.log(`Synced ${customersSynced} customers`);
      }

      // ===== SYNC ORDERS =====
      if (syncSettings?.orders !== false) {
        console.log("Syncing orders from Yampi...");
        const orders = await yampiGetAll(alias, "orders", user_token, user_secret_key);

        for (const o of orders) {
          // Find customer by yampi customer_id
          const { data: customer } = await supabase
            .from("customers")
            .select("id")
            .eq("tenant_id", tenant_id)
            .contains("custom_attributes", { yampi_id: o.customer_id })
            .maybeSingle();

          if (!customer) continue;

          // Check if order already exists
          const { data: existingOrder } = await supabase
            .from("orders")
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq("external_id", `yampi_${o.id}`)
            .maybeSingle();

          const statusMap: Record<string, string> = {
            waiting_payment: "pending",
            paid: "paid",
            invoiced: "invoiced",
            shipped: "shipped",
            delivered: "delivered",
            cancelled: "cancelled",
            refunded: "refunded",
          };

          const orderStatus = o.status?.data?.alias || "pending";
          const mappedStatus = statusMap[orderStatus] || orderStatus;

          // Determine if Pix pending
          const isPix = o.payments?.data?.some((p: any) =>
            p.payment_method?.alias === "pix" && p.status !== "paid"
          );

          const orderData: any = {
            tenant_id,
            customer_id: customer.id,
            external_id: `yampi_${o.id}`,
            total: o.value_total || 0,
            status: mappedStatus,
            mapped_status: isPix ? "pix_pending" : mappedStatus,
          };

          if (existingOrder) {
            await supabase.from("orders").update(orderData).eq("id", existingOrder.id);
          } else {
            await supabase.from("orders").insert(orderData);
          }
          ordersSynced++;
        }
        console.log(`Synced ${ordersSynced} orders`);
      }

      // ===== SYNC ABANDONED CARTS =====
      if (syncSettings?.abandoned_carts !== false) {
        console.log("Syncing abandoned carts from Yampi...");
        try {
          const carts = await yampiGetAll(alias, "checkout/carts", user_token, user_secret_key);

          for (const cart of carts) {
            if (!cart.customer_id) continue;

            const { data: customer } = await supabase
              .from("customers")
              .select("id, custom_attributes")
              .eq("tenant_id", tenant_id)
              .contains("custom_attributes", { yampi_id: cart.customer_id })
              .maybeSingle();

            if (!customer) continue;

            // Store abandoned cart info as a custom attribute
            const existingAttrs = (customer.custom_attributes as any) || {};
            const cartValue = cart.totalizers?.total || 0;
            const cartUrl = cart.simulate_url || cart.unauth_simulate_url || "";

            await supabase.from("customers").update({
              custom_attributes: {
                ...existingAttrs,
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

      return new Response(JSON.stringify({
        success: true,
        customers_synced: customersSynced,
        orders_synced: ordersSynced,
        carts_synced: cartsSynced,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (syncErr) {
      const errMsg = String(syncErr);
      console.error("Sync error:", errMsg);
      await supabase.from("integrations").update({
        sync_status: "failed",
        sync_error: errMsg,
      }).eq("id", integration.id);

      return new Response(JSON.stringify({ error: errMsg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (err) {
    console.error("yampi-sync error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
