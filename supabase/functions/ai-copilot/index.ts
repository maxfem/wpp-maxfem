import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== Local lookup: query orders from local DB by CPF =====
async function lookupOrdersByCpf(tenantId: string, cpf: string, adminClient: any): Promise<string> {
  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length < 11) {
    return JSON.stringify({ error: "CPF inválido. Informe os 11 dígitos." });
  }

  const { data: customer } = await adminClient
    .from("customers")
    .select("id, name, document, phone")
    .eq("tenant_id", tenantId)
    .eq("document", cleanCpf)
    .maybeSingle();

  if (!customer) {
    return JSON.stringify({ error: "Nenhum cliente encontrado com esse CPF.", cpf: cleanCpf });
  }

  const { data: orders } = await adminClient
    .from("orders")
    .select("id, external_id, order_number, total, status, mapped_status, status_alias, tracking_code, tracking_url, carrier, delivery_estimate, payment_summary, items_summary, created_at")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!orders || orders.length === 0) {
    return JSON.stringify({
      customer_name: customer.name,
      cpf: cleanCpf,
      orders: [],
      message: "Cliente encontrado, mas sem pedidos registrados.",
    });
  }

  const statusLabels: Record<string, string> = {
    pending: "Aguardando pagamento",
    waiting_payment: "Aguardando pagamento",
    paid: "Pago",
    invoiced: "Faturado",
    shipped: "Enviado",
    on_carriage: "Em transporte",
    in_transit: "Em transporte",
    delivered: "Entregue",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
  };

  const formattedOrders = orders.map((o: any) => ({
    order_number: o.order_number || o.external_id?.replace("yampi_", "") || o.id,
    status: statusLabels[o.status_alias || o.status] || o.status,
    status_alias: o.status_alias || o.status,
    total: o.total,
    created_at: o.created_at,
    tracking_code: o.tracking_code || null,
    tracking_url: o.tracking_url || null,
    carrier: o.carrier || null,
    payments: o.payment_summary || [],
    items: o.items_summary || [],
  }));

  console.log("[copilot] Local orders lookup result:", JSON.stringify(formattedOrders));

  return JSON.stringify({
    customer_name: customer.name,
    cpf: cleanCpf,
    orders_count: formattedOrders.length,
    orders: formattedOrders,
    note: "Dados sincronizados da plataforma. Se o rastreio não aparece, pode estar pendente de atualização na origem.",
  });
}

