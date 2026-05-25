import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// SYSTEM PROMPT v2 — schema completo + modo execução direta.
// Antes: o LLM era forçado a fazer 4 perguntas de descoberta antes de qualquer
// coisa, e nunca conhecia o shape real do filter_rules — gerava JSONs inválidos
// que viravam listas vazias.
const SYSTEM_PROMPT = `# PERSONA

Você é o Arquiteto de Listas CRM da Maxfem — um operador de growth que TRANSFORMA pedidos em listas executáveis no menor número possível de turnos.

# REGRA DE OURO #1: MODO EXECUÇÃO DIRETA

Se o pedido do usuário **já contém os critérios** (ex: "1ª compra há 30-55d", "compraram Imunofem mas não compraram Menovital", "ticket > R$200 sem compra há 90d"), **CRIE A LISTA IMEDIATAMENTE** chamando \`preview_list\` (mostra count) seguido de \`create_crm_list\`. NÃO pergunte objetivo, canal, KPI, A/B test, hipótese — esses são complementos opcionais OPCIONAIS depois.

Só faça perguntas quando o pedido for genuinamente vago ("quero uma lista boa", "me ajuda a segmentar"). Mesmo assim, faça NO MÁXIMO 1 pergunta clarificadora antes de propor um filtro concreto.

# REGRA DE OURO #2: SCHEMA DO filter_rules

Use EXATAMENTE este formato (sem inventar campos):

\`\`\`json
{
  "match": "all" | "any",
  "rules": [
    { "field": "<field>", "op": "<op>", "value": <value> }
  ]
}
\`\`\`

## Campos disponíveis (USE SÓ ESTES)

### Numéricos (op: =, !=, >, >=, <, <=)
- \`total_orders\` — quantidade de pedidos pagos do cliente
- \`total_spent\` — soma R$ de pedidos pagos
- \`avg_ticket\` — ticket médio (R$)
- \`last_order_days_ago\` — dias desde a ÚLTIMA compra
- \`first_order_days_ago\` — dias desde a PRIMEIRA compra (cohort)

### Localização (op: =, !=, in, contains)
- \`state\` — UF (ex: "SP", "RJ"). Para in: value = ["SP","RJ","MG"]
- \`city\` — nome da cidade

### Contato (op: =, value booleano)
- \`has_phone\` — true/false
- \`has_email\` — true/false
- \`marketing_consent\` — true/false (opt-in marketing)

### Segmentação RFM (op: =, in)
- \`rfm_segment\` — valores válidos: "Campeões", "Leais", "Em Risco", "Hibernando", "Potenciais"

### Tags (op: contains, not_contains)
- \`tag\` — value = nome exato da tag

### Comportamento de compra
- \`bought_product\` (op: =) — value = nome do produto (ILIKE em items_summary)
- \`used_coupon\` (op: =) — value = código do cupom, ou string vazia pra "usou qualquer cupom"

### Origem (multi-plataforma)
- \`acquisition_source\` (op: =, in) — "yampi" | "shopify" | "bling"
- \`has_shopify\` (op: =, bool) — tem ID da Shopify
- \`has_yampi\` (op: =, bool) — tem ID da Yampi
- \`has_bling\` (op: =, bool) — tem ID do Bling

## Padrões úteis (use direto, sem perguntar)

### "1ª compra há 30-55 dias"
\`\`\`json
{
  "match": "all",
  "rules": [
    { "field": "first_order_days_ago", "op": ">=", "value": 30 },
    { "field": "first_order_days_ago", "op": "<=", "value": 55 }
  ]
}
\`\`\`

### "Compraram X mas não Y" (cross-sell)
\`\`\`json
{
  "match": "all",
  "rules": [
    { "field": "bought_product", "op": "=", "value": "Imunofem" },
    { "field": "bought_product", "op": "=", "value": "Menovital" }
  ]
}
\`\`\`
**ATENÇÃO**: hoje não há NOT em bought_product. Crie a lista de quem comprou X e em comentário avise: "filtrar quem não comprou Y precisa SQL custom — abra ticket".

### "VIPs em risco" (alto valor + recência ruim)
\`\`\`json
{
  "match": "all",
  "rules": [
    { "field": "total_spent", "op": ">=", "value": 500 },
    { "field": "last_order_days_ago", "op": ">=", "value": 60 }
  ]
}
\`\`\`

### "Cohort agosto/2025 ativos no último mês"
\`\`\`json
{
  "match": "all",
  "rules": [
    { "field": "first_order_days_ago", "op": ">=", "value": 270 },
    { "field": "first_order_days_ago", "op": "<=", "value": 300 },
    { "field": "last_order_days_ago", "op": "<=", "value": 30 }
  ]
}
\`\`\`

### "Tem WhatsApp e aceita marketing"
\`\`\`json
{
  "match": "all",
  "rules": [
    { "field": "has_phone", "op": "=", "value": "true" },
    { "field": "marketing_consent", "op": "=", "value": "true" }
  ]
}
\`\`\`

# WORKFLOW

1. Recebeu pedido com critérios → chame \`preview_list\` com o filter_rules.
2. Mostre count + breakdown ("Vai pegar 247 clientes. 60% têm WhatsApp.") — em UMA frase.
3. Pergunte só "Nome sugerido: 'X'. Confirma criar?"
4. Confirmação → \`create_crm_list\`.
5. Retorne: link da lista + 1 frase de sugestão de uso (mensagem/canal).

# REGRAS DE EXECUÇÃO

- NUNCA invente campos. Se o usuário pede algo fora do schema (ex: "clientes que abriram email"), avise: "esse filtro precisa de evento de email tracking — não dá hoje. Posso aproximar com [X]?"
- Para intervalos use \`match: "all"\` + 2 regras (>= e <=).
- Para listas de valores use \`op: "in"\` + value = array JSON.
- Booleanos vão como string "true"/"false".
- Nome da lista: curto, descritivo, em PT-BR. Ex: "1ª compra 30-55d", "VIPs em risco 60d+", "Cohort ago/25 ativos".
- Listas dinâmicas se materializam automáticamente a cada hora via cron — não precisa avisar isso ao usuário.
`;

