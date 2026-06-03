/**
 * Yampi Webhook Receiver
 *
 * Recebe eventos de pedido da Yampi em tempo real (order.created, order.updated,
 * order.status.updated) e dispara o sync + as automações NA HORA — sem esperar
 * o poll de 1 min do cron. Crítico pra conversão do Pix: a mensagem
 * "pix_nao_pago" sai segundos após o pedido entrar.
 *
 * URL registrada na Yampi:
 *   https://<project>.supabase.co/functions/v1/yampi-webhook?token=<YAMPI_WEBHOOK_TOKEN>
 *
 * Fluxo:
 *   1. Valida o token da URL
 *   2. Responde 200 imediato pra Yampi (evita timeout/retry)
 *   3. Em background: invoca yampi-sync (cron mode) → enfileira os triggers
 *      → invoca campaign-executor → processa a fila e envia o WhatsApp
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Token compartilhado que vai na query string da URL registrada na Yampi.
const WEBHOOK_TOKEN = Deno.env.get("YAMPI_WEBHOOK_TOKEN") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// Eventos da Yampi que justificam re-sync imediato.
const ORDER_EVENTS = ["order.created", "order.updated", "order.status.updated", "order.paid"];

async function runSyncThenExecute() {
  const auth = { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
  try {
    // 1) Sync imediato — busca os pedidos mais novos e enfileira os triggers
    const syncRes = await fetch(`${SUPABASE_URL}/functions/v1/yampi-sync`, {
      method: "POST", headers: auth, body: JSON.stringify({ cron: true }),
    });
    console.log(`[yampi-webhook] yampi-sync status=${syncRes.status}`);

    // 2) Executor — processa a fila de automações na hora (envia o WhatsApp)
    const execRes = await fetch(`${SUPABASE_URL}/functions/v1/campaign-executor`, {
      method: "POST", headers: auth, body: JSON.stringify({ trigger: "yampi_webhook" }),
    });
    console.log(`[yampi-webhook] campaign-executor status=${execRes.status}`);
  } catch (e) {
    console.error("[yampi-webhook] runSyncThenExecute error:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Validação do token da URL
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) {
    console.warn("[yampi-webhook] token inválido ou ausente");
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Lê o payload só pra logar o evento — o sync busca os dados frescos da Yampi.
  let eventName = "unknown";
  try {
    const body = await req.json();
    eventName = body?.event || body?.type || req.headers.get("x-yampi-event") || "unknown";
  } catch (_) { /* payload vazio/inesperado — segue mesmo assim */ }

  console.log(`[yampi-webhook] evento recebido: ${eventName}`);

  // Só dispara re-sync pra eventos de pedido (ignora outros, se houver)
  const isOrderEvent = eventName === "unknown" || ORDER_EVENTS.some(e => eventName.includes(e) || e.includes(eventName));
  if (isOrderEvent) {
    const task = runSyncThenExecute();
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(task);
    else await task;
  } else {
    console.log(`[yampi-webhook] evento ${eventName} ignorado (não é de pedido)`);
  }

  // Responde 200 imediato — a Yampi não espera o processamento
  return new Response(JSON.stringify({ ok: true, event: eventName }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
