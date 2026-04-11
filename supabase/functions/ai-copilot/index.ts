import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const YAMPI_BASE = "https://api.dooki.com.br/v2";

// ===== Yampi helpers =====
async function yampiGet(alias: string, path: string, token: string, secret: string, params: Record<string, string> = {}) {
  const url = new URL(`${YAMPI_BASE}/${alias}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json", "User-Token": token, "User-Secret-Key": secret },
  });
  if (!res.ok) return null;
  return res.json();
}

async function lookupOrdersByCpf(tenantId: string, cpf: string, adminClient: any): Promise<string> {
  // 1. Get Yampi config
  const { data: integration } = await adminClient
    .from("integrations")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("provider", "yampi")
    .eq("is_active", true)
    .maybeSingle();

  if (!integration) {
    return JSON.stringify({ error: "Integração Yampi não configurada para este tenant." });
  }

  const config = integration.config as any;
  const { alias, user_token, user_secret_key } = config;
  if (!alias || !user_token || !user_secret_key) {
    return JSON.stringify({ error: "Credenciais Yampi incompletas." });
  }

  // 2. Search customer by CPF in Yampi
  const cleanCpf = cpf.replace(/\D/g, "");
  const searchRes = await yampiGet(alias, "customers", user_token, user_secret_key, {
    "q": cleanCpf,
    "limit": "5",
  });

  if (!searchRes?.data?.length) {
    return JSON.stringify({ error: "Nenhum cliente encontrado com esse CPF.", cpf: cleanCpf });
  }

  const yampiCustomer = searchRes.data.find((c: any) => {
    const cCpf = (c.cpf || "").replace(/\D/g, "");
    return cCpf === cleanCpf;
  }) || searchRes.data[0];

  const yampiCustomerId = yampiCustomer.id;
  const customerName = yampiCustomer.name || `${yampiCustomer.first_name || ""} ${yampiCustomer.last_name || ""}`.trim();

  // 3. Fetch orders for this customer
  const ordersRes = await yampiGet(alias, `customers/${yampiCustomerId}/orders`, user_token, user_secret_key, {
    "limit": "10",
    "sort": "-created_at",
    "include": "shipments,items,payments,status",
  });

  console.log("[copilot] Raw orders response keys:", ordersRes?.data?.length, JSON.stringify(ordersRes?.data?.[0] ? Object.keys(ordersRes.data[0]) : []));
  if (ordersRes?.data?.[0]) {
    const first = ordersRes.data[0];
    console.log("[copilot] First order shipments:", JSON.stringify(first.shipments));
    console.log("[copilot] First order shipping:", JSON.stringify(first.shipping));
    console.log("[copilot] First order tracking:", JSON.stringify(first.tracking));
  }

  if (!ordersRes?.data?.length) {
    return JSON.stringify({
      customer_name: customerName,
      cpf: cleanCpf,
      orders: [],
      message: "Cliente encontrado, mas sem pedidos registrados.",
    });
  }

  const statusLabels: Record<string, string> = {
    waiting_payment: "Aguardando pagamento",
    paid: "Pago",
    invoiced: "Faturado",
    shipped: "Enviado",
    delivered: "Entregue",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
  };

  const orders = ordersRes.data.map((o: any) => {
    const status = o.status?.data?.alias || "pending";
    const trackingCode = o.shipments?.data?.[0]?.tracking_code || null;
    const trackingUrl = o.shipments?.data?.[0]?.tracking_url || null;
    const carrier = o.shipments?.data?.[0]?.carrier || null;

    const payments = (o.payments?.data || []).map((p: any) => ({
      method: p.payment_method?.name || p.payment_method?.alias || "N/A",
      status: p.status || "N/A",
      value: p.value,
    }));

    return {
      order_number: o.number || o.id,
      status: statusLabels[status] || status,
      status_alias: status,
      total: o.value_total,
      created_at: o.created_at?.date || o.created_at,
      tracking_code: trackingCode,
      tracking_url: trackingUrl,
      carrier,
      payments,
      items_count: o.items?.data?.length || 0,
      items: (o.items?.data || []).slice(0, 5).map((i: any) => ({
        name: i.name || i.sku?.data?.title || "Produto",
        quantity: i.quantity,
        price: i.price,
      })),
    };
  });

  return JSON.stringify({
    customer_name: customerName,
    cpf: cleanCpf,
    orders_count: orders.length,
    orders,
  });
}

// ===== OpenAI tools definition =====
const tools = [
  {
    type: "function" as const,
    function: {
      name: "lookup_orders_by_cpf",
      description:
        "Consulta pedidos de um cliente pelo CPF na plataforma de e-commerce (Yampi). Use quando o cliente perguntar sobre rastreio, entrega, status do pedido, pagamento, nota fiscal ou qualquer informação relacionada a compras. Solicite o CPF ao cliente antes de chamar esta função.",
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

    // Fetch OpenAI integration config
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

    // Check if Yampi is configured to enable order lookup tool
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
      ? `\n\nVocê tem acesso à função lookup_orders_by_cpf para consultar pedidos do cliente. Quando o cliente perguntar sobre rastreio, entrega, status do pedido, pagamento ou qualquer assunto relacionado a compras, solicite o CPF para fazer a consulta. Se o cliente já informou o CPF na conversa, use-o diretamente chamando a função.`
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

    // First OpenAI call (with tools if Yampi available)
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

    // Handle tool calls (up to 3 iterations to prevent infinite loops)
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

      // Second call with tool results
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
