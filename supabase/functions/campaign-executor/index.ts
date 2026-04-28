import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ===== VARIABLE RESOLUTION =====

function resolveVariable(key: string, ctx: { customer: any; order: any; campaign: any; triggerData?: any }): string {
  const { customer, order, campaign } = ctx;
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
    case "order.number": return order?.order_number || order?.external_id?.replace("yampi_", "") || order?.id?.slice(0, 8) || "-";
    case "order.total": return order?.total ? formatCurrency(order.total) : "-";
    case "order.status": return order?.mapped_status || order?.status || "-";
    case "order.tracking_code": return order?.tracking_code || "-";
    case "order.delivery_days": return order?.delivery_days || "5 a 8";
    case "order.pix_code": return ctx.triggerData?.pix_qr_code || order?.pix_qr_code || "-";
    case "campaign.coupon": return campaign?.coupon || "-";
    case "campaign.discount": return campaign?.discount || "-";
    case "campaign.product_name": return campaign?.product_name || "-";
    case "campaign.product_desc": return campaign?.product_desc || "-";
    case "campaign.return_days": return campaign?.return_days || "5";
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


// ===== TEMPLATE BUILDER =====

function buildTemplateComponents(
  variableMappings: string[], ctx: { customer: any; order: any; campaign: any; triggerData?: any },
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
        // However, if the template was approved with COPY_CODE, we must provide a value.
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
        let currentNodeId = item.current_node_id || "start";
        let stepCount = 0;
        const MAX_STEPS = 20;

        while (stepCount < MAX_STEPS) {
          stepCount++;

          if (currentNodeId === "start") {
            const startNode = nodes.find(n => n.type === "startNode" || n.data?.nodeType === "start");
            if (startNode) {
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
              .select("id, name, phone, email, custom_attributes").eq("id", item.customer_id).single();

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

            const ctx = { customer, order: orderRecord, campaign: campaignVars, triggerData };

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

      if (flowData?.nodes) {
        const sendNode = flowData.nodes.find((n: any) => n.data?.nodeType === "sendWhatsApp" && (n.data?.template || n.data?.templateName));
        if (sendNode) {
          templateName = sendNode.data.template || sendNode.data.templateName;
          templateLanguage = sendNode.data.templateLanguage || "pt_BR";
        }
      }

      if (!templateName) {
        const errMsg = "Nenhum template de WhatsApp encontrado no fluxo";
        await supabase.from("campaigns").update({ status: "failed", last_error: errMsg }).eq("id", campaign.id);
        results.push({ campaign_id: campaign.id, error: errMsg });
        continue;
      }

      const { data: templateRecord } = await supabase.from("message_templates")
        .select("body, header_type, header_content, sample_values, buttons")
        .eq("name", templateName).eq("tenant_id", campaign.tenant_id).limit(1).single();

      const bodyVarCount = templateRecord?.body ? (templateRecord.body.match(/\{\{\d+\}\}/g) || []).length : 0;
      const hasHeaderVar = templateRecord?.header_type === "text" && templateRecord?.header_content?.includes("{{");
      const variableMappings: string[] = (templateRecord?.sample_values as string[]) || [];
      const templateButtons = (templateRecord?.buttons as any[]) || [];
      const dynamicUrlBtnIndex = templateButtons.findIndex((b: any) => b.type === "URL" && b.url?.includes("{{1}}"));
      const hasDynamicUrlButton = dynamicUrlBtnIndex >= 0;

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
          customers.push(...members.map((m: any) => m.customers).filter((c: any) => c?.phone));
          if (members.length < pageSize) break;
          from += pageSize;
        }
      } else {
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data } = await supabase.from("customers")
            .select("id, name, phone, email, custom_attributes")
            .eq("tenant_id", campaign.tenant_id).not("phone", "is", null)
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
        const errMsg = "Nenhum contato válido com telefone encontrado";
        await supabase.from("campaigns").update({ status: "failed", last_error: errMsg }).eq("id", campaign.id);
        results.push({ campaign_id: campaign.id, sent: 0, failed: 0, total: 0, status: "failed", error: errMsg });
        continue;
      }

      let sentCount = 0;
      let failedCount = 0;

      for (const customer of customers) {
        try {
          let phone = customer.phone.replace(/[\s\-\(\)\+]/g, "");
          if (!phone.startsWith("55") && phone.length <= 11) phone = "55" + phone;

          const ctx = { customer, order: ordersByCustomer.get(customer.id) || null, campaign: campaignVars };

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
            await supabase.from("campaign_activities").insert({
              tenant_id: campaign.tenant_id, campaign_id: campaign.id,
              customer_id: customer.id, status: "sent", channel: "whatsapp", sent_at: new Date().toISOString(),
            });
            sentCount++;
          } else {
            lastError = waData?.error?.message || JSON.stringify(waData);
            failedCount++;
          }

          await new Promise((r) => setTimeout(r, 100));
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