// ===== Bling V3 API lookup: query orders in real-time by CPF =====
async function lookupOrdersBling(tenantId: string, cpf: string, adminClient: any): Promise<string> {
  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length < 11) {
    return JSON.stringify({ error: "CPF inválido. Informe os 11 dígitos." });
  }

  try {
    const { data: blingIntegration } = await adminClient
      .from("integrations")
      .select("config")
      .eq("tenant_id", tenantId)
      .eq("provider", "bling")
      .eq("is_active", true)
      .maybeSingle();

    if (!blingIntegration) {
      return JSON.stringify({ error: "Integração Bling não configurada." });
    }

    const cfg = blingIntegration.config as any;
    const accessToken = cfg?.access_token;
    if (!accessToken) {
      return JSON.stringify({ error: "Token do Bling expirado ou inválido." });
    }

    // Format CPF for Bling search
    const formattedCpf = cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

    // Search contact by CPF
    const contactRes = await fetch(`https://www.bling.com.br/Api/v3/contatos?pesquisa=${encodeURIComponent(formattedCpf)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });

    if (!contactRes.ok) {
      console.error("[copilot] Bling contact search error:", contactRes.status);
      return JSON.stringify({ error: "Erro ao consultar Bling. Tente novamente." });
    }

    const contactData = await contactRes.json();
    const contacts = contactData?.data || [];

    if (contacts.length === 0) {
      return JSON.stringify({ error: "Nenhum cliente encontrado no Bling com esse CPF.", cpf: formattedCpf });
    }

    const contactId = contacts[0].id;
    const contactName = contacts[0].nome;

    // Search orders for this contact
    const ordersRes = await fetch(`https://www.bling.com.br/Api/v3/pedidos/vendas?idContato=${contactId}&limit=5`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });

    if (!ordersRes.ok) {
      console.error("[copilot] Bling orders search error:", ordersRes.status);
      return JSON.stringify({ customer_name: contactName, cpf: formattedCpf, orders: [], message: "Erro ao buscar pedidos no Bling." });
    }

    const ordersData = await ordersRes.json();
    const ordersList = ordersData?.data || [];

    if (ordersList.length === 0) {
      return JSON.stringify({ customer_name: contactName, cpf: formattedCpf, orders: [], message: "Cliente encontrado no Bling, mas sem pedidos." });
    }

    // Fetch details for each order to get tracking
    const detailedOrders = [];
    for (const order of ordersList.slice(0, 5)) {
      const detailRes = await fetch(`https://www.bling.com.br/Api/v3/pedidos/vendas/${order.id}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });

      if (!detailRes.ok) continue;

      const detail = await detailRes.json();
      const d = detail?.data;
      if (!d) continue;

      const volumes = d.transporte?.volumes || [];
      const trackingCode = volumes[0]?.codigoRastreamento || null;
      const carrier = d.transporte?.contato?.nome || null;

      const payments = (d.parcelas || []).map((p: any) => ({
        value: p.valor,
        due_date: p.dataVencimento,
        method: p.observacoes || "",
      }));

      const items = (d.itens || []).map((i: any) => ({
        name: i.descricao,
        quantity: i.quantidade,
        value: i.valor,
      }));

      detailedOrders.push({
        order_number: d.numero,
        total: d.total,
        date: d.data,
        tracking_code: trackingCode,
        tracking_url: trackingCode ? `https://rastreamento.correios.com.br/app/index.php?objetos=${trackingCode}` : null,
        carrier,
        payments,
        items,
      });
    }

    console.log("[copilot] Bling orders lookup result:", JSON.stringify(detailedOrders));

    return JSON.stringify({
      source: "bling",
      customer_name: contactName,
      cpf: formattedCpf,
      orders_count: detailedOrders.length,
      orders: detailedOrders,
    });
  } catch (err) {
    console.error("[copilot] Bling lookup error:", err);
    return JSON.stringify({ error: "Erro interno ao consultar o Bling." });
  }
}

