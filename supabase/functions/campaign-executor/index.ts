import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Resolve a variable key like "customer.name" or "order.total" from context data
function resolveVariable(key: string, ctx: {
  customer: any;
  order: any;
  campaign: any;
}): string {
  const { customer, order, campaign } = ctx;
  const attrs = customer?.custom_attributes || {};
  const cart = attrs?.abandoned_cart || {};

  switch (key) {
    // Customer fields
    case "customer.name":
      return customer?.name || "Cliente";
    case "customer.first_name":
      return (customer?.name || "Cliente").split(" ")[0];
    case "customer.phone":
      return customer?.phone || "";
    case "customer.email":
      return customer?.email || "";
    case "customer.city":
      return attrs?.city || "";
    case "customer.state":
      return attrs?.state || "";
    case "customer.days_since_order": {
      if (!attrs?.last_order_date) return "-";
      const lastDate = new Date(attrs.last_order_date);
      const diff = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      return String(diff);
    }
    case "customer.last_product":
      return attrs?.last_product || "seu produto favorito";
    case "customer.last_order_value":
      return attrs?.last_order_value ? formatCurrency(attrs.last_order_value) : "-";

    // Cart (abandoned) fields
    case "cart.recovery_url":
      return cart?.recovery_url || "";
    case "cart.value":
      return cart?.value ? formatCurrency(cart.value) : "-";
    case "cart.items_count":
      return String(cart?.items_count || 0);
    case "cart.items_summary":
      return cart?.items_summary || "seus itens selecionados";

    // Order fields
    case "order.number":
      return order?.external_id?.replace("yampi_", "") || order?.id?.slice(0, 8) || "-";
    case "order.total":
      return order?.total ? formatCurrency(order.total) : "-";
    case "order.status":
      return order?.mapped_status || order?.status || "-";
    case "order.tracking_code":
      return order?.tracking_code || "-";
    case "order.delivery_days":
      return order?.delivery_days || "5 a 8";

    // Campaign-level fields (set by campaign creator)
    case "campaign.coupon":
      return campaign?.coupon || "-";
    case "campaign.discount":
      return campaign?.discount || "-";
    case "campaign.product_name":
      return campaign?.product_name || "-";
    case "campaign.product_desc":
      return campaign?.product_desc || "-";
    case "campaign.return_days":
      return campaign?.return_days || "5";

    default:
      return "-";
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Generate a random short code for tracked links
function generateCode(len = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Determine the dynamic URL for a customer (cart recovery or pix payment)
function getCustomerDynamicUrl(customer: any, templateName: string): string | null {
  const attrs = customer?.custom_attributes || {};
  const cart = attrs?.abandoned_cart || {};

  // Cart abandoned templates → Yampi checkout recovery URL
  if (templateName.startsWith("carrinho_abandonado") && cart?.recovery_url) {
    return cart.recovery_url;
  }

  // Pix payment templates → Yampi payment URL (or fallback to account page)
  if (templateName.startsWith("pix_nao_pago")) {
    return attrs?.pix_payment_url || attrs?.payment_url || "https://maxfem.com.br/account";
  }

  return null;
}

// Build template components with parameters filled from resolved variables
function buildTemplateComponents(
  variableMappings: string[],
  ctx: { customer: any; order: any; campaign: any },
  bodyVarCount: number,
  hasHeaderVar: boolean,
  buttonUrlCode?: string, // tracked link code for dynamic URL buttons
  buttonUrlIndex?: number, // which button (0-based) has the dynamic URL
) {
  const components: any[] = [];

  // Header parameters (if template header has {{1}})
  if (hasHeaderVar) {
    components.push({
      type: "header",
      parameters: [{ type: "text", text: resolveVariable("customer.name", ctx) }],
    });
  }

  // Body parameters
  if (bodyVarCount > 0) {
    const params: any[] = [];
    for (let i = 0; i < bodyVarCount; i++) {
      const key = variableMappings[i] || "customer.name";
      const value = resolveVariable(key, ctx);
      params.push({ type: "text", text: value || "-" });
    }
    components.push({ type: "body", parameters: params });
  }

  // Button URL parameters (dynamic {{1}} in URL buttons)
  if (buttonUrlCode !== undefined && buttonUrlIndex !== undefined) {
    components.push({
      type: "button",
      sub_type: "url",
      index: String(buttonUrlIndex),
      parameters: [{ type: "text", text: buttonUrlCode }],
    });
  }

  return components;
}

// Parse delay string from flow node config into milliseconds
function parseDelayMs(delay: string | undefined): number {
  if (!delay || delay === "Sem atraso") return 0;
  if (delay === "5 minutos") return 5 * 60 * 1000;
  if (delay === "15 minutos") return 15 * 60 * 1000;
  if (delay === "1 hora") return 60 * 60 * 1000;
  if (delay === "1 dia") return 24 * 60 * 60 * 1000;
  return 0;
}

// Check if a pix/boleto order is still unpaid
async function isOrderStillUnpaid(supabase: any, triggerData: any, tenantId: string): Promise<boolean> {
  const yampiOrderId = triggerData?.yampi_order_id;
  const orderId = triggerData?.order_id;
  if (!yampiOrderId && !orderId) return true; // no order reference, proceed anyway

  let query = supabase
    .from("orders")
    .select("mapped_status, status")
    .eq("tenant_id", tenantId);

  if (yampiOrderId) {
    query = query.eq("external_id", `yampi_${yampiOrderId}`);
  } else {
    query = query.eq("id", orderId);
  }

  const { data: order } = await query.limit(1).single();
  if (!order) return true; // order not found, proceed

  const paidStatuses = ["paid", "pago", "approved", "aprovado", "invoiced", "faturado", "shipped", "enviado", "delivered", "entregue"];
  const status = (order.mapped_status || order.status || "").toLowerCase();
  return !paidStatuses.includes(status);
}

// ===== FLOW GRAPH HELPERS =====

interface FlowNode {
  id: string;
  type: string;
  data: Record<string, any>;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

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

function calculateWaitMs(waitTime: number | string, waitUnit: string): number {
  const t = Number(waitTime) || 0;
  switch (waitUnit) {
    case "minutes": return t * 60 * 1000;
    case "hours": return t * 60 * 60 * 1000;
    case "days": return t * 24 * 60 * 60 * 1000;
    default: return t * 60 * 1000;
  }
}

// Evaluate a condition node against live data
async function evaluateCondition(
  supabase: any, node: FlowNode, item: any
): Promise<boolean> {
  const data = node.data || {};
  const field = data.conditionField || "";
  const op = data.conditionOp || "equals";
  const value = data.conditionValue || "";
  const triggerData = (item.trigger_data || {}) as any;

  // Built-in condition: payment_status (check if order is paid)
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

  // Built-in condition: cart_purchased (check if customer placed order after cart)
  if (field === "cart_purchased") {
    const cartTime = triggerData?.updated_at || item.created_at;
    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("tenant_id", item.tenant_id)
      .eq("customer_id", item.customer_id)
      .gte("created_at", cartTime)
      .limit(1);
    const hasPurchased = (orders || []).length > 0;
    return value === "no" ? !hasPurchased : hasPurchased;
  }

  // Generic trigger_data field comparison
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

// ===== AUTOMATION QUEUE PROCESSOR (GRAPH WALKER) =====
async function processAutomationQueue(supabase: any) {
  const results: any[] = [];

  // Fetch pending items whose scheduled_for has passed (or is null)
  // No date cutoff here — filtering happens at insertion time (yampi-sync / automation-cron)
  const now = new Date().toISOString();
  const { data: queueItems, error: qErr } = await supabase
    .from("automation_queue")
    .select("id, tenant_id, campaign_id, customer_id, trigger_type, trigger_data, created_at, current_node_id, scheduled_for")
    .eq("status", "pending")
    .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(50);

  if (qErr || !queueItems || queueItems.length === 0) {
    return results;
  }

  console.log(`Processing ${queueItems.length} automation queue items (graph walker)`);

  // Group by campaign
  const byCampaign = new Map<string, any[]>();
  for (const item of queueItems) {
    const list = byCampaign.get(item.campaign_id) || [];
    list.push(item);
    byCampaign.set(item.campaign_id, list);
  }

  for (const [campaignId, items] of byCampaign) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (!campaign || campaign.status !== "running") {
      for (const item of items) {
        await supabase.from("automation_queue").update({ status: "failed", processed_at: now }).eq("id", item.id);
      }
      continue;
    }

    const flowData = campaign.flow_data as any;
    const nodes: FlowNode[] = flowData?.nodes || [];
    const edges: FlowEdge[] = flowData?.edges || [];

    if (nodes.length === 0) {
      for (const item of items) {
        await supabase.from("automation_queue").update({ status: "failed", processed_at: now }).eq("id", item.id);
      }
      continue;
    }

    // Get WhatsApp credentials once per campaign
    const { data: waAccount } = await supabase
      .from("whatsapp_accounts")
      .select("phone_number_id")
      .eq("tenant_id", campaign.tenant_id)
      .eq("is_active", true)
      .limit(1)
      .single();

    const phoneNumberId = waAccount?.phone_number_id || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");

    // Extract campaign-level variables
    const campaignVars: any = {};
    for (const node of nodes) {
      if (node.data?.coupon) campaignVars.coupon = node.data.coupon;
      if (node.data?.discount) campaignVars.discount = node.data.discount;
    }

    // Template cache to avoid re-fetching
    const templateCache = new Map<string, any>();

    for (const item of items) {
      try {
        // Walk the graph from current_node_id
        let currentNodeId = item.current_node_id || "start";
        let stepCount = 0;
        const MAX_STEPS = 20; // safety limit

        while (stepCount < MAX_STEPS) {
          stepCount++;

          // If we're at "start", find the first edge from the start node
          if (currentNodeId === "start") {
            const startNode = nodes.find(n => n.type === "startNode" || n.data?.nodeType === "start");
            if (startNode) {
              const nextId = getNextNodeId(edges, startNode.id);
              if (nextId) {
                currentNodeId = nextId;
                continue;
              }
            }
            // No start node or no edge from it — try first edge from any node
            const firstEdge = edges[0];
            if (firstEdge) {
              currentNodeId = firstEdge.target;
              continue;
            }
            // No edges at all — done
            await supabase.from("automation_queue").update({
              status: "completed", processed_at: now, current_node_id: currentNodeId,
            }).eq("id", item.id);
            break;
          }

          const node = getNodeById(nodes, currentNodeId);
          if (!node) {
            // Node not found — mark completed
            await supabase.from("automation_queue").update({
              status: "completed", processed_at: now, current_node_id: currentNodeId,
            }).eq("id", item.id);
            break;
          }

          const nodeType = node.data?.nodeType || node.type;

          // ---- WAIT NODE ----
          if (nodeType === "wait" || nodeType === "waitDate" || nodeType === "waitCondition") {
            const waitMs = calculateWaitMs(node.data?.waitTime || 0, node.data?.waitUnit || "minutes");
            const scheduledFor = new Date(Date.now() + waitMs).toISOString();
            const nextId = getNextNodeId(edges, currentNodeId);

            if (nextId) {
              await supabase.from("automation_queue").update({
                current_node_id: nextId,
                scheduled_for: scheduledFor,
              }).eq("id", item.id);
              console.log(`Item ${item.id}: wait ${node.data?.waitTime} ${node.data?.waitUnit}, scheduled for ${scheduledFor}`);
            } else {
              await supabase.from("automation_queue").update({
                status: "completed", processed_at: now, current_node_id: currentNodeId,
              }).eq("id", item.id);
            }
            break; // Stop walking — will resume after scheduled_for
          }

          // ---- CONDITION NODE ----
          if (nodeType === "condition" || nodeType === "multiCondition") {
            const conditionMet = await evaluateCondition(supabase, node, item);
            const handle = conditionMet ? "condition-true" : "condition-false";
            const nextId = getNextNodeId(edges, currentNodeId, handle);

            console.log(`Item ${item.id}: condition ${node.data?.conditionField} = ${conditionMet}, next: ${nextId}`);

            if (nextId) {
              currentNodeId = nextId;
              // Update position and continue walking
              await supabase.from("automation_queue").update({
                current_node_id: currentNodeId, scheduled_for: null,
              }).eq("id", item.id);
              continue;
            } else {
              // No next node on this branch — completed
              await supabase.from("automation_queue").update({
                status: conditionMet ? "completed" : "skipped",
                processed_at: now,
                current_node_id: currentNodeId,
              }).eq("id", item.id);
              break;
            }
          }

          // ---- SEND WHATSAPP NODE ----
          if (nodeType === "sendWhatsApp") {
            if (!phoneNumberId || !accessToken) {
              console.error(`Item ${item.id}: no WhatsApp credentials`);
              await supabase.from("automation_queue").update({ status: "failed", processed_at: now }).eq("id", item.id);
              break;
            }

            const templateName = node.data?.template || node.data?.templateName;
            const templateLanguage = node.data?.templateLanguage || "pt_BR";

            if (!templateName) {
              console.error(`Item ${item.id}: sendWhatsApp node has no template`);
              const nextId = getNextNodeId(edges, currentNodeId, "out-3"); // "Próxima etapa"
              if (nextId) {
                currentNodeId = nextId;
                await supabase.from("automation_queue").update({ current_node_id: currentNodeId }).eq("id", item.id);
                continue;
              }
              await supabase.from("automation_queue").update({ status: "failed", processed_at: now }).eq("id", item.id);
              break;
            }

            // Load template (cached)
            if (!templateCache.has(templateName)) {
              const { data: tpl } = await supabase
                .from("message_templates")
                .select("body, header_type, header_content, sample_values, buttons")
                .eq("name", templateName)
                .eq("tenant_id", campaign.tenant_id)
                .limit(1).single();
              templateCache.set(templateName, tpl);
            }
            const templateRecord = templateCache.get(templateName);

            const bodyVarCount = templateRecord?.body
              ? (templateRecord.body.match(/\{\{\d+\}\}/g) || []).length : 0;
            const hasHeaderVar = templateRecord?.header_type === "text" &&
              templateRecord?.header_content?.includes("{{");
            const variableMappings: string[] = (templateRecord?.sample_values as string[]) || [];
            const templateButtons = (templateRecord?.buttons as any[]) || [];
            const dynamicUrlBtnIndex = templateButtons.findIndex(
              (b: any) => b.type === "URL" && b.url?.includes("{{1}}")
            );
            const hasDynamicUrlButton = dynamicUrlBtnIndex >= 0;

            // Load customer
            const { data: customer } = await supabase
              .from("customers")
              .select("id, name, phone, email, custom_attributes")
              .eq("id", item.customer_id).single();

            if (!customer?.phone) {
              await supabase.from("automation_queue").update({ status: "failed", processed_at: now }).eq("id", item.id);
              break;
            }

            let phone = customer.phone.replace(/[\s\-\(\)\+]/g, "");
            if (!phone.startsWith("55") && phone.length <= 11) phone = "55" + phone;

            const ctx = { customer, order: null, campaign: campaignVars };

            // Tracked link for dynamic URL button
            let buttonUrlCode: string | undefined;
            if (hasDynamicUrlButton) {
              const dynamicUrl = getCustomerDynamicUrl(customer, templateName);
              if (dynamicUrl) {
                const code = generateCode(10);
                await supabase.from("tracked_links").insert({
                  tenant_id: campaign.tenant_id, campaign_id: campaign.id,
                  customer_id: customer.id, original_url: dynamicUrl, code,
                  utm_source: "whatsapp", utm_medium: "automation", utm_campaign: campaign.name,
                });
                buttonUrlCode = code;
              }
            }

            // Send via Meta
            const waRes = await fetch(
              `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
              {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  messaging_product: "whatsapp", to: phone, type: "template",
                  template: {
                    name: templateName,
                    language: { code: templateLanguage },
                    components: buildTemplateComponents(
                      variableMappings, ctx, bodyVarCount, hasHeaderVar,
                      buttonUrlCode, hasDynamicUrlButton ? dynamicUrlBtnIndex : undefined,
                    ),
                  },
                }),
              }
            );

            const waData = await waRes.json();

            if (waData.messages?.[0]?.id) {
              await supabase.from("whatsapp_messages").insert({
                tenant_id: campaign.tenant_id, customer_id: customer.id, phone,
                direction: "outbound", message_type: "template", template_name: templateName,
                wamid: waData.messages[0].id, status: "sent",
                content: `[Automação: ${templateName}]`,
              });
              await supabase.from("campaign_activities").insert({
                tenant_id: campaign.tenant_id, campaign_id: campaign.id,
                customer_id: customer.id, status: "sent", channel: "whatsapp",
                sent_at: new Date().toISOString(),
              });
              console.log(`Item ${item.id}: sent ${templateName} to ${phone}`);

              // Advance to next node via "out-3" (Próxima etapa) handle
              const nextId = getNextNodeId(edges, currentNodeId, "out-3")
                || getNextNodeId(edges, currentNodeId);
              if (nextId) {
                currentNodeId = nextId;
                await supabase.from("automation_queue").update({
                  current_node_id: currentNodeId, scheduled_for: null,
                }).eq("id", item.id);
                continue; // Keep walking
              } else {
                await supabase.from("automation_queue").update({
                  status: "sent", processed_at: now, current_node_id: currentNodeId,
                }).eq("id", item.id);
                break;
              }
            } else {
              const apiErr = waData?.error?.message || JSON.stringify(waData);
              console.error(`Item ${item.id}: send failed: ${apiErr}`);
              await supabase.from("automation_queue").update({
                status: "failed", processed_at: now, current_node_id: currentNodeId,
              }).eq("id", item.id);
              break;
            }
          }

          // ---- EXIT NODE ----
          if (nodeType === "exit") {
            await supabase.from("automation_queue").update({
              status: "completed", processed_at: now, current_node_id: currentNodeId,
            }).eq("id", item.id);
            break;
          }

          // ---- ADD TAG ----
          if (nodeType === "addTag" && node.data?.tagName) {
            await supabase.rpc("", {}); // Tags are array append
            const { data: cust } = await supabase.from("customers")
              .select("tags").eq("id", item.customer_id).single();
            const currentTags = cust?.tags || [];
            if (!currentTags.includes(node.data.tagName)) {
              await supabase.from("customers").update({
                tags: [...currentTags, node.data.tagName],
              }).eq("id", item.customer_id);
            }
            const nextId = getNextNodeId(edges, currentNodeId);
            if (nextId) { currentNodeId = nextId; continue; }
            await supabase.from("automation_queue").update({
              status: "completed", processed_at: now, current_node_id: currentNodeId,
            }).eq("id", item.id);
            break;
          }

          // ---- REMOVE TAG ----
          if (nodeType === "removeTag" && node.data?.tagName) {
            const { data: cust } = await supabase.from("customers")
              .select("tags").eq("id", item.customer_id).single();
            const currentTags = (cust?.tags || []).filter((t: string) => t !== node.data.tagName);
            await supabase.from("customers").update({ tags: currentTags }).eq("id", item.customer_id);
            const nextId = getNextNodeId(edges, currentNodeId);
            if (nextId) { currentNodeId = nextId; continue; }
            await supabase.from("automation_queue").update({
              status: "completed", processed_at: now, current_node_id: currentNodeId,
            }).eq("id", item.id);
            break;
          }

          // ---- ARCHIVE CHAT / TRANSFER / NOTE / UNKNOWN ----
          // Skip non-actionable nodes, advance to next
          const nextId = getNextNodeId(edges, currentNodeId);
          if (nextId) {
            currentNodeId = nextId;
            await supabase.from("automation_queue").update({ current_node_id: currentNodeId }).eq("id", item.id);
            continue;
          }
          await supabase.from("automation_queue").update({
            status: "completed", processed_at: now, current_node_id: currentNodeId,
          }).eq("id", item.id);
          break;
        }

        // Rate limit between items
        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        console.error(`Queue item ${item.id} error:`, err);
        await supabase.from("automation_queue").update({
          status: "failed", processed_at: now,
        }).eq("id", item.id);
      }
    }

    results.push({ campaign_id: campaignId, processed: items.length });
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find campaigns ready to send
    const { data: campaigns, error: campErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("kind", "campaign")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());

    if (campErr) {
      console.error("Error fetching campaigns:", campErr);
      return new Response(JSON.stringify({ error: campErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!campaigns || campaigns.length === 0) {
      console.log("No scheduled campaigns, checking automation queue...");
    }

    // ===== PROCESS AUTOMATION QUEUE =====
    const automationResults = await processAutomationQueue(supabase);
    
    if ((!campaigns || campaigns.length === 0) && automationResults.length === 0) {
      return new Response(JSON.stringify({ message: "No campaigns or automations to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const campaign of campaigns) {
      console.log(`Processing campaign: ${campaign.id} - ${campaign.name}`);

      // Mark as sending to prevent duplicate processing
      const { error: lockErr } = await supabase
        .from("campaigns")
        .update({ status: "sending" })
        .eq("id", campaign.id)
        .eq("status", "scheduled");

      if (lockErr) {
        console.error(`Failed to lock campaign ${campaign.id}:`, lockErr);
        continue;
      }

      let lastError = "";

      try {
        // Get WhatsApp account for this tenant
        const { data: waAccount } = await supabase
          .from("whatsapp_accounts")
          .select("phone_number_id")
          .eq("tenant_id", campaign.tenant_id)
          .eq("is_active", true)
          .limit(1)
          .single();

        const phoneNumberId = waAccount?.phone_number_id || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
        const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");

        if (!phoneNumberId || !accessToken) {
          const errMsg = "Credenciais do WhatsApp não encontradas (phone_number_id ou access_token)";
          console.error(`Campaign ${campaign.id}: ${errMsg}`);
          await supabase.from("campaigns").update({ status: "failed", last_error: errMsg }).eq("id", campaign.id);
          results.push({ campaign_id: campaign.id, error: errMsg });
          continue;
        }

        // Extract template from flow_data
        const flowData = campaign.flow_data as any;
        let templateName: string | null = null;
        let templateLanguage = "pt_BR";

        if (flowData?.nodes) {
          const sendNode = flowData.nodes.find(
            (n: any) => n.data?.nodeType === "sendWhatsApp" && (n.data?.template || n.data?.templateName)
          );
          if (sendNode) {
            templateName = sendNode.data.template || sendNode.data.templateName;
            templateLanguage = sendNode.data.templateLanguage || "pt_BR";
          }
        }

        if (!templateName) {
          const errMsg = "Nenhum template de WhatsApp encontrado no fluxo da campanha";
          console.error(`Campaign ${campaign.id}: ${errMsg}`);
          await supabase.from("campaigns").update({ status: "failed", last_error: errMsg }).eq("id", campaign.id);
          results.push({ campaign_id: campaign.id, error: errMsg });
          continue;
        }

        // Fetch template from DB to detect variables AND get sample_values mappings
        const { data: templateRecord } = await supabase
          .from("message_templates")
          .select("body, header_type, header_content, sample_values, buttons")
          .eq("name", templateName)
          .eq("tenant_id", campaign.tenant_id)
          .limit(1)
          .single();

        // Count body variables like {{1}}, {{2}}, etc.
        const bodyVarCount = templateRecord?.body
          ? (templateRecord.body.match(/\{\{\d+\}\}/g) || []).length
          : 0;
        const hasHeaderVar = templateRecord?.header_type === "text" &&
          templateRecord?.header_content?.includes("{{");

        // Get variable mappings from sample_values (e.g. ["customer.name", "order.total"])
        const variableMappings: string[] = (templateRecord?.sample_values as string[]) || [];

        // Detect if any URL button has a dynamic {{1}} variable
        const templateButtons = (templateRecord?.buttons as any[]) || [];
        const dynamicUrlBtnIndex = templateButtons.findIndex(
          (b: any) => b.type === "URL" && b.url?.includes("{{1}}")
        );
        const hasDynamicUrlButton = dynamicUrlBtnIndex >= 0;

        console.log(`Campaign ${campaign.id}: template ${templateName} has ${bodyVarCount} body vars, headerVar=${hasHeaderVar}, dynamicUrlBtn=${hasDynamicUrlButton}, mappings=${JSON.stringify(variableMappings)}`);

        // Extract campaign-level variables from actions/flow
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

        // Determine if we need order data
        const needsOrderData = variableMappings.some((m) => m.startsWith("order."));

        // Get contacts with FULL data (including custom_attributes for Yampi fields)
        let customers: any[] = [];
        if (campaign.list_id) {
          // Paginate contact_list_members
          let from = 0;
          const pageSize = 1000;
          while (true) {
            const { data: members } = await supabase
              .from("contact_list_members")
              .select("customer_id, customers(id, name, phone, email, custom_attributes)")
              .eq("list_id", campaign.list_id)
              .range(from, from + pageSize - 1);
            if (!members || members.length === 0) break;
            customers.push(...members.map((m: any) => m.customers).filter((c: any) => c?.phone));
            if (members.length < pageSize) break;
            from += pageSize;
          }
        } else {
          // Paginate all tenant customers
          let from = 0;
          const pageSize = 1000;
          while (true) {
            const { data } = await supabase
              .from("customers")
              .select("id, name, phone, email, custom_attributes")
              .eq("tenant_id", campaign.tenant_id)
              .not("phone", "is", null)
              .range(from, from + pageSize - 1);
            if (!data || data.length === 0) break;
            customers.push(...data);
            if (data.length < pageSize) break;
            from += pageSize;
          }
        }

        // If templates need order data, fetch latest order for each customer
        let ordersByCustomer = new Map<string, any>();
        if (needsOrderData && customers.length > 0) {
          const customerIds = customers.map((c) => c.id);
          // Fetch most recent order per customer (batch of 500)
          for (let i = 0; i < customerIds.length; i += 500) {
            const batch = customerIds.slice(i, i + 500);
            const { data: orders } = await supabase
              .from("orders")
              .select("id, customer_id, external_id, total, status, mapped_status")
              .eq("tenant_id", campaign.tenant_id)
              .in("customer_id", batch)
              .order("created_at", { ascending: false });

            for (const o of (orders || [])) {
              if (!ordersByCustomer.has(o.customer_id)) {
                ordersByCustomer.set(o.customer_id, o);
              }
            }
          }
          console.log(`Campaign ${campaign.id}: fetched orders for ${ordersByCustomer.size} customers`);
        }

        console.log(`Campaign ${campaign.id}: sending to ${customers.length} contacts, template: ${templateName}`);

        if (customers.length === 0) {
          console.warn(`Campaign ${campaign.id} has no valid recipients`);
          const errMsg = "Nenhum contato válido com telefone encontrado na lista selecionada";
          await supabase
            .from("campaigns")
            .update({ status: "failed", last_error: errMsg })
            .eq("id", campaign.id);

          results.push({
            campaign_id: campaign.id,
            sent: 0,
            failed: 0,
            total: 0,
            status: "failed",
            error: errMsg,
          });
          continue;
        }

        let sentCount = 0;
        let failedCount = 0;

        for (const customer of customers) {
          try {
            // Normalize phone
            let phone = customer.phone.replace(/[\s\-\(\)\+]/g, "");
            if (!phone.startsWith("55") && phone.length <= 11) {
              phone = "55" + phone;
            }

            // Build context for variable resolution
            const ctx = {
              customer,
              order: ordersByCustomer.get(customer.id) || null,
              campaign: campaignVars,
            };

            // Create tracked link for dynamic URL button (cart recovery / pix payment)
            let buttonUrlCode: string | undefined;
            if (hasDynamicUrlButton) {
              const dynamicUrl = getCustomerDynamicUrl(customer, templateName!);
              if (dynamicUrl) {
                const code = generateCode(10);
                await supabase.from("tracked_links").insert({
                  tenant_id: campaign.tenant_id,
                  campaign_id: campaign.id,
                  customer_id: customer.id,
                  original_url: dynamicUrl,
                  code,
                  utm_source: "whatsapp",
                  utm_medium: "campaign",
                  utm_campaign: campaign.name,
                });
                buttonUrlCode = code;
              }
            }

            // Send via Meta Graph API
            const waRes = await fetch(
              `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  to: phone,
                  type: "template",
                  template: {
                    name: templateName,
                    language: { code: templateLanguage },
                    components: buildTemplateComponents(
                      variableMappings, ctx, bodyVarCount, hasHeaderVar,
                      buttonUrlCode, hasDynamicUrlButton ? dynamicUrlBtnIndex : undefined,
                    ),
                  },
                }),
              }
            );

            const waData = await waRes.json();

            if (waData.messages?.[0]?.id) {
              // Save to whatsapp_messages
              await supabase.from("whatsapp_messages").insert({
                tenant_id: campaign.tenant_id,
                customer_id: customer.id,
                phone,
                direction: "outbound",
                message_type: "template",
                template_name: templateName,
                wamid: waData.messages[0].id,
                status: "sent",
                content: `[Template: ${templateName}]`,
              });

              // Save campaign activity
              await supabase.from("campaign_activities").insert({
                tenant_id: campaign.tenant_id,
                campaign_id: campaign.id,
                customer_id: customer.id,
                status: "sent",
                channel: "whatsapp",
                sent_at: new Date().toISOString(),
              });

              sentCount++;
            } else {
              const apiErr = waData?.error?.message || JSON.stringify(waData);
              console.error(`Failed to send to ${phone}: ${apiErr}`);
              lastError = apiErr;
              failedCount++;
            }

            // Rate limiting: 100ms delay between messages
            await new Promise((r) => setTimeout(r, 100));
          } catch (err) {
            console.error(`Error sending to customer ${customer.id}:`, err);
            failedCount++;
          }
        }

        const finalStatus = sentCount > 0 ? "sent" : "failed";
        const errorMsg = finalStatus === "failed"
          ? `Todos os ${failedCount} envios falharam. Último erro: ${lastError}`
          : null;

        // Mark campaign with the real sending outcome
        await supabase
          .from("campaigns")
          .update({ status: finalStatus, last_error: errorMsg })
          .eq("id", campaign.id);

        results.push({
          campaign_id: campaign.id,
          sent: sentCount,
          failed: failedCount,
          total: customers.length,
          status: finalStatus,
        });

        console.log(`Campaign ${campaign.id} completed with status ${finalStatus}: ${sentCount} sent, ${failedCount} failed`);
      } catch (err) {
        const errMsg = `Erro interno: ${String(err)}`;
        console.error(`Error processing campaign ${campaign.id}:`, errMsg);
        await supabase.from("campaigns").update({ status: "failed", last_error: errMsg }).eq("id", campaign.id);
        results.push({ campaign_id: campaign.id, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ processed: results, automations: automationResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Campaign executor error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
