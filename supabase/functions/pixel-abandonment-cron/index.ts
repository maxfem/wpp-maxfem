// Detects abandoned browsing/cart sessions and enqueues automation triggers.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const MIN_IDLE_MIN = 30;
const MAX_IDLE_HOURS = 24;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const now = new Date();
    const minIdle = new Date(now.getTime() - MIN_IDLE_MIN * 60_000).toISOString();
    const maxIdle = new Date(now.getTime() - MAX_IDLE_HOURS * 3_600_000).toISOString();

    const { data: sessions, error } = await supabase
      .from("pixel_sessions")
      .select("*")
      .eq("ended", false)
      .eq("purchased", false)
      .eq("abandonment_processed", false)
      .lt("last_activity_at", minIdle)
      .gt("last_activity_at", maxIdle)
      .not("customer_id", "is", null)
      .limit(500);

    if (error) throw error;

    let enqueued = 0;
    for (const s of sessions || []) {
      const products = Array.isArray(s.products_viewed) ? s.products_viewed : [];
      if (products.length === 0 && !s.checkout_started) {
        await supabase
          .from("pixel_sessions")
          .update({ abandonment_processed: true })
          .eq("id", s.id);
        continue;
      }

      const triggerType = s.checkout_started ? "cart_abandonment_pixel" : "browse_abandonment";
      const lastProduct = products[products.length - 1] || {};

      const triggerData = {
        session_key: s.session_key,
        visitor_id: s.visitor_id,
        products: products.slice(-5),
        last_product: lastProduct,
        cart_value: s.cart_value,
        cart_items: s.cart_items,
        checkout_url: s.checkout_url,
        produto_nome: lastProduct.name,
        produto_url: lastProduct.url,
        produto_imagem: lastProduct.image,
        produto_preco: lastProduct.price,
        carrinho_valor: s.cart_value,
      };

      const { error: qErr } = await supabase
        .from("automation_queue")
        .insert({
          tenant_id: s.tenant_id,
          customer_id: s.customer_id,
          trigger_type: triggerType,
          trigger_data: triggerData,
          status: "pending",
          scheduled_for: new Date().toISOString(),
        });

      if (!qErr || qErr.code === "23505") {
        // Either inserted, or duplicate (already enqueued for this session) — mark processed
        await supabase
          .from("pixel_sessions")
          .update({ abandonment_processed: true })
          .eq("id", s.id);
        if (!qErr) enqueued++;
      } else {
        console.error("queue insert error:", qErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, scanned: sessions?.length || 0, enqueued }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("pixel-abandonment-cron error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
