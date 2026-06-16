// ticket-create — cria ticket no CRM + task no ClickUp + dispara email + msg na conversa.
//
// Chamado pelo botão "Criar ticket" em /crm/atendimento.
// Body: { tenant_id, customer_id, conversation_id?, channel, title, description?, priority?, category? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLICKUP_TOKEN = Deno.env.get("CLICKUP_API_TOKEN")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateBody {
  tenant_id: string;
  customer_id: string;
  conversation_id?: string;
  phone?: string;          // resolve conversation_id (WA)
  ig_account_id?: string;  // resolve conversation_id (IG)
  ig_user_id?: string;
  channel: "whatsapp" | "instagram" | "email" | "manual";
  title: string;
  description?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  category?: "reembolso" | "defeito" | "atraso_entrega" | "duvida_produto" | "outros";
  opened_by?: string;
}

const PRIORITY_MAP_CLICKUP: Record<string, number> = {
  urgent: 1, high: 2, normal: 3, low: 4,
};

const CATEGORY_LABEL: Record<string, string> = {
  reembolso: "Reembolso",
  defeito: "Defeito de produto",
  atraso_entrega: "Atraso de entrega",
  duvida_produto: "Dúvida de produto",
  outros: "Outros",
};

function firstNameOf(full: string | null | undefined): string {
  if (!full) return "Cliente";
  return full.trim().split(/\s+/)[0] || "Cliente";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } });

  let body: CreateBody;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
  const { tenant_id, customer_id, channel, title, description, priority = "normal", category = "outros", opened_by, phone, ig_account_id, ig_user_id } = body;
  let conversation_id = body.conversation_id;
  if (!tenant_id || !customer_id || !channel || !title) {
    return new Response(JSON.stringify({ error: "tenant_id, customer_id, channel e title obrigatórios" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Resolve conversation_id se não foi passado
  if (!conversation_id) {
    if (channel === "whatsapp" && phone) {
      const { data: c } = await sb.from("whatsapp_conversations")
        .select("id").eq("tenant_id", tenant_id).eq("phone", phone)
        .order("last_message_at", { ascending: false }).limit(1).maybeSingle();
      if (c?.id) conversation_id = c.id;
    } else if (channel === "instagram" && ig_account_id && ig_user_id) {
      const { data: c } = await sb.from("instagram_conversations")
        .select("id").eq("tenant_id", tenant_id).eq("ig_account_id", ig_account_id).eq("ig_user_id", ig_user_id)
        .order("last_message_at", { ascending: false }).limit(1).maybeSingle();
      if (c?.id) conversation_id = c.id;
    }
  }

  // 1) Config ClickUp do tenant
  const { data: cfg } = await sb.from("ticket_tenant_config").select("*").eq("tenant_id", tenant_id).maybeSingle();
  if (!cfg || !cfg.enabled) {
    return new Response(JSON.stringify({ error: "ticket_tenant_config ausente ou desabilitado" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // 2) Customer
  const { data: customer } = await sb.from("customers").select("id, name, email, phone").eq("id", customer_id).eq("tenant_id", tenant_id).maybeSingle();
  if (!customer) {
    return new Response(JSON.stringify({ error: "customer não encontrado" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  // 3) INSERT ticket — sequence cuida do ticket_number
  const { data: ticket, error: tErr } = await sb.from("tickets")
    .insert({
      tenant_id, customer_id, conversation_id: conversation_id || null,
      channel, opened_by: opened_by || null,
      category, priority, status: "open",
      title, description: description || null,
    })
    .select("*").single();
  if (tErr || !ticket) {
    return new Response(JSON.stringify({ error: "insert ticket falhou", details: tErr?.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }

  await sb.from("ticket_updates").insert({
    ticket_id: ticket.id, source: "agent", update_type: "created",
    message: `Ticket criado por atendente`, new_value: "open",
  });

  // 4) Cria task no ClickUp
  const clickupTitle = `${customer.name || "Cliente"} — ${title}`;
  const clickupDescriptionParts = [
    `**Ticket:** ${ticket.ticket_number}`,
    `**Cliente:** ${customer.name || "—"}`,
    customer.email ? `**E-mail:** ${customer.email}` : null,
    customer.phone ? `**Telefone:** ${customer.phone}` : null,
    `**Canal:** ${channel}`,
    `**Categoria:** ${CATEGORY_LABEL[category]}`,
    description ? `\n---\n${description}` : null,
    `\n_Aberto via CRM atendimento_`,
  ].filter(Boolean).join("\n");

  let clickupTaskId: string | null = null;
  let clickupUrl: string | null = null;
  let clickupErr: string | null = null;
  try {
    const cuRes = await fetch(`https://api.clickup.com/api/v2/list/${cfg.clickup_list_id}/task`, {
      method: "POST",
      headers: { "Authorization": CLICKUP_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: clickupTitle,
        description: clickupDescriptionParts,
        priority: PRIORITY_MAP_CLICKUP[priority] || 3,
        tags: [category, channel, "crm-atendimento"],
        // status default da lista vai ser "para fazer"
      }),
    });
    const cuJson = await cuRes.json();
    if (!cuRes.ok) {
      clickupErr = `ClickUp ${cuRes.status}: ${cuJson?.err || JSON.stringify(cuJson)}`;
    } else {
      clickupTaskId = cuJson.id;
      clickupUrl = cuJson.url;
    }
  } catch (e: any) {
    clickupErr = `ClickUp fetch fail: ${e?.message || e}`;
  }

  if (clickupTaskId) {
    await sb.from("tickets").update({ clickup_task_id: clickupTaskId, clickup_url: clickupUrl }).eq("id", ticket.id);
  } else {
    await sb.from("ticket_updates").insert({
      ticket_id: ticket.id, source: "system", update_type: "comment",
      message: `Falha ao criar task no ClickUp: ${clickupErr}`,
    });
  }

  // 5) Email pro cliente (template ticket_created)
  let emailErr: string | null = null;
  if (customer.email) {
    try {
      const { data: tmpl } = await sb.from("message_templates")
        .select("subject, body_html, body_text")
        .eq("tenant_id", tenant_id).eq("name", "ticket_created").eq("channel", "email")
        .maybeSingle();
      if (tmpl) {
        const vars: Record<string, string> = {
          first_name: firstNameOf(customer.name),
          ticket_number: ticket.ticket_number,
          ticket_title: title,
          ticket_description: description || "—",
        };
        const fill = (s: string | null | undefined) => (s || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
        const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email-ses`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            to: customer.email,
            subject: fill(tmpl.subject),
            html: fill(tmpl.body_html),
            text: fill(tmpl.body_text),
            tenantId: tenant_id,
            customerId: customer_id,
          }),
        });
        if (!sendRes.ok) emailErr = `send-email-ses ${sendRes.status}`;
      } else { emailErr = "template ticket_created não encontrado"; }
    } catch (e: any) { emailErr = e?.message || String(e); }
    await sb.from("ticket_updates").insert({
      ticket_id: ticket.id, source: "system", update_type: "email_sent",
      message: emailErr ? `Falha email: ${emailErr}` : `Email ticket_created enviado pra ${customer.email}`,
    });
  }

  // 6) Mensagem na conversa (WA/IG) — texto livre, dentro de janela 24h
  let convMsgErr: string | null = null;
  if (conversation_id && (channel === "whatsapp" || channel === "instagram")) {
    const msgText = `Olá, ${firstNameOf(customer.name)}! Abrimos o chamado *${ticket.ticket_number}* para tratar seu caso. Você vai receber as atualizações por aqui e por e-mail (${customer.email || "—"}). A gente segue acompanhando até a resolução.`;
    try {
      if (channel === "whatsapp") {
        // Reusa endpoint interno de envio WA do CRM (assume que existe whatsapp-send ou similar)
        // Como a Maxfem usa Cloud API direta, inserimos direto na tabela de outbox/messages:
        const { data: conv } = await sb.from("whatsapp_conversations").select("phone, whatsapp_account_id").eq("id", conversation_id).maybeSingle();
        if (conv?.phone && conv.whatsapp_account_id) {
          const { data: acc } = await sb.from("whatsapp_accounts").select("phone_number_id, access_token").eq("id", conv.whatsapp_account_id).maybeSingle();
          if (acc?.phone_number_id && acc?.access_token) {
            const waRes = await fetch(`https://graph.facebook.com/v22.0/${acc.phone_number_id}/messages`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${acc.access_token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ messaging_product: "whatsapp", to: conv.phone, type: "text", text: { body: msgText } }),
            });
            if (!waRes.ok) convMsgErr = `WA ${waRes.status}`;
            else {
              const waJson = await waRes.json();
              await sb.from("whatsapp_messages").insert({
                tenant_id, customer_id, conversation_id, phone: conv.phone,
                direction: "outbound", message_type: "text", wamid: waJson?.messages?.[0]?.id || null,
                status: "sent", content: msgText,
              });
            }
          }
        }
      } else if (channel === "instagram") {
        // IG: invoca instagram-send (já existente)
        const igRes = await fetch(`${SUPABASE_URL}/functions/v1/instagram-send`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ tenant_id, conversation_id, text: msgText }),
        });
        if (!igRes.ok) convMsgErr = `IG-send ${igRes.status}`;
      }
    } catch (e: any) { convMsgErr = e?.message || String(e); }
    await sb.from("ticket_updates").insert({
      ticket_id: ticket.id, source: "system", update_type: "comment",
      message: convMsgErr ? `Falha msg conversa: ${convMsgErr}` : `Notificação enviada na conversa`,
    });
  }

  return new Response(JSON.stringify({
    ticket_id: ticket.id,
    ticket_number: ticket.ticket_number,
    clickup_task_id: clickupTaskId,
    clickup_url: clickupUrl,
    clickup_error: clickupErr,
    email_error: emailErr,
    conversation_message_error: convMsgErr,
  }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
});
