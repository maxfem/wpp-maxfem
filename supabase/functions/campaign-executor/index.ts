import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ===== BLING TRACKING LOOKUP =====

async function refreshBlingToken(integrationId: string, cfg: any, supabase: any): Promise<string | null> {
  try {
    const clientId = Deno.env.get("BLING_CLIENT_ID");
    const clientSecret = Deno.env.get("BLING_CLIENT_SECRET");
    if (!clientId || !clientSecret || !cfg?.refresh_token) return null;
    const basic = btoa(`${clientId}:${clientSecret}`);
    const res = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}`, Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refresh_token }),
    });
    const data = await res.json();
    if (!res.ok) { console.error("[executor] Bling refresh failed:", data); return null; }
    const now = new Date();
    const newConfig = {
      ...cfg,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      access_expires_at: new Date(now.getTime() + (data.expires_in || 21600) * 1000).toISOString(),
      refresh_expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    await supabase.from("integrations").update({ config: newConfig, sync_error: null, updated_at: now.toISOString() }).eq("id", integrationId);
    return data.access_token;
  } catch (e) { console.error("[executor] Bling refresh error:", e); return null; }
}

async function fetchBlingTracking(tenantId: string, document: string | null, orderNumber: string | null, supabase: any): Promise<{ tracking_code: string; carrier: string | null } | null> {
  if (!document) return null;
  const cleanCpf = document.replace(/\D/g, "");
  if (cleanCpf.length < 11) return null;
  try {
    const { data: integ } = await supabase.from("integrations")
      .select("id, config").eq("tenant_id", tenantId).eq("provider", "bling").eq("is_active", true).maybeSingle();
    if (!integ) return null;
    const cfg = integ.config as any;
    let token = cfg?.access_token;
    if (!token) return null;
    const expiresAt = cfg.access_expires_at ? new Date(cfg.access_expires_at).getTime() : 0;
    if (expiresAt < Date.now() + 5 * 60 * 1000) {
      const nt = await refreshBlingToken(integ.id, cfg, supabase);
      if (nt) token = nt;
    }
    const formattedCpf = cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    const auth = () => ({ Authorization: `Bearer ${token}`, Accept: "application/json" });
    let cRes = await fetch(`https://www.bling.com.br/Api/v3/contatos?pesquisa=${encodeURIComponent(formattedCpf)}`, { headers: auth() });
    if (cRes.status === 401) {
      const nt = await refreshBlingToken(integ.id, cfg, supabase);
      if (nt) { token = nt; cRes = await fetch(`https://www.bling.com.br/Api/v3/contatos?pesquisa=${encodeURIComponent(formattedCpf)}`, { headers: auth() }); }
    }
    if (!cRes.ok) return null;
    const cData = await cRes.json();
    const contact = cData?.data?.[0];
    if (!contact) return null;
    const oRes = await fetch(`https://www.bling.com.br/Api/v3/pedidos/vendas?idContato=${contact.id}&limit=10`, { headers: auth() });
    if (!oRes.ok) return null;
    const oData = await oRes.json();
    const orders = oData?.data || [];
    if (orders.length === 0) return null;
    const matched = orderNumber ? orders.find((o: any) => String(o.numero) === String(orderNumber)) : null;
    const candidates = matched ? [matched] : orders.slice(0, 3);
    for (const ord of candidates) {
      const dRes = await fetch(`https://www.bling.com.br/Api/v3/pedidos/vendas/${ord.id}`, { headers: auth() });
      if (!dRes.ok) continue;
      const d = (await dRes.json())?.data;
      if (!d) continue;
      let code = d.transporte?.volumes?.[0]?.codigoRastreamento || null;
      let carrier = d.transporte?.contato?.nome || null;
      if (!code && d.notaFiscal?.id) {
        try {
          const nfeRes = await fetch(`https://www.bling.com.br/Api/v3/nfe/${d.notaFiscal.id}`, { headers: auth() });
          if (nfeRes.ok) {
            const nfe = (await nfeRes.json())?.data;
            code = nfe?.transporte?.volumes?.[0]?.codigoRastreamento || code;
            if (!carrier) carrier = nfe?.transporte?.transportador?.nome || null;
          }
        } catch (_e) {}
      }
      if (!code) {
        try {
          const lRes = await fetch(`https://www.bling.com.br/Api/v3/pedidos/vendas/${ord.id}/logistica`, { headers: auth() });
          if (lRes.ok) {
            const li = ((await lRes.json())?.data || [])[0];
            code = li?.codigoRastreamento || li?.rastreamento?.codigo || code;
          }
        } catch (_e) {}
      }
      if (code) return { tracking_code: code, carrier };
    }
    return null;
  } catch (e) { console.error("[executor] fetchBlingTracking error:", e); return null; }
}