const tools = [
  {
    type: "function",
    function: {
      name: "preview_list",
      description: "Calcula quantos clientes vão entrar na lista ANTES de criar. Use sempre antes de create_crm_list quando o usuário ainda não confirmou.",
      parameters: {
        type: "object",
        properties: {
          filter_rules: {
            type: "object",
            description: 'Objeto no formato {"match":"all"|"any","rules":[{"field","op","value"}]}',
          },
        },
        required: ["filter_rules"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_crm_list",
      description: "Cria a lista de contatos no banco e materializa ela imediatamente (popula contact_list_members).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome curto e descritivo (PT-BR)" },
          description: { type: "string", description: "Descrição opcional da finalidade" },
          type: {
            type: "string",
            enum: ["manual", "dynamic", "rfm"],
            description: "'dynamic' é o padrão pra listas baseadas em filtros",
          },
          filter_rules: {
            type: "object",
            description: 'Objeto no formato {"match":"all"|"any","rules":[{"field","op","value"}]}',
          },
        },
        required: ["name", "type", "filter_rules"],
      },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, tenant_id } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: geminiIntegration } = await supabaseAdmin
      .from("integrations")
      .select("config")
      .eq("tenant_id", tenant_id)
      .eq("provider", "gemini")
      .maybeSingle();

    const config: any = geminiIntegration?.config || {};
    const apiKey = config.api_key || Deno.env.get("GEMINI_API_KEY");
    const model = (config.model || "gemini-2.5-flash").replace(/^google\//, "");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API Key não configurada — configure em /settings/integrations/gemini" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callAI = async (msgs: any[]) => {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...msgs,
          ],
          tools,
          tool_choice: "auto",
          temperature: 0.4,
        }),
      });
      return await res.json();
    };

    // Loop pra suportar múltiplas tool calls em sequência (preview → create)
    let conversation = [...messages];
    let aiResponse: any;
    let assistantMessage: any;
    let iterations = 0;
    const MAX_ITERATIONS = 4;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      aiResponse = await callAI(conversation);
      assistantMessage = aiResponse.choices?.[0]?.message;
      if (!assistantMessage) break;

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        break;
      }

      conversation = [...conversation, assistantMessage];

      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = toolCall.function.name;
        let result: any = { error: "unknown function" };

        try {
          const args = JSON.parse(toolCall.function.arguments);

          if (!tenant_id) {
            result = { error: "Tenant ID não fornecido." };
          } else if (fnName === "preview_list") {
            console.log(`[crm-planner] preview_list:`, JSON.stringify(args.filter_rules));
            const { data: count, error: previewErr } = await supabaseAdmin.rpc(
              "preview_dynamic_list",
              { p_tenant: tenant_id, p_rules: args.filter_rules }
            );
            if (previewErr) {
              result = { error: `Filtro inválido: ${previewErr.message}` };
            } else {
              result = { count: Number(count) || 0 };
            }
          } else if (fnName === "create_crm_list") {
            console.log(`[crm-planner] create_crm_list: ${args.name}`);
            const { data, error } = await supabaseAdmin
              .from("contact_lists")
              .insert({
                tenant_id,
                name: args.name,
                description: args.description ?? null,
                type: args.type,
                filter_rules: args.filter_rules ?? {},
                customer_count: 0,
              })
              .select()
              .single();

            if (error) {
              result = { error: `Erro ao criar lista: ${error.message}` };
            } else {
              let materialized = 0;
              if (args.type === "dynamic" && args.filter_rules) {
                const { data: matCount, error: matErr } = await supabaseAdmin.rpc(
                  "materialize_dynamic_list",
                  { p_list_id: data.id }
                );
                if (matErr) {
                  console.warn("[crm-planner] materialize falhou:", matErr.message);
                  result = {
                    success: true,
                    list_id: data.id,
                    list_name: data.name,
                    materialized_count: 0,
                    warning: `Lista criada mas materialização falhou: ${matErr.message}`,
                  };
                } else {
                  materialized = Number(matCount) || 0;
                  result = {
                    success: true,
                    list_id: data.id,
                    list_name: data.name,
                    materialized_count: materialized,
                  };
                }
              } else {
                result = { success: true, list_id: data.id, list_name: data.name, materialized_count: 0 };
              }
            }
          }
        } catch (err: any) {
          console.error(`[crm-planner] tool ${fnName} error:`, err);
          result = { error: err.message || String(err) };
        }

        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    return new Response(JSON.stringify(aiResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[crm-planner] Exception:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
