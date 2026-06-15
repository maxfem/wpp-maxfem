// meta-capi — Conversions API server-side com dedup por event_id.
//
// Chamado pelo trigger trg_orders_meta_capi_dispatch quando mapped_status
// vira pago. Lê config do tenant em meta_capi_config, monta payload do Graph
// API com PII hasheado em SHA-256 (spec Meta), envia, e loga em
// meta_capi_events.
//
// Dedup: event_id = "yampi_<order.external_id>" — mesmo ID que o Pixel
// client-side já envia. Meta dedupla automaticamente.
//
// Ativar pra um tenant:
//   1) supabase secrets set META_CAPI_ACCESS_TOKEN=<system_user_token> (ou usa META_ACCESS_TOKEN se já tem)
//   2) supabase functions secrets set app.settings.supabase_url=<...> app.settings.service_role_key=<...>
//      (necessário pro trigger SQL conseguir invocar via net.http_post)
//   3) INSERT INTO meta_capi_config (tenant_id, pixel_id, enabled, test_event_code)
//      VALUES ('<tenant>', '<pixel_id>', true, 'TEST12345'); -- test_event_code só pra smoke
//   4) Confere no Events Manager → Test Events. Quando bater, UPDATE removendo test_event_code.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Token Meta — usa META_CAPI_ACCESS_TOKEN se setado, senão fallback pro
// META_ACCESS_TOKEN existente (mesmo system user da integração Meta Ads).
const META_TOKEN = Deno.env.get("META_CAPI_ACCESS_TOKEN") || Deno.env.get("META_ACCESS_TOKEN")!;

const GRAPH_VERSION = "v22.0";

interface DispatchBody {
  tenant_id: string;
  order_id: string;
  event: string; // Purchase | AddToCart | InitiateCheckout | etc
  trigger?: string; // observabilidade
}