function resolveVariable(key: string, ctx: { customer: any; order: any; campaign: any; triggerData?: any; tenantId?: string }): string {
  const { customer, order, campaign, tenantId } = ctx;
  const attrs = customer?.custom_attributes || {};
  const cart = attrs?.abandoned_cart || {};
  
  if (!key) return "-";
  switch (key) {
    case "customer.name": return customer?.name || "Cliente";
    case "customer.first_name": return (customer?.name || "Cliente").split(" ")[0];
    case "customer.phone": return customer?.phone || "";
    case "customer.email": return customer?.email || "";
    case "customer.city": return attrs?.city || "";
    case "customer.state": return attrs?.state || "";
    case "customer.days_since_order": {
      if (!attrs?.last_order_date) return "-";
      const diff = Math.floor((Date.now() - new Date(attrs.last_order_date).getTime()) / (1000 * 60 * 60 * 24));
      return String(diff);
    }
    case "customer.last_product": return attrs?.last_product || "seu produto favorito";
    case "customer.last_order_value": return attrs?.last_order_value ? formatCurrency(attrs.last_order_value) : "-";
    case "cart.recovery_url": return cart?.recovery_url || "";
    case "cart.value": return cart?.value ? formatCurrency(cart.value) : "-";
    case "cart.items_count": return String(cart?.items_count || 0);
    case "cart.items_summary": return cart?.items_summary || "seus itens selecionados";
    case "order.number": return order?.order_number || ctx.triggerData?.order_number || order?.external_id?.replace("yampi_", "") || order?.id?.slice(0, 8) || "-";
    case "order.total": return (order?.total || ctx.triggerData?.total) ? formatCurrency(order?.total || ctx.triggerData?.total) : "-";
    case "order.status": return order?.mapped_status || ctx.triggerData?.status || order?.status || "-";
    case "order.tracking_code": return order?.tracking_code || ctx.triggerData?.tracking_code || "-";
    case "order.delivery_days": return order?.delivery_days || ctx.triggerData?.delivery_days || "5 a 8";
    case "order.pix_code": return ctx.triggerData?.pix_qr_code || order?.pix_qr_code || ctx.triggerData?.pix_code || "-";
    case "campaign.coupon": return campaign?.coupon || "-";
    case "campaign.discount": return campaign?.discount || "-";
    case "campaign.product_name": return campaign?.product_name || "-";
    case "campaign.product_desc": return campaign?.product_desc || "-";
    case "campaign.return_days": return campaign?.return_days || "5";
    case "unsubscribe_url":
    case "link_descadastro": {
      if (!tenantId || !customer?.email) return "#";
      return `${Deno.env.get("SUPABASE_URL")}/functions/v1/handle-unsubscribe?t=${tenantId}&e=${encodeURIComponent(customer.email)}`;
    }
    default: return "-";
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

// ===== LINK TRACKING =====

function generateCode(len = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < len; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

async function wrapHtmlLinks(
  supabase: any,
  html: string,
  ctx: { tenantId: string; campaignId: string; customerId: string; campaignName: string }
): Promise<string> {
  const urlRegex = /href="([^"]+)"/g;
  let match;
  let newHtml = html;
  
  // To avoid issues with multiple replacements changing indices, we'll collect matches first
  const replacements: { original: string; wrapped: string }[] = [];
  
  while ((match = urlRegex.exec(html)) !== null) {
    const originalUrl = match[1];
    if (originalUrl.startsWith("http") && !originalUrl.includes(Deno.env.get("SUPABASE_URL")!)) {
      const code = generateCode(10);
      
      // Store in tracked_links
      await supabase.from("tracked_links").insert({
        tenant_id: ctx.tenantId,
        campaign_id: ctx.campaignId,
        customer_id: ctx.customerId,
        code,
        original_url: originalUrl,
        utm_source: "email",
        utm_medium: "automation",
        utm_campaign: ctx.campaignName,
      });
      
      const wrappedUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/link-redirect?c=${code}`;
      replacements.push({ original: originalUrl, wrapped: wrappedUrl });
    }
  }
  
  for (const r of replacements) {
    newHtml = newHtml.replace(`href="${r.original}"`, `href="${r.wrapped}"`);
  }
  
  return newHtml;
}

function getCustomerDynamicUrl(customer: any, templateName: string): string | null {
  const attrs = customer?.custom_attributes || {};
  const cart = attrs?.abandoned_cart || {};
  if (templateName.startsWith("carrinho_abandonado") && cart?.recovery_url) return cart.recovery_url;
  if (templateName.startsWith("pix_nao_pago")) return attrs?.pix_payment_url || attrs?.payment_url || "https://maxfem.com.br/account";
  return null;
}

// ===== TEMPLATE BUILDER =====

function buildTemplateComponents(
  variableMappings: string[], ctx: { customer: any; order: any; campaign: any; triggerData?: any; tenantId?: string },
  bodyVarCount: number, hasHeaderVar: boolean,
  buttonUrlCode?: string, buttonUrlIndex?: number,
  copyCodeButtons?: { index: number; value: string }[],
) {
  const components: any[] = [];
  if (hasHeaderVar) {
    const value = resolveVariable("customer.first_name", ctx);
    components.push({ type: "header", parameters: [{ type: "text", text: value && value !== "-" ? value : "Cliente" }] });
  }
  if (bodyVarCount > 0) {
    const params: any[] = [];
    for (let i = 0; i < bodyVarCount; i++) {
      const value = resolveVariable(variableMappings[i] || "customer.name", ctx);
      params.push({ type: "text", text: value || "-" });
    }
    components.push({ type: "body", parameters: params });
  }
  if (buttonUrlCode !== undefined && buttonUrlIndex !== undefined) {
    components.push({ type: "button", sub_type: "url", index: String(buttonUrlIndex), parameters: [{ type: "text", text: buttonUrlCode }] });
  }
  if (copyCodeButtons) {
    for (const btn of copyCodeButtons) {
      if (btn.value && btn.value !== "-") {
        // According to Meta, coupon_code must be 15 chars max.
        // For PIX, this button type might not be the right one if we want to copy the full code.
        if (btn.value.length > 15) {
          console.warn(`[automation] COPY_CODE button value too long (${btn.value.length} chars). Meta limit is 15. Truncating...`);
        }
        const finalValue = btn.value.length > 15 ? btn.value.substring(0, 15) : btn.value;
        components.push({ type: "button", sub_type: "copy_code", index: String(btn.index), parameters: [{ type: "coupon_code", coupon_code: finalValue }] });
      }
    }
  }
  return components;
}

// ===== TIMING =====

function calculateWaitMs(waitTime: number | string, waitUnit: string): number {
  const t = Number(waitTime) || 0;
  switch (waitUnit) {
    case "minutes": return t * 60 * 1000;
    case "hours": return t * 60 * 60 * 1000;
    case "days": return t * 24 * 60 * 60 * 1000;
    default: return t * 60 * 1000;
  }
}

// ===== PAYMENT CHECK =====

async function isOrderStillUnpaid(supabase: any, triggerData: any, tenantId: string): Promise<boolean> {
  const yampiOrderId = triggerData?.yampi_order_id;
  const orderId = triggerData?.order_id;
  if (!yampiOrderId && !orderId) return true;

  let query = supabase.from("orders").select("mapped_status, status").eq("tenant_id", tenantId);
  if (yampiOrderId) query = query.eq("external_id", `yampi_${yampiOrderId}`);
  else query = query.eq("id", orderId);

  const { data: order } = await query.limit(1).single();
  if (!order) return true;

  const paidStatuses = ["paid", "pago", "approved", "aprovado", "invoiced", "faturado", "shipped", "enviado", "delivered", "entregue"];
  return !paidStatuses.includes((order.mapped_status || order.status || "").toLowerCase());
}

// ===== FLOW GRAPH TYPES =====

interface FlowNode { id: string; type: string; data: Record<string, any>; }
interface FlowEdge { id: string; source: string; target: string; sourceHandle?: string; }

function getNextNodeId(edges: FlowEdge[], currentNodeId: string, sourceHandle?: string): string | null {
  const edge = edges.find(e => {
    if (e.source !== currentNodeId) return false;
    if (sourceHandle && e.sourceHandle) return e.sourceHandle === sourceHandle;
    return true;
  });
  return edge?.target || null;
}

function getNodeById(nodes: FlowNode[], nodeId: string): FlowNode | null {
  return nodes.find(n => n.id === nodeId) || null;
}

// ===== CONDITION EVALUATOR =====

async function evaluateCondition(supabase: any, node: FlowNode, item: any): Promise<boolean> {
  const data = node.data || {};
  const field = data.conditionField || "";
  const op = data.conditionOp || "equals";
  const value = data.conditionValue || "";
  const triggerData = (item.trigger_data || {}) as any;

  if (field === "payment_status" || field === "order_status") {
    const yampiOrderId = triggerData?.yampi_order_id;
    const orderId = triggerData?.order_id;
    if (!yampiOrderId && !orderId) return false;

    let query = supabase.from("orders").select("mapped_status, status").eq("tenant_id", item.tenant_id);
    if (yampiOrderId) query = query.eq("external_id", `yampi_${yampiOrderId}`);
    else query = query.eq("id", orderId);
    const { data: order } = await query.limit(1).single();

    const status = (order?.mapped_status || order?.status || "").toLowerCase();
    const paidStatuses = ["paid", "pago", "approved", "aprovado", "invoiced", "faturado", "shipped", "enviado", "delivered", "entregue"];
    if (value === "paid" || value === "pago") return paidStatuses.includes(status);
    if (value === "unpaid" || value === "pending") return !paidStatuses.includes(status);
    return status === value.toLowerCase();
  }

  if (field === "cart_purchased") {
    const cartTime = triggerData?.updated_at || item.created_at;
    const { data: orders } = await supabase.from("orders").select("id")
      .eq("tenant_id", item.tenant_id).eq("customer_id", item.customer_id)
      .gte("created_at", cartTime).limit(1);
    const hasPurchased = (orders || []).length > 0;
    return value === "no" ? !hasPurchased : hasPurchased;
  }

  const actual = String(triggerData?.[field] || "").toLowerCase();
  const expected = value.toLowerCase();
  switch (op) {
    case "equals": return actual === expected;
    case "not_equals": return actual !== expected;
    case "contains": return actual.includes(expected);
    case "greater_than": return Number(actual) > Number(expected);
    case "less_than": return Number(actual) < Number(expected);
    default: return actual === expected;
  }
}

// ===== CREDENTIAL RESOLVER =====

async function resolveWhatsAppCredentials(supabase: any, tenantId: string): Promise<{ phoneNumberId: string; accessToken: string }> {
  const { data: waAccount } = await supabase
    .from("whatsapp_accounts")
    .select("phone_number_id, access_token")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(1).single();

  return {
    phoneNumberId: waAccount?.phone_number_id || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "",
    accessToken: waAccount?.access_token || Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "",
  };
}

// ===== FILTER MATCHER =====

function matchesFilters(node: FlowNode, triggerData: any, customer: any): boolean {
  const data = node.data || {};
  
  // 1. Filter by Product
  if (data.filterProducts) {
    const products = String(data.filterProducts).split(",").map(p => p.trim().toLowerCase());
    const orderItems = (triggerData?.items || []).map((i: any) => String(i.name || i.sku || "").toLowerCase());
    
    // If no items in trigger data, we can't match products, so we assume it doesn't match if filter is set
    if (orderItems.length === 0) return false;
    
    const hasMatch = orderItems.some((item: any) => 
      products.some(p => item.includes(p))
    );
    if (!hasMatch) return false;
  }
  
  // 2. Filter by State
  if (data.filterStates) {
    const states = String(data.filterStates).split(",").map(s => s.trim().toUpperCase());
    const customerState = String(customer?.custom_attributes?.state || triggerData?.state || "").toUpperCase();
    if (!states.includes(customerState)) return false;
  }
  
  // 3. Filter by Day of Week
  if (data.filterDays) {
    const days = String(data.filterDays).toLowerCase();
    const now = new Date();
    const dayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const currentDay = dayNames[now.getDay()];
    if (!days.includes(currentDay)) return false;
  }

  return true;
}

// ===== AUTOMATION QUEUE PROCESSOR (GRAPH WALKER) =====

async function processAutomationQueue(supabase: any) {
  const results: any[] = [];
  const now = new Date().toISOString();

  const { data: queueItems, error: qErr } = await supabase
    .from("automation_queue")
    .select("id, tenant_id, campaign_id, customer_id, trigger_type, trigger_data, created_at, current_node_id, scheduled_for")
    .eq("status", "pending")
    .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(100);

  if (qErr || !queueItems || queueItems.length === 0) return results;

  console.log(`Processing ${queueItems.length} automation queue items`);

  const byCampaign = new Map<string, any[]>();
  for (const item of queueItems) {
    const list = byCampaign.get(item.campaign_id) || [];
    list.push(item);
    byCampaign.set(item.campaign_id, list);
  }

  for (const [campaignId, items] of byCampaign) {
    const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();

    if (!campaign || campaign.status !== "running") {
      for (const item of items) await supabase.from("automation_queue").update({ status: "failed", processed_at: now }).eq("id", item.id);
      continue;
    }

    const flowData = campaign.flow_data as any;
    const nodes: FlowNode[] = flowData?.nodes || [];
    const edges: FlowEdge[] = flowData?.edges || [];

    if (nodes.length === 0) {
      for (const item of items) await supabase.from("automation_queue").update({ status: "failed", processed_at: now }).eq("id", item.id);
      continue;
    }

    const { phoneNumberId, accessToken } = await resolveWhatsAppCredentials(supabase, campaign.tenant_id);

    const campaignVars: any = {};
    for (const node of nodes) {
      if (node.data?.coupon) campaignVars.coupon = node.data.coupon;
      if (node.data?.discount) campaignVars.discount = node.data.discount;
    }

    const templateCache = new Map<string, any>();

    for (const item of items) {
      try {
        console.log(`[automation] Processing item ${item.id} (trigger: ${item.trigger_type}, customer: ${item.customer_id})`);
        
        // Fetch customer for filter matching and variable resolution
        const { data: customer } = await supabase.from("customers").select("*").eq("id", item.customer_id).single();
        
        let currentNodeId = item.current_node_id || "start";
        let stepCount = 0;
        const MAX_STEPS = 20;

        while (stepCount < MAX_STEPS) {
          stepCount++;

          if (currentNodeId === "start") {
            const startNode = nodes.find(n => n.type === "startNode" || n.data?.nodeType === "start");
            if (startNode) {
              // Check filters on the start node
              if (!matchesFilters(startNode, item.trigger_data, customer)) {
                console.log(`[automation] Item ${item.id} skipped due to filters on start node`);
                await supabase.from("automation_queue").update({ status: "skipped", processed_at: now }).eq("id", item.id);
                break;
              }
              const nextId = getNextNodeId(edges, startNode.id);
              if (nextId) { currentNodeId = nextId; continue; }
            }
            const firstEdge = edges[0];
            if (firstEdge) { currentNodeId = firstEdge.target; continue; }
            await supabase.from("automation_queue").update({ status: "completed", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
            break;
          }

          const node = getNodeById(nodes, currentNodeId);
          if (!node) {
            await supabase.from("automation_queue").update({ status: "completed", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
            break;
          }

          const nodeType = node.data?.nodeType || node.type;

          // Support for "delay" property on any node (UI-specific)
          if (node.data?.delay && node.data?.delay !== "Sem atraso" && (!item.scheduled_for || new Date(item.scheduled_for) > new Date(now))) {
            const delayStr = String(node.data.delay);
            let waitMs = 0;
            const match = delayStr.match(/(\d+)\s*(minuto|hora|dia|min|hour|day)s?/i);
            if (match) {
              const val = parseInt(match[1]);
              const unit = match[2].toLowerCase();
              if (unit.startsWith("min")) waitMs = val * 60 * 1000;
              else if (unit.startsWith("hor") || unit.startsWith("hou")) waitMs = val * 60 * 60 * 1000;
              else if (unit.startsWith("dia") || unit.startsWith("day")) waitMs = val * 24 * 60 * 60 * 1000;
            }
            
            if (waitMs > 0) {
              const scheduledFor = new Date(Date.now() + waitMs).toISOString();
              console.log(`[automation] Node ${currentNodeId} has delay ${delayStr}, rescheduling for ${scheduledFor}`);
              await supabase.from("automation_queue").update({ 
                scheduled_for: scheduledFor,
                // We keep the current_node_id so it picks up here next time
              }).eq("id", item.id);
              break; 
            }
          }

          // WAIT
          if (nodeType === "wait" || nodeType === "waitDate" || nodeType === "waitCondition") {
            const waitMs = calculateWaitMs(node.data?.waitTime || 0, node.data?.waitUnit || "minutes");
            const scheduledFor = new Date(Date.now() + waitMs).toISOString();
            const nextId = getNextNodeId(edges, currentNodeId);
            if (nextId) {
              await supabase.from("automation_queue").update({ current_node_id: nextId, scheduled_for: scheduledFor }).eq("id", item.id);
            } else {
              await supabase.from("automation_queue").update({ status: "completed", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
            }
            break;
          }

          // CONDITION
          if (nodeType === "condition" || nodeType === "multiCondition") {
            const conditionMet = await evaluateCondition(supabase, node, item);
            const handle = conditionMet ? "condition-true" : "condition-false";
            const nextId = getNextNodeId(edges, currentNodeId, handle);
            if (nextId) {
              currentNodeId = nextId;
              await supabase.from("automation_queue").update({ current_node_id: currentNodeId, scheduled_for: null }).eq("id", item.id);
              continue;
            }
            await supabase.from("automation_queue").update({ status: conditionMet ? "completed" : "skipped", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
            break;
          }

          // SEND EMAIL
          if (nodeType === "sendEmail") {
            let subject = node.data?.subject || "E-mail importante";
            let bodyHtml = node.data?.content || node.data?.body || "";
            const fromName = node.data?.fromName || "";
            const configurationSet = (node.data?.configurationSet || "").trim() || null;
            const emailTemplateName = node.data?.emailTemplate;

            if (emailTemplateName && !bodyHtml) {
              const { data: tpl } = await supabase.from("email_templates")
                .select("subject, body_html")
                .eq("name", emailTemplateName)
                .eq("tenant_id", campaign.tenant_id)
                .maybeSingle();
              
              if (tpl) {
                if (subject === "SEM SSUNTO" || !subject || subject === "E-mail importante") subject = tpl.subject;
                bodyHtml = tpl.body_html;
              } else {
                console.warn(`[automation] Email template "${emailTemplateName}" not found for tenant ${campaign.tenant_id}`);
              }
            }

            const { data: customer } = await supabase.from("customers")
              .select("id, name, email, custom_attributes").eq("id", item.customer_id).single();

            if (!customer?.email || !bodyHtml) {
              const reason = !customer?.email ? "missing email" : "missing content";
              console.warn(`[automation] Skipping email send for item ${item.id}: ${reason}`);
              const nextId = getNextNodeId(edges, currentNodeId);
              if (nextId) {
                currentNodeId = nextId;
                await supabase.from("automation_queue").update({ current_node_id: currentNodeId }).eq("id", item.id);
                continue;
              }
              await supabase.from("automation_queue").update({ status: "skipped", processed_at: now }).eq("id", item.id);
              break;
            }

            const triggerData = (item.trigger_data || {}) as any;
            let orderRecord: any = null;
            if (triggerData?.yampi_order_id || triggerData?.order_id || triggerData?.order_number) {
              let oq = supabase.from("orders").select("*").eq("tenant_id", campaign.tenant_id);
              if (triggerData.yampi_order_id) oq = oq.eq("external_id", `yampi_${triggerData.yampi_order_id}`);
              else if (triggerData.order_id) oq = oq.eq("id", triggerData.order_id);
              else if (triggerData.order_number) oq = oq.eq("order_number", triggerData.order_number);
              const { data: ord } = await oq.limit(1).single();
              orderRecord = ord;
            }

            const ctx = { customer, order: orderRecord, campaign: campaignVars, triggerData, tenantId: campaign.tenant_id };

            // Resolve variables in subject and body
            let resolvedSubject = subject;
            let resolvedBody = bodyHtml;

            // Simple variable replacement: {{customer.name}} -> "John"
            const varRegex = /\{\{([^}]+)\}\}/g;
            resolvedSubject = resolvedSubject.replace(varRegex, (match: string, key: string) => resolveVariable(key.trim(), ctx));
            resolvedBody = resolvedBody.replace(varRegex, (match: string, key: string) => resolveVariable(key.trim(), ctx));

            // Wrap links for tracking
            const finalBody = await wrapHtmlLinks(supabase, resolvedBody, {
              tenantId: campaign.tenant_id,
              campaignId: campaign.id,
              customerId: customer.id,
              campaignName: campaign.name
            });

            // Call send-email-ses edge function
            const sendRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email-ses`, {
              method: "POST",
              headers: { 
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json" 
              },
              body: JSON.stringify({
                to: customer.email,
                subject: resolvedSubject,
                html: finalBody,
                fromName,
                configurationSet,
                tenantId: campaign.tenant_id,
                campaignId: campaign.id,
                customerId: customer.id
              }),
            });

            const sendData = await sendRes.json().catch(() => ({}));
            if (!sendRes.ok || sendData.success === false) {
              const err = sendData.error || await sendRes.text();
              console.error(`[automation] Error sending email: ${err}`);
              
              if (sendData.error === "E-mail está na lista de descadastro.") {
                await supabase.from("automation_queue").update({ status: "skipped", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
              } else {
                await supabase.from("automation_queue").update({ status: "failed", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
              }
              break;
            }

            const nextId = getNextNodeId(edges, currentNodeId);
            if (nextId) {
              currentNodeId = nextId;
              await supabase.from("automation_queue").update({ current_node_id: currentNodeId, scheduled_for: null }).eq("id", item.id);
              continue;
            }
            await supabase.from("automation_queue").update({ status: "completed", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
            break;
          }

          // SEND WHATSAPP
          if (nodeType === "sendWhatsApp") {

            const templateName = node.data?.template || node.data?.templateName;
            const templateLanguage = node.data?.templateLanguage || "pt_BR";
            const triggerData = (item.trigger_data || {}) as any;

            if (!templateName) {
              const nextId = getNextNodeId(edges, currentNodeId, "out-3");
              if (nextId) { currentNodeId = nextId; await supabase.from("automation_queue").update({ current_node_id: currentNodeId }).eq("id", item.id); continue; }
              await supabase.from("automation_queue").update({ status: "failed", processed_at: now }).eq("id", item.id);
              break;
            }

            // Check if order is already paid for Pix/Checkout automations
            if (templateName.startsWith("pix_nao_pago") || templateName.startsWith("carrinho_abandonado")) {
              const isPaid = !(await isOrderStillUnpaid(supabase, triggerData, campaign.tenant_id));
              if (isPaid) {
                console.log(`[automation] Skipping paid order for template ${templateName} (item ${item.id})`);
                await supabase.from("automation_queue").update({ status: "skipped", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
                break;
              }
            }

            if (!phoneNumberId || !accessToken) {
              await supabase.from("automation_queue").update({ status: "failed", processed_at: now }).eq("id", item.id);
              break;
            }

            if (!templateCache.has(templateName)) {
              const { data: tpl } = await supabase.from("message_templates")
                .select("body, header_type, header_content, sample_values, buttons")
                .eq("name", templateName).eq("tenant_id", campaign.tenant_id).limit(1).single();
              templateCache.set(templateName, tpl);
            }
            const templateRecord = templateCache.get(templateName);

            if (!templateRecord) {
              const errMsg = `Template "${templateName}" não encontrado no banco de dados local. Sincronize os templates.`;
              console.error(`[automation] ${errMsg}`);
              await supabase.from("automation_queue").update({ status: "failed", processed_at: now }).eq("id", item.id);
              await supabase.from("campaign_activities").insert({
                tenant_id: campaign.tenant_id, campaign_id: campaign.id,
                customer_id: item.customer_id, status: "failed", channel: "whatsapp", 
                sent_at: new Date().toISOString(), error_message: errMsg,
              });
              break;
            }

            const bodyVarCount = templateRecord?.body ? (templateRecord.body.match(/\{\{\d+\}\}/g) || []).length : 0;
            const hasHeaderVar = templateRecord?.header_type === "text" && templateRecord?.header_content?.includes("{{");
            const variableMappings: string[] = (templateRecord?.sample_values as string[]) || [];
            const templateButtons = (templateRecord?.buttons as any[]) || [];
            const dynamicUrlBtnIndex = templateButtons.findIndex((b: any) => b.type === "URL" && b.url?.includes("{{"));
            const hasDynamicUrlButton = dynamicUrlBtnIndex >= 0;
            const copyCodeBtnIndices = templateButtons
              .map((b: any, i: number) => b.type === "COPY_CODE" ? { index: i, example: b.example || "" } : null)
              .filter(Boolean) as { index: number; example: string }[];

            const { data: customer } = await supabase.from("customers")
              .select("id, name, phone, email, document, custom_attributes").eq("id", item.customer_id).single();

            if (!customer?.phone) {
              await supabase.from("automation_queue").update({ status: "failed", processed_at: now }).eq("id", item.id);
              break;
            }

            let phone = customer.phone.replace(/[\s\-\(\)\+]/g, "");
            if (!phone.startsWith("55") && phone.length <= 11) phone = "55" + phone;

            let orderRecord: any = null;
            if (triggerData?.yampi_order_id || triggerData?.order_id || triggerData?.order_number) {
              let oq = supabase.from("orders").select("*").eq("tenant_id", campaign.tenant_id);
              if (triggerData.yampi_order_id) oq = oq.eq("external_id", `yampi_${triggerData.yampi_order_id}`);
              else if (triggerData.order_id) oq = oq.eq("id", triggerData.order_id);
              else if (triggerData.order_number) oq = oq.eq("order_number", triggerData.order_number);
              const { data: ord } = await oq.limit(1).single();
              orderRecord = ord;
            }

            // === Bling tracking enrichment ===
            // Check if any variable mapping or button URL needs order.tracking_code
            const buttonUrlsRaw = templateButtons.map((b: any) => b.url || "").join(" ");
            const usesTracking = variableMappings.includes("order.tracking_code") ||
              templateButtons.some((b: any) => {
                if (b.type !== "URL" || !b.url?.includes("{{")) return false;
                const m = b.url.match(/\{\{(\d+)\}\}/);
                if (!m) return false;
                const idx = parseInt(m[1], 10) - 1;
                return variableMappings[idx] === "order.tracking_code";
              });

            if (usesTracking && !orderRecord?.tracking_code) {
              console.log(`[automation] Template ${templateName} needs tracking_code but local order missing it. Querying Bling...`);
              const blingDoc = customer?.document || (orderRecord?.payment_summary as any)?.[0]?.document || null;
              const blingTracking = await fetchBlingTracking(
                campaign.tenant_id, blingDoc,
                orderRecord?.order_number || triggerData?.order_number || null, supabase
              );
              if (blingTracking?.tracking_code) {
                console.log(`[automation] Bling returned tracking_code=${blingTracking.tracking_code}`);
                if (orderRecord?.id) {
                  await supabase.from("orders").update({
                    tracking_code: blingTracking.tracking_code,
                    tracking_url: `https://rastreio.maxfem.com.br/${blingTracking.tracking_code}`,
                    carrier: blingTracking.carrier || orderRecord.carrier || null,
                  }).eq("id", orderRecord.id);
                }
                orderRecord = { ...(orderRecord || {}), tracking_code: blingTracking.tracking_code, tracking_url: `https://rastreio.maxfem.com.br/${blingTracking.tracking_code}`, carrier: blingTracking.carrier || orderRecord?.carrier || null };
              } else {
                // Tracking still unavailable — reschedule for 1h, max 6 retries
                const retries = (triggerData?.bling_retries || 0) + 1;
                if (retries <= 6) {
                  const nextRun = new Date(Date.now() + 60 * 60 * 1000).toISOString();
                  console.log(`[automation] Bling tracking not yet available. Rescheduling item ${item.id} for ${nextRun} (retry ${retries}/6).`);
                  await supabase.from("automation_queue").update({
                    scheduled_for: nextRun,
                    trigger_data: { ...triggerData, bling_retries: retries },
                  }).eq("id", item.id);
                  break;
                } else {
                  console.warn(`[automation] Bling tracking still missing after ${retries} retries. Skipping item ${item.id}.`);
                  await supabase.from("automation_queue").update({ status: "skipped", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
                  await supabase.from("campaign_activities").insert({
                    tenant_id: campaign.tenant_id, campaign_id: campaign.id, customer_id: customer.id,
                    status: "skipped", channel: "whatsapp", sent_at: new Date().toISOString(),
                    error_message: "Código de rastreio não disponível no Bling após 6 tentativas (24h).",
                  });
                  break;
                }
              }
            }

            const ctx = { customer, order: orderRecord, campaign: campaignVars, triggerData, tenantId: campaign.tenant_id };
            void buttonUrlsRaw;

            let buttonUrlCode: string | undefined;
            if (hasDynamicUrlButton) {
              const dynamicUrl = getCustomerDynamicUrl(customer, templateName);
              if (dynamicUrl) {
                // Create tracked shortlink for cart/pix URLs
                const code = generateCode(10);
                await supabase.from("tracked_links").insert({
                  tenant_id: campaign.tenant_id, campaign_id: campaign.id, customer_id: customer.id,
                  original_url: dynamicUrl, code, utm_source: "whatsapp", utm_medium: "automation", utm_campaign: campaign.name,
                });
                buttonUrlCode = code;
              } else {
                // Resolve button URL variable from template variable mappings
                // Button URLs in Meta always use {{1}}, but our DB may store {{N}} referencing body var index
                const btnUrl = templateButtons[dynamicUrlBtnIndex]?.url || "";
                const varMatch = btnUrl.match(/\{\{(\d+)\}\}/);
                if (varMatch) {
                  const varIdx = parseInt(varMatch[1], 10) - 1;
                  const varKey = variableMappings[varIdx] || "";
                  const resolvedValue = resolveVariable(varKey, ctx);
                  if (resolvedValue && resolvedValue !== "-") {
                    // If trackClicks is enabled, create a tracked link
                    const nodeTrackClicks = node.data?.trackClicks;
                    if (nodeTrackClicks) {
                      const code = generateCode(10);
                      await supabase.from("tracked_links").insert({
                        tenant_id: campaign.tenant_id, campaign_id: campaign.id, customer_id: customer.id,
                        original_url: btnUrl.replace(varMatch[0], resolvedValue), code,
                        utm_source: "whatsapp", utm_medium: "automation", utm_campaign: campaign.name,
                      });
                      buttonUrlCode = code;
                    } else {
                      // Pass the resolved value directly as button parameter
                      buttonUrlCode = resolvedValue;
                    }
                  }
                }
              }
            }

            // Resolve COPY_CODE button values
            const resolvedCopyCodeButtons = copyCodeBtnIndices.map(btn => {
              const value = btn.example ? resolveVariable(btn.example, ctx) : "-";
              console.log(`[automation] Resolving COPY_CODE button ${btn.index} with variable ${btn.example}: ${value}`);
              return {
                index: btn.index,
                value: value,
              };
            });

            const templatePayload = {
              messaging_product: "whatsapp", to: phone, type: "template",
              template: {
                name: templateName, language: { code: templateLanguage },
                components: buildTemplateComponents(variableMappings, ctx, bodyVarCount, hasHeaderVar, buttonUrlCode, hasDynamicUrlButton ? dynamicUrlBtnIndex : undefined, resolvedCopyCodeButtons.length > 0 ? resolvedCopyCodeButtons : undefined),
              },
            };
            
            console.log(`[automation] Sending message to ${phone} with payload:`, JSON.stringify(templatePayload, null, 2));

            const waRes = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(templatePayload),
            });

            const waData = await waRes.json();
            if (!waRes.ok) {
              const errorMessage = waData.error?.message || JSON.stringify(waData);
              console.error(`Item ${item.id}: send failed:`, errorMessage);
              
              await supabase.from("automation_queue").update({ status: "failed", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
              
              await supabase.from("campaign_activities").insert({
                tenant_id: campaign.tenant_id, campaign_id: campaign.id,
                customer_id: customer.id, status: "failed", channel: "whatsapp", 
                sent_at: new Date().toISOString(), error_message: errorMessage,
              });
              break;
            }

            if (waData.messages?.[0]?.id) {
              await supabase.from("whatsapp_messages").insert({
                tenant_id: campaign.tenant_id, customer_id: customer.id, phone,
                direction: "outbound", message_type: "template", template_name: templateName,
                wamid: waData.messages[0].id, status: "sent", content: `[Automação: ${templateName}]`,
              });
              await supabase.from("campaign_activities").insert({
                tenant_id: campaign.tenant_id, campaign_id: campaign.id,
                customer_id: customer.id, status: "sent", channel: "whatsapp", sent_at: new Date().toISOString(),
              });

              const nextId = getNextNodeId(edges, currentNodeId, "out-3") || getNextNodeId(edges, currentNodeId);
              if (nextId) {
                currentNodeId = nextId;
                await supabase.from("automation_queue").update({ current_node_id: currentNodeId, scheduled_for: null }).eq("id", item.id);
                continue;
              }
              await supabase.from("automation_queue").update({ status: "sent", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
              break;
            } else {
              console.error(`Item ${item.id}: send failed: ${waData?.error?.message || JSON.stringify(waData)}`);
              await supabase.from("automation_queue").update({ status: "failed", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
              break;
            }
          }

          // EXIT
          if (nodeType === "exit") {
            await supabase.from("automation_queue").update({ status: "completed", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
            break;
          }

          // ADD TAG
          if (nodeType === "addTag" && node.data?.tagName) {
            const { data: cust } = await supabase.from("customers").select("tags").eq("id", item.customer_id).single();
            const currentTags = cust?.tags || [];
            if (!currentTags.includes(node.data.tagName)) {
              await supabase.from("customers").update({ tags: [...currentTags, node.data.tagName] }).eq("id", item.customer_id);
            }
            const nextId = getNextNodeId(edges, currentNodeId);
            if (nextId) { currentNodeId = nextId; continue; }
            await supabase.from("automation_queue").update({ status: "completed", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
            break;
          }

          // REMOVE TAG
          if (nodeType === "removeTag" && node.data?.tagName) {
            const { data: cust } = await supabase.from("customers").select("tags").eq("id", item.customer_id).single();
            const currentTags = (cust?.tags || []).filter((t: string) => t !== node.data.tagName);
            await supabase.from("customers").update({ tags: currentTags }).eq("id", item.customer_id);
            const nextId = getNextNodeId(edges, currentNodeId);
            if (nextId) { currentNodeId = nextId; continue; }
            await supabase.from("automation_queue").update({ status: "completed", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
            break;
          }

          // DEFAULT: skip non-actionable nodes
          const nextId = getNextNodeId(edges, currentNodeId);
          if (nextId) {
            currentNodeId = nextId;
            await supabase.from("automation_queue").update({ current_node_id: currentNodeId }).eq("id", item.id);
            continue;
          }
          await supabase.from("automation_queue").update({ status: "completed", processed_at: now, current_node_id: currentNodeId }).eq("id", item.id);
          break;
        }

        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        console.error(`Queue item ${item.id} error:`, err);
        await supabase.from("automation_queue").update({ status: "failed", processed_at: now }).eq("id", item.id);
      }
    }

    results.push({ campaign_id: campaignId, processed: items.length });
  }

  return results;
}

// ===== SCHEDULED CAMPAIGN PROCESSOR =====

async function processScheduledCampaigns(supabase: any) {
  const results: any[] = [];

  const { data: campaigns, error: campErr } = await supabase
    .from("campaigns").select("*")
    .eq("kind", "campaign").eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  if (campErr) { console.error("Error fetching campaigns:", campErr); return results; }
  if (!campaigns || campaigns.length === 0) return results;

  for (const campaign of campaigns) {
    console.log(`Processing campaign: ${campaign.id} - ${campaign.name}`);

    const { error: lockErr } = await supabase.from("campaigns").update({ status: "sending" }).eq("id", campaign.id).eq("status", "scheduled");
    if (lockErr) { console.error(`Failed to lock campaign ${campaign.id}:`, lockErr); continue; }

    let lastError = "";

    try {
      const { phoneNumberId, accessToken } = await resolveWhatsAppCredentials(supabase, campaign.tenant_id);

      if (!phoneNumberId || !accessToken) {
        const errMsg = "Credenciais do WhatsApp não encontradas";
        await supabase.from("campaigns").update({ status: "failed", last_error: errMsg }).eq("id", campaign.id);
        results.push({ campaign_id: campaign.id, error: errMsg });
        continue;
      }

      const flowData = campaign.flow_data as any;
      let templateName: string | null = null;
      let templateLanguage = "pt_BR";
      let emailTemplate: any = null;

      if (flowData?.nodes) {
        const waNode = flowData.nodes.find((n: any) => (n.data?.nodeType === "sendWhatsApp" || n.type === "sendWhatsApp") && (n.data?.template || n.data?.templateName));
        if (waNode) {
          templateName = waNode.data.template || waNode.data.templateName;
          templateLanguage = waNode.data.templateLanguage || "pt_BR";
        }

        const emNode = flowData.nodes.find((n: any) => n.data?.nodeType === "sendEmail" || n.type === "sendEmail");
        if (emNode) {
          let emSubject = emNode.data.subject || "E-mail importante";
          let emBody = emNode.data.content || emNode.data.body || "";
          const emTemplateName = emNode.data.emailTemplate;

          if (emTemplateName && !emBody) {
             const { data: tpl } = await supabase.from("email_templates")
                .select("subject, body_html")
                .eq("name", emTemplateName)
                .eq("tenant_id", campaign.tenant_id)
                .maybeSingle();
              if (tpl) {
                if (emSubject === "SEM SSUNTO" || !emSubject || emSubject === "E-mail importante") emSubject = tpl.subject;
                emBody = tpl.body_html;
              }
          }

          if (emBody) {
            emailTemplate = {
              subject: emSubject,
              bodyHtml: emBody,
              fromName: emNode.data.fromName || "",
              configurationSet: (emNode.data.configurationSet || "").trim() || null
            };
          }
        }
      }

      if (!templateName && !emailTemplate) {
        const errMsg = "Nenhum template de WhatsApp ou E-mail encontrado no fluxo";
        await supabase.from("campaigns").update({ status: "failed", last_error: errMsg }).eq("id", campaign.id);
        results.push({ campaign_id: campaign.id, error: errMsg });
        continue;
      }

      let templateRecord: any = null;
      let bodyVarCount = 0;
      let hasHeaderVar = false;
      let variableMappings: string[] = [];
      let templateButtons: any[] = [];
      let dynamicUrlBtnIndex = -1;
      let hasDynamicUrlButton = false;

      if (templateName) {
        const { data: tRecord } = await supabase.from("message_templates")
          .select("body, header_type, header_content, sample_values, buttons")
          .eq("name", templateName).eq("tenant_id", campaign.tenant_id).limit(1).single();
        
        templateRecord = tRecord;
        if (templateRecord) {
          bodyVarCount = templateRecord.body ? (templateRecord.body.match(/\{\{\d+\}\}/g) || []).length : 0;
          hasHeaderVar = templateRecord.header_type === "text" && templateRecord.header_content?.includes("{{");
          variableMappings = (templateRecord.sample_values as string[]) || [];
          templateButtons = (templateRecord.buttons as any[]) || [];
          dynamicUrlBtnIndex = templateButtons.findIndex((b: any) => b.type === "URL" && b.url?.includes("{{1}}"));
          hasDynamicUrlButton = dynamicUrlBtnIndex >= 0;
        }
      }

      const campaignVars: any = {};
      if (flowData?.nodes) {
        for (const node of flowData.nodes) {
          if (node.data?.coupon) campaignVars.coupon = node.data.coupon;
          if (node.data?.discount) campaignVars.discount = node.data.discount;
          if (node.data?.product_name) campaignVars.product_name = node.data.product_name;
          if (node.data?.product_desc) campaignVars.product_desc = node.data.product_desc;
          if (node.data?.return_days) campaignVars.return_days = node.data.return_days;
        }
      }

      const needsOrderData = variableMappings.some((m) => m.startsWith("order."));

      // Load customers with pagination
      let customers: any[] = [];
      if (campaign.list_id) {
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data: members } = await supabase.from("contact_list_members")
            .select("customer_id, customers(id, name, phone, email, custom_attributes)")
            .eq("list_id", campaign.list_id).range(from, from + pageSize - 1);
          if (!members || members.length === 0) break;
          customers.push(...members.map((m: any) => m.customers).filter((c: any) => (templateName && c?.phone) || (emailTemplate && c?.email)));
          if (members.length < pageSize) break;
          from += pageSize;
        }
      } else {
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data } = await supabase.from("customers")
            .select("id, name, phone, email, custom_attributes")
            .eq("tenant_id", campaign.tenant_id)
            .or(`phone.not.is.null,email.not.is.null`)
            .range(from, from + pageSize - 1);
          if (!data || data.length === 0) break;
          customers.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
      }

      // Load orders if needed
      let ordersByCustomer = new Map<string, any>();
      if (needsOrderData && customers.length > 0) {
        const customerIds = customers.map((c) => c.id);
        for (let i = 0; i < customerIds.length; i += 500) {
          const batch = customerIds.slice(i, i + 500);
          const { data: orders } = await supabase.from("orders")
            .select("id, customer_id, external_id, total, status, mapped_status")
            .eq("tenant_id", campaign.tenant_id).in("customer_id", batch)
            .order("created_at", { ascending: false });
          for (const o of (orders || [])) {
            if (!ordersByCustomer.has(o.customer_id)) ordersByCustomer.set(o.customer_id, o);
          }
        }
      }

      if (customers.length === 0) {
        const errMsg = "Nenhum contato válido encontrado (com telefone ou e-mail)";
        await supabase.from("campaigns").update({ status: "failed", last_error: errMsg }).eq("id", campaign.id);
        results.push({ campaign_id: campaign.id, sent: 0, failed: 0, total: 0, status: "failed", error: errMsg });
        continue;
      }

      let sentCount = 0;
      let failedCount = 0;

      for (const customer of customers) {
        try {
          const ctx = { customer, order: ordersByCustomer.get(customer.id) || null, campaign: campaignVars, tenantId: campaign.tenant_id };

          // 1. WhatsApp send
          if (templateName && customer.phone) {
            let phone = customer.phone.replace(/[\s\-\(\)\+]/g, "");
            if (!phone.startsWith("55") && phone.length <= 11) phone = "55" + phone;

            let buttonUrlCode: string | undefined;
            if (hasDynamicUrlButton) {
              const dynamicUrl = getCustomerDynamicUrl(customer, templateName!);
              if (dynamicUrl) {
                const code = generateCode(10);
                await supabase.from("tracked_links").insert({
                  tenant_id: campaign.tenant_id, campaign_id: campaign.id, customer_id: customer.id,
                  original_url: dynamicUrl, code, utm_source: "whatsapp", utm_medium: "campaign", utm_campaign: campaign.name,
                });
                buttonUrlCode = code;
              }
            }

            const waRes = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                messaging_product: "whatsapp", to: phone, type: "template",
                template: {
                  name: templateName, language: { code: templateLanguage },
                  components: buildTemplateComponents(variableMappings, ctx, bodyVarCount, hasHeaderVar, buttonUrlCode, hasDynamicUrlButton ? dynamicUrlBtnIndex : undefined),
                },
              }),
            });

            const waData = await waRes.json();
            if (waData.messages?.[0]?.id) {
              await supabase.from("whatsapp_messages").insert({
                tenant_id: campaign.tenant_id, customer_id: customer.id, phone,
                direction: "outbound", message_type: "template", template_name: templateName,
                wamid: waData.messages[0].id, status: "sent", content: `[Template: ${templateName}]`,
              });
              await supabase.from("campaign_activities").upsert({
                tenant_id: campaign.tenant_id, campaign_id: campaign.id,
                customer_id: customer.id, status: "sent", channel: "whatsapp", sent_at: new Date().toISOString(),
              }, { onConflict: "campaign_id, customer_id" });
              sentCount++;
            } else {
              lastError = waData?.error?.message || JSON.stringify(waData);
              failedCount++;
            }
          }

          // 2. Email send
          if (emailTemplate && customer.email) {
            const varRegex = /\{\{([^}]+)\}\}/g;
            const resolvedSubject = emailTemplate.subject.replace(varRegex, (match: string, key: string) => resolveVariable(key.trim(), ctx));
            const resolvedBody = emailTemplate.bodyHtml.replace(varRegex, (match: string, key: string) => resolveVariable(key.trim(), ctx));
            
            const finalBody = await wrapHtmlLinks(supabase, resolvedBody, {
              tenantId: campaign.tenant_id,
              campaignId: campaign.id,
              customerId: customer.id,
              campaignName: campaign.name
            });

            const sendRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email-ses`, {
              method: "POST",
              headers: { 
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json" 
              },
              body: JSON.stringify({
                to: customer.email,
                subject: resolvedSubject,
                html: finalBody,
                fromName: emailTemplate.fromName,
                ...(emailTemplate.configurationSet ? { configurationSet: emailTemplate.configurationSet } : {}),
                tenantId: campaign.tenant_id,
                campaignId: campaign.id,
                customerId: customer.id
              }),
            });

            if (sendRes.ok) {
              sentCount++;
            } else {
              const errTxt = await sendRes.text();
              lastError = `Email error: ${errTxt}`;
              failedCount++;
            }
          }

          await new Promise((r) => setTimeout(r, 50));
        } catch (err) {
          console.error(`Error sending to customer ${customer.id}:`, err);
          failedCount++;
        }
      }

      const finalStatus = sentCount > 0 ? "sent" : "failed";
      const errorMsg = finalStatus === "failed" ? `Todos os ${failedCount} envios falharam. Último erro: ${lastError}` : null;
      await supabase.from("campaigns").update({ status: finalStatus, last_error: errorMsg }).eq("id", campaign.id);
      results.push({ campaign_id: campaign.id, sent: sentCount, failed: failedCount, total: customers.length, status: finalStatus });
    } catch (err) {
      const errMsg = `Erro interno: ${String(err)}`;
      await supabase.from("campaigns").update({ status: "failed", last_error: errMsg }).eq("id", campaign.id);
      results.push({ campaign_id: campaign.id, error: String(err) });
    }
  }

  return results;
}

// ===== RATE LIMITING =====
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 30; // 30 requests/min for executor
}

// ===== MAIN HANDLER =====

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Authenticate cron requests: accept service_role JWT only
  const authBearer = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!authBearer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  // Verify it's a service_role JWT by decoding payload
  try {
    const payload = JSON.parse(atob(authBearer.split(".")[1]));
    if (payload.role !== "service_role") {
      console.log(`[auth] Rejected: role=${payload.role}, expected service_role`);
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const campaignResults = await processScheduledCampaigns(supabase);
    const automationResults = await processAutomationQueue(supabase);

    if (campaignResults.length === 0 && automationResults.length === 0) {
      return new Response(JSON.stringify({ message: "No campaigns or automations to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ processed: campaignResults, automations: automationResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Campaign executor error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