const tools = [
  {
    type: "function" as const,
    function: {
      name: "lookup_orders_by_cpf",
      description:
        "Consulta pedidos de um cliente pelo CPF nos dados sincronizados do sistema local. Use quando o cliente perguntar sobre rastreio, entrega, status do pedido, pagamento ou compras.",
      parameters: {
        type: "object",
        properties: {
          cpf: {
            type: "string",
            description: "CPF do cliente (apenas números ou com pontuação)",
          },
        },
        required: ["cpf"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "lookup_orders_bling",
      description:
        "Consulta pedidos e código de rastreio em tempo real na API do Bling pelo CPF do cliente. Use esta função quando lookup_orders_by_cpf não retornar rastreio ou quando quiser dados mais atualizados do ERP.",
      parameters: {
        type: "object",
        properties: {
          cpf: {
            type: "string",
            description: "CPF do cliente (apenas números ou com pontuação)",
          },
        },
        required: ["cpf"],
      },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenant_id, messages, conversation_context, tone_override } = await req.json();

    if (!tenant_id || !messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Missing tenant_id or messages" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: integration } = await adminClient
      .from("integrations")
      .select("config")
      .eq("tenant_id", tenant_id)
      .eq("provider", "openai")
      .eq("is_active", true)
      .maybeSingle();

    if (!integration) {
      return new Response(JSON.stringify({ error: "OpenAI não configurada. Vá em Configurações > Integrações > OpenAI." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = integration.config as any;
    const apiKey = config.openai_api_key;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API Key da OpenAI não configurada." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if Yampi integration exists (for order lookup tool)
    const { data: yampiIntegration } = await adminClient
      .from("integrations")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("provider", "yampi")
      .eq("is_active", true)
      .maybeSingle();

    const hasYampi = !!yampiIntegration;

    const tone = tone_override || config.tone || "friendly";
    const model = config.model || "gpt-4o-mini";
    const systemPrompt = config.system_prompt || "Você é um assistente de atendimento ao cliente.";

    const toneInstructions: Record<string, string> = {
      formal: "Use linguagem formal e profissional.",
      friendly: "Use um tom caloroso e acolhedor.",
      informal: "Use linguagem descontraída e casual.",
      technical: "Seja preciso, objetivo e técnico.",
    };

    const orderInstructions = hasYampi
      ? `\n\nVocê tem acesso à função lookup_orders_by_cpf para consultar pedidos do cliente nos dados sincronizados. Quando o cliente perguntar sobre rastreio, entrega, status do pedido, pagamento ou qualquer assunto relacionado a compras, solicite o CPF para fazer a consulta. Se o cliente já informou o CPF na conversa, use-o diretamente chamando a função.

REGRAS IMPORTANTES para resposta sobre pedidos:
- Se o campo tracking_code existir nos dados retornados, SEMPRE informe o código de rastreio e o link de rastreio de forma clara e direta.
- Se houver dados de pagamento (payments), informe o método e status do pagamento.
- Formate a resposta com: número do pedido, status, código de rastreio (se houver), link de rastreio (se houver), transportadora, e valor.
- SOMENTE diga "código de rastreio ainda não disponível" quando tracking_code for null ou vazio. Se o tracking_code TEM um valor, informe-o obrigatoriamente.
- Nunca invente informações. Use apenas os dados retornados pela função.`
      : "";

    const fullSystemPrompt = `${systemPrompt}

Tom de voz: ${toneInstructions[tone] || toneInstructions.friendly}
${conversation_context ? `\nContexto adicional desta conversa: ${conversation_context}` : ""}
${orderInstructions}

Baseado no histórico de mensagens abaixo, sugira uma resposta para o atendente enviar ao cliente. Responda apenas com o texto da sugestão, sem explicações adicionais.`;

    const chatMessages: any[] = [
      { role: "system", content: fullSystemPrompt },
      ...messages.slice(-20).map((m: any) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: m.content || `[${m.message_type}]`,
      })),
    ];

    const openaiBody: any = {
      model,
      messages: chatMessages,
      max_tokens: 500,
      temperature: 0.7,
    };

    if (hasYampi) {
      openaiBody.tools = tools;
      openaiBody.tool_choice = "auto";
    }

    let openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(openaiBody),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error("OpenAI API error:", openaiResponse.status, errText);
      if (openaiResponse.status === 401) {
        return new Response(JSON.stringify({ error: "API Key da OpenAI inválida." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (openaiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições da OpenAI excedido." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erro ao chamar a OpenAI." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result = await openaiResponse.json();
    let assistantMessage = result.choices?.[0]?.message;

    let iterations = 0;
    while (assistantMessage?.tool_calls?.length > 0 && iterations < 3) {
      iterations++;
      chatMessages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === "lookup_orders_by_cpf") {
          const args = JSON.parse(toolCall.function.arguments);
          console.log(`[copilot] Tool call: lookup_orders_by_cpf(${args.cpf})`);
          const toolResult = await lookupOrdersByCpf(tenant_id, args.cpf, adminClient);
          chatMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      }

      openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: chatMessages,
          max_tokens: 800,
          temperature: 0.7,
        }),
      });

      if (!openaiResponse.ok) {
        console.error("OpenAI tool follow-up error:", openaiResponse.status);
        break;
      }

      result = await openaiResponse.json();
      assistantMessage = result.choices?.[0]?.message;
    }

    const suggestion = assistantMessage?.content || "";

    return new Response(JSON.stringify({ suggestion }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-copilot error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