async function sha256Lower(input: string | null | undefined): Promise<string | undefined> {
  if (!input) return undefined;
  const norm = input.trim().toLowerCase();
  if (!norm) return undefined;
  const buf = new TextEncoder().encode(norm);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Phone normalize: dígitos só, com DDI (Meta espera E.164 sem +)
function normalizePhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  // Se vem sem DDI Brasil (10/11 dígitos), prepende 55
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: DispatchBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
  }

  const { tenant_id, order_id, event } = body;
  if (!tenant_id || !order_id || !event) {
    return new Response(JSON.stringify({ error: "tenant_id, order_id, event obrigatórios" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1) Config do tenant
  const { data: cfg, error: cfgErr } = await supabase
    .from("meta_capi_config")
    .select("*")
    .eq("tenant_id", tenant_id)
    .maybeSingle();
  if (cfgErr || !cfg) {
    return new Response(JSON.stringify({ error: "config não encontrada", tenant_id }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders() } });
  }
  if (!cfg.enabled) {
    return new Response(JSON.stringify({ skipped: "config desabilitada" }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } });
  }
  if (!cfg.events_enabled?.includes(event)) {
    return new Response(JSON.stringify({ skipped: `event ${event} não habilitado pro tenant` }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } });
  }

  // 2) Carrega pedido + customer
  const { data: order } = await supabase
    .from("orders")
    .select("id, tenant_id, customer_id, external_id, total, created_at, currency, mapped_status, items_summary, customers(email, phone, document, custom_attributes)")
    .eq("id", order_id)
    .eq("tenant_id", tenant_id)
    .maybeSingle();
  if (!order) {
    return new Response(JSON.stringify({ error: "order não encontrado" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders() } });
  }

  const customer = (order as any).customers || {};
  const externalId = String(order.external_id || order.id);
  const eventId = `${externalId}__${event}`; // dedup key consistente com Pixel client-side
  const eventTimeIso = order.created_at || new Date().toISOString();
  const eventTimeUnix = Math.floor(new Date(eventTimeIso).getTime() / 1000);

  // 3) Hash PII (spec Meta — SHA-256 lowercase trimmed)
  const userData: Record<string, string | string[]> = {};
  const emailHash = await sha256Lower(customer.email);
  if (emailHash) userData.em = emailHash;
  const phoneNorm = normalizePhone(customer.phone);
  if (phoneNorm) {
    const phoneHash = await sha256Lower(phoneNorm);
    if (phoneHash) userData.ph = phoneHash;
  }
  const docHash = await sha256Lower(customer.document);
  if (docHash) userData.external_id = docHash;
  // External ID secundário: o próprio customer_id sem hash é aceito (sub) — ajuda match
  if (order.customer_id) {
    // Adiciona ao array se já tem (Meta aceita lista)
    const existing = Array.isArray(userData.external_id) ? userData.external_id : (userData.external_id ? [userData.external_id as string] : []);
    existing.push(String(order.customer_id));
    userData.external_id = existing;
  }
  // Client IP / UA podem ser passados se vierem do contexto (não temos aqui server-side)

  // 4) Custom data — Purchase precisa value + currency
  const customData: Record<string, unknown> = {
    value: Number(order.total || 0),
    currency: order.currency || "BRL",
  };
  if (order.items_summary && Array.isArray(order.items_summary)) {
    const ids = order.items_summary.map((i: any) => String(i.sku || i.id || i.name || "")).filter(Boolean);
    if (ids.length) {
      customData.content_ids = ids;
      customData.content_type = "product";
    }
  }

  // 5) Payload Graph API
  const payload: Record<string, unknown> = {
    data: [{
      event_name: event,
      event_time: eventTimeUnix,
      event_id: eventId,
      action_source: cfg.action_source || "website",
      event_source_url: cfg.default_event_source_url || undefined,
      user_data: userData,
      custom_data: customData,
    }],
  };
  if (cfg.test_event_code) payload.test_event_code = cfg.test_event_code;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.pixel_id}/events?access_token=${encodeURIComponent(META_TOKEN)}`;

  // 6) Log + dedup local. Insere primeiro como 'queued' com ON CONFLICT DO NOTHING.
  const { data: logged, error: logErr } = await supabase
    .from("meta_capi_events")
    .upsert({
      tenant_id,
      pixel_id: cfg.pixel_id,
      event_id: eventId,
      event_name: event,
      event_time: eventTimeIso,
      source_order_id: order.id,
      status: "queued",
    }, { onConflict: "tenant_id,pixel_id,event_id,event_name", ignoreDuplicates: true })
    .select("id");
  if (logErr) {
    console.error("[meta-capi] log err:", logErr.message);
  }
  const isNew = logged && logged.length > 0;
  if (!isNew) {
    return new Response(JSON.stringify({ skipped: "evento já enviado (dedup local)", event_id: eventId }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } });
  }

  // 7) Dispara CAPI
  let httpStatus = 0;
  let responseBody: any = null;
  let errorMsg: string | null = null;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    httpStatus = r.status;
    responseBody = await r.json().catch(() => null);
    if (!r.ok) errorMsg = responseBody?.error?.message || `HTTP ${r.status}`;
  } catch (e: any) {
    errorMsg = e?.message || String(e);
  }

  const finalStatus = errorMsg ? "failed" : "sent";
  await supabase
    .from("meta_capi_events")
    .update({
      status: finalStatus,
      http_status: httpStatus,
      fbtrace_id: responseBody?.fbtrace_id || null,
      events_received: responseBody?.events_received || null,
      response_body: responseBody,
      error_message: errorMsg,
    })
    .eq("tenant_id", tenant_id)
    .eq("pixel_id", cfg.pixel_id)
    .eq("event_id", eventId)
    .eq("event_name", event);

  return new Response(JSON.stringify({
    status: finalStatus,
    event_id: eventId,
    fbtrace_id: responseBody?.fbtrace_id || null,
    events_received: responseBody?.events_received || null,
    error: errorMsg,
  }), {
    status: errorMsg ? 502 : 200,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
});
