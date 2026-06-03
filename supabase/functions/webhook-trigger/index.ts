// webhook-trigger — Endpoint público que aceita POST e dispara automation com trigger_type=webhook.
//
// URL: POST https://<project>.supabase.co/functions/v1/webhook-trigger?key=<endpoint_key>
//      (ou maxfem.tech/crm/api/webhook?key=...)
//
// Body JSON:
//   { phone?: "5511...", customer_id?: uuid, email?: "...", ...data }
//
// Resolução de customer:
//   1. Se customer_id vier no body → usa
//   2. Senão, tenta resolver por phone (normalizado) ou email
//   3. Se não achar, ignora (não cria customer)

import { createClient } from "npm:@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(phone: string): string {
  return String(phone || "").replace(/\D/g, "");
}

async function resolveCustomer(tenantId: string, body: any): Promise<string | null> {
  if (body.customer_id) return body.customer_id;

  if (body.phone) {
    const clean = normalizePhone(body.phone);
    const variants = new Set<string>([clean, `+${clean}`]);
    if (clean.startsWith("55") && clean.length >= 12) variants.add(clean.slice(2));
    else variants.add(`55${clean}`);
    const filter = Array.from(variants).map(v => `phone.eq.${v}`).join(",");
    const { data } = await supabase
      .from("customers").select("id").eq("tenant_id", tenantId).or(filter).limit(1).single();
    if (data?.id) return data.id;
  }

  if (body.email) {
    const { data } = await supabase
      .from("customers").select("id")
      .eq("tenant_id", tenantId).eq("email", String(body.email).toLowerCase())
      .limit(1).single();
    if (data?.id) return data.id;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key") || req.headers.get("x-webhook-key");
    if (!key) {
      return new Response(JSON.stringify({ error: "missing key" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: wh, error: whErr } = await supabase
      .from("automation_webhooks")
      .select("id, tenant_id, campaign_id, is_active, campaigns!inner(id, status, trigger_type)")
      .eq("endpoint_key", key)
      .maybeSingle();
    if (whErr || !wh) {
      return new Response(JSON.stringify({ error: "invalid key" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!wh.is_active) {
      return new Response(JSON.stringify({ error: "webhook inactive" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const campaign = Array.isArray((wh as any).campaigns) ? (wh as any).campaigns[0] : (wh as any).campaigns;
    if (!campaign || campaign.status !== "active") {
      return new Response(JSON.stringify({ error: "campaign not active" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body allowed */ }

    const customerId = await resolveCustomer(wh.tenant_id, body);
    if (!customerId) {
      return new Response(JSON.stringify({
        ok: false,
        error: "customer_not_found",
        hint: "Provide customer_id, phone, or email so the automation has a target.",
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Enfileira a execução diretamente (mesmo padrão das automations existentes)
    const { error: enqErr } = await supabase.from("automation_queue").insert({
      tenant_id: wh.tenant_id,
      campaign_id: wh.campaign_id,
      customer_id: customerId,
      trigger_type: "webhook",
      trigger_data: body,
      status: "pending",
      current_node_id: "start",
    });
    if (enqErr) {
      console.error("[webhook-trigger] enqueue error:", enqErr);
      return new Response(JSON.stringify({ error: "enqueue_failed", details: enqErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update hit counter (não bloqueia)
    supabase.from("automation_webhooks").update({
      hits: (((wh as any).hits) || 0) + 1, last_fired_at: new Date().toISOString(),
    }).eq("id", wh.id).then(() => {});

    return new Response(JSON.stringify({ ok: true, queued: true, customer_id: customerId }), {
      status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[webhook-trigger] error:", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
