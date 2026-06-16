// clickup-webhook — recebe eventos do ClickUp e propaga pro ticket.
//
// Eventos tratados:
//   - taskStatusUpdated  → muda ticket.status + email
//   - taskCommentPosted  → log + email (comment público é raro; vamos enviar sempre por enquanto)
//   - taskClosed         → status_change pra closed (mas o Maxfem usa "finalizado" como status, que dispara via Updated)
//
// Validação: ClickUp envia header X-Signature = HMAC-SHA256(body, webhook_secret).
// Quando criado via API, ClickUp devolve o secret — guardamos em CLICKUP_WEBHOOK_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLICKUP_WEBHOOK_SECRET = Deno.env.get("CLICKUP_WEBHOOK_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature",
};

const STATUS_DESCRIPTION: Record<string, string> = {
  in_progress: "Nosso time já está cuidando do seu caso.",
  waiting: "Estamos analisando os detalhes — em breve te trazemos uma resposta.",
  resolved: "O caso foi finalizado. Veja o resumo abaixo.",
};

const STATUS_LABEL_PT: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  waiting: "Em análise",
  resolved: "Finalizado",
  closed: "Encerrado",
};

function firstNameOf(full: string | null | undefined): string {
  if (!full) return "Cliente";
  return full.trim().split(/\s+/)[0] || "Cliente";
}

async function verifyHmac(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!secret) return true; // permitido sem secret se a env não setou (smoke / desenvolvimento)
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  // ClickUp envia o signature em hex direto, sem prefixo
  return hex === signature.toLowerCase().replace(/^sha256=/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  const sigHeader = req.headers.get("x-signature");
  const ok = await verifyHmac(raw, sigHeader, CLICKUP_WEBHOOK_SECRET);
  if (!ok) {
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  const event = payload?.event || "";
  const taskId = payload?.task_id;
  if (!taskId) {
    return new Response(JSON.stringify({ ok: true, skipped: "sem task_id" }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Localiza ticket
  const { data: ticket } = await sb.from("tickets")
    .select("*, customers(id, name, email, phone)")
    .eq("clickup_task_id", taskId).maybeSingle();
  if (!ticket) {
    return new Response(JSON.stringify({ ok: true, skipped: "ticket não encontrado" }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
  const customer = (ticket as any).customers || {};

  // Pega config pra mapping de status
  const { data: cfg } = await sb.from("ticket_tenant_config").select("status_map").eq("tenant_id", ticket.tenant_id).maybeSingle();
  const statusMap: Record<string, string> = cfg?.status_map || {};

  let newInternalStatus: string | null = null;
  let oldClickupStatus: string | null = null;
  let newClickupStatus: string | null = null;
  let updateType: string = "comment";

  if (event === "taskStatusUpdated" || event === "taskUpdated") {
    // history_items contém o diff. Buscamos type 1 (status change)
    const items = payload?.history_items || [];
    const statusChange = items.find((it: any) => it?.field === "status");
    if (statusChange) {
      oldClickupStatus = (statusChange.before?.status || statusChange.before || "").toString().toLowerCase();
      newClickupStatus = (statusChange.after?.status || statusChange.after || "").toString().toLowerCase();
      newInternalStatus = statusMap[newClickupStatus] || null;
      updateType = "status_change";
    }
  }

  // Aplica mudança de status no ticket
  if (newInternalStatus && newInternalStatus !== ticket.status) {
    await sb.from("tickets").update({ status: newInternalStatus }).eq("id", ticket.id);
    await sb.from("ticket_updates").insert({
      ticket_id: ticket.id, source: "clickup_webhook", update_type: "status_change",
      old_value: ticket.status, new_value: newInternalStatus,
      message: `ClickUp: ${oldClickupStatus} → ${newClickupStatus}`,
      payload: { event, clickup_old: oldClickupStatus, clickup_new: newClickupStatus },
    });

    // Email pro cliente:
    //   resolved → template ticket_resolved
    //   demais transições não-open → template ticket_status_changed
    if (customer.email && newInternalStatus !== "open") {
      const templateName = newInternalStatus === "resolved" ? "ticket_resolved" : "ticket_status_changed";
      const { data: tmpl } = await sb.from("message_templates")
        .select("subject, body_html, body_text")
        .eq("tenant_id", ticket.tenant_id).eq("name", templateName).eq("channel", "email")
        .maybeSingle();
      if (tmpl) {
        const vars: Record<string, string> = {
          first_name: firstNameOf(customer.name),
          ticket_number: ticket.ticket_number,
          ticket_title: ticket.title,
          ticket_description: ticket.description || "—",
          new_status_label: STATUS_LABEL_PT[newInternalStatus] || newInternalStatus,
          status_description: STATUS_DESCRIPTION[newInternalStatus] || "",
          resolution_notes: STATUS_DESCRIPTION[newInternalStatus] || "Caso encerrado pelo nosso time.",
        };
        const fill = (s: string | null | undefined) => (s || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-email-ses`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              to: customer.email,
              subject: fill(tmpl.subject),
              html: fill(tmpl.body_html),
              text: fill(tmpl.body_text),
              tenantId: ticket.tenant_id,
              customerId: ticket.customer_id,
            }),
          });
          await sb.from("ticket_updates").insert({
            ticket_id: ticket.id, source: "system", update_type: "email_sent",
            message: `Email ${templateName} enviado pra ${customer.email}`,
          });
        } catch (e: any) {
          await sb.from("ticket_updates").insert({
            ticket_id: ticket.id, source: "system", update_type: "email_sent",
            message: `Falha email ${templateName}: ${e?.message || e}`,
          });
        }
      }
    }
  } else if (event === "taskCommentPosted") {
    const comment = payload?.comment?.text_content || payload?.history_items?.[0]?.comment?.text_content || "";
    await sb.from("ticket_updates").insert({
      ticket_id: ticket.id, source: "clickup_webhook", update_type: "comment",
      message: comment.slice(0, 1000),
      payload,
    });
  } else {
    // Outros eventos: log only
    await sb.from("ticket_updates").insert({
      ticket_id: ticket.id, source: "clickup_webhook", update_type: "comment",
      message: `Evento ClickUp: ${event}`,
      payload,
    });
  }

  return new Response(JSON.stringify({ ok: true, ticket_number: ticket.ticket_number, new_status: newInternalStatus }), {
    status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
