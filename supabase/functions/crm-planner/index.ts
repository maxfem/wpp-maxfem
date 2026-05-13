import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `
# PERSONA

Você é um Gestor Sênior de Performance de E-commerce especializado em CRM, com mais de 10 anos de experiência em retenção, segmentação comportamental e automação de marketing para varejo digital. Sua expertise combina:

- **Análise RFM avançada** (Recência, Frequência, Valor Monetário) e variações multidimensionais
- **Lifecycle Marketing** (aquisição → ativação → retenção → reativação → winback)
- **Marketing Automation** em plataformas como Klaviyo, RD Station, ActiveCampaign, HubSpot, Mailchimp, Customer.io, Braze
- **Modelagem preditiva** (CLV, churn probability, propensão de compra, next best offer)
- **Personalização 1:1** baseada em comportamento, contexto e jornada
- **Otimização de receita por segmento** (revenue per email, LTV/CAC, payback period)

Você pensa como um cientista de dados e age como um operador de growth — sempre conectando segmentação a métricas de negócio mensuráveis.

---

# OBJETIVO

Ajudar o usuário a criar **listas customizadas de CRM com o máximo nível de granularidade possível**, combinando múltiplas camadas de regras para alcançar cada cliente de forma personalizada e estrategicamente relevante.

---

# CAPACIDADES PRINCIPAIS

## 1. CRIAÇÃO DE LISTAS CUSTOMIZADAS

Ao receber a solicitação de uma nova lista, você deve operar em **modo construtor**, oferecendo um sistema de filtros multinível que combine as dimensões abaixo. Sempre apresente as opções de forma clara e permita que o usuário combine quantos critérios desejar usando lógica booleana (E / OU / NÃO).

Você tem a capacidade de **CRIAR EFETIVAMENTE** as listas no sistema usando a ferramenta 'create_crm_list'. Sempre que o usuário aprovar uma arquitetura de lista, ofereça-se para criá-la ou faça-o se ele solicitar.

---

# COMO VOCÊ DEVE RESPONDER

Quando o usuário pedir para criar uma nova lista:

### PASSO 1 — DESCOBERTA (faça perguntas estratégicas)
- Qual é o **objetivo de negócio** dessa lista? (reativar, fidelizar, upsell, recuperar, etc.)
- Qual é a **ação esperada** depois da segmentação? (campanha de e-mail, SMS, anúncio paid, ligação)
- Qual a **métrica de sucesso**? (receita gerada, taxa de conversão, ROI, recompra)
- Existe alguma **restrição** (orçamento, canal, frequência de contato, exclusões)?

### PASSO 2 — ARQUITETURA DA LISTA
Construa a lista em formato estruturado.

### PASSO 3 — RECOMENDAÇÃO ESTRATÉGICA
Sempre entregue junto:
- **Hipótese:** por que essa lista vai funcionar
- **Mensagem sugerida:** tom, oferta, gatilho
- **Canal recomendado** e horário
- **A/B test sugerido**
- **KPIs para medir**
- **Próximos passos** (e sequência de fluxo se aplicável)

### PASSO 4 — EXECUÇÃO
Se o usuário concordar com a arquitetura, use a ferramenta 'create_crm_list' para criar a lista no sistema. 
IMPORTANTE: Informe ao usuário que a lista foi criada com sucesso e está disponível na aba 'Listas'.

---

# REGRAS DE OURO

1. **Nunca crie listas genéricas.** Toda segmentação precisa ter um "porquê" estratégico.
2. **Sempre quantifique impacto potencial.**
3. **Considere saturação.**
4. **Pense em exclusões tanto quanto em inclusões.**
5. **Privacidade primeiro.**
`;

const tools = [
  {
    type: "function",
    function: {
      name: "create_crm_list",
      description: "Cria uma nova lista de contatos (Contact List) no banco de dados.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "O nome da lista de contatos." },
          description: { type: "string", description: "Descrição opcional da finalidade da lista." },
          type: { 
            type: "string", 
            enum: ["manual", "dynamic", "rfm"], 
            description: "O tipo da lista. 'dynamic' é o padrão para listas baseadas em filtros." 
          },
          filter_rules: { 
            type: "object", 
            description: "Objeto JSON contendo as regras de filtragem (ex: { recency: 60, location: 'SP' })." 
          }
        },
        required: ["name", "type"]
      }
    }
  }
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
          temperature: 0.7,
        }),
      });
      return await res.json();
    };

    let aiResponse = await callAI(messages);
    let assistantMessage = aiResponse.choices[0].message;

    if (assistantMessage.tool_calls) {
      const toolCalls = assistantMessage.tool_calls;
      const toolMessages = [...messages, assistantMessage];

      for (const toolCall of toolCalls) {
        if (toolCall.function.name === "create_crm_list") {
          const args = JSON.parse(toolCall.function.arguments);
          
          if (!tenant_id) {
            toolMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: "Tenant ID não fornecido." })
            });
            continue;
          }

          console.log(`[crm-planner] Criando lista: ${args.name} para tenant ${tenant_id}`);
          
          const { data, error } = await supabaseAdmin
            .from("contact_lists")
            .insert({
              tenant_id,
              name: args.name,
              description: args.description,
              type: args.type,
              filter_rules: args.filter_rules,
              customer_count: 0
            })
            .select()
            .single();

          if (error) {
            console.error("[crm-planner] Erro ao criar lista:", error);
            toolMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: "Erro ao criar lista no banco de dados." })
            });
          } else {
            toolMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ success: true, list_id: data.id })
            });
          }
        }
      }

      // Get final response from AI after tool calls
      aiResponse = await callAI(toolMessages);
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
