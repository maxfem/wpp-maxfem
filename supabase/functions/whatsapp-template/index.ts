import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
const WHATSAPP_BUSINESS_ACCOUNT_ID = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const GRAPH_API = `https://graph.facebook.com/v22.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`;

function jsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeForMeta(input: string): string {
  return input
    .replace(/[\n\r\f\v]/g, " ")
    .replace(/[*_~]/g, "")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{200D}\u{FE0E}\u{FE0F}\u{20E3}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasVariableAtBodyEdges(input: string): boolean {
  const trimmed = input.trim();
  return /^\{\{\d+\}\}/.test(trimmed) || /\{\{\d+\}\}$/.test(trimmed);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const requestBody = await req.json().catch(() => null);
    const template_id = requestBody?.template_id;
    const tenant_id = requestBody?.tenant_id;

    if (!template_id || !tenant_id) {
      return jsonResponse({ error: "template_id and tenant_id are required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isMember } = await supabase.rpc("is_tenant_member", {
      _user_id: user.id,
      _tenant_id: tenant_id,
    });

    if (!isMember) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: template, error: fetchError } = await supabase
      .from("message_templates")
      .select("*")
      .eq("id", template_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (fetchError || !template) {
      return jsonResponse({ error: "Template not found" }, 404);
    }

    const sanitizedHeader =
      template.header_type === "text" && template.header_content
        ? sanitizeForMeta(template.header_content)
        : null;

    if (template.header_type === "text" && template.header_content && !sanitizedHeader) {
      return jsonResponse({
        error: "O cabeçalho do template ficou vazio após remover emojis e formatação. Use apenas texto simples no título.",
        field: "header_content",
      }, 400);
    }

    if (typeof template.body !== "string" || !template.body.trim()) {
      return jsonResponse({
        error: "O corpo do template é obrigatório.",
        field: "body",
      }, 400);
    }

    if (hasVariableAtBodyEdges(template.body)) {
      return jsonResponse({
        error: "A Meta não permite variáveis no início ou no fim do corpo do template. Adicione texto antes e depois das variáveis.",
        field: "body",
        code: "META_TEMPLATE_EDGE_VARIABLE",
      }, 400);
    }

    const components: Record<string, unknown>[] = [];

    if (template.header_type && template.header_type !== "none") {
      const headerComponent: Record<string, unknown> = {
        type: "HEADER",
        format: template.header_type.toUpperCase(),
      };

      if (template.header_type === "text" && sanitizedHeader) {
        headerComponent.text = sanitizedHeader;
      }

      if (["image", "video", "document"].includes(template.header_type) && template.header_content) {
        headerComponent.example = {
          header_handle: [template.header_content],
        };
      }

      components.push(headerComponent);
    }

    const bodyComponent: Record<string, unknown> = {
      type: "BODY",
      text: template.body.trim(),
    };

    const varMatches = template.body.match(/\{\{\d+\}\}/g);
    if (varMatches && varMatches.length > 0) {
      const sampleValues = (template.sample_values as string[]) || [];
      const examples = varMatches.map((_: string, i: number) => sampleValues[i] || `exemplo_${i + 1}`);
      bodyComponent.example = { body_text: [examples] };
    }

    components.push(bodyComponent);

    if (template.footer) {
      components.push({
        type: "FOOTER",
        text: template.footer,
      });
    }

    const buttons = (template.buttons as { type: string; text: string; url?: string; phone_number?: string }[]) || [];
    if (buttons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: buttons.map((btn) => {
          if (btn.type === "URL") {
            return { type: "URL", text: btn.text, url: btn.url };
          }
          if (btn.type === "PHONE_NUMBER") {
            return { type: "PHONE_NUMBER", text: btn.text, phone_number: btn.phone_number };
          }
          return { type: "QUICK_REPLY", text: btn.text };
        }),
      });
    }

    const metaPayload = {
      name: template.name,
      language: template.language,
      category: template.category.toUpperCase(),
      components,
    };

    console.log("Submitting template to Meta:", JSON.stringify(metaPayload, null, 2));

    const metaResponse = await fetch(GRAPH_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metaPayload),
    });

    const metaResult = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error("Meta API error:", metaResult);
      const subcode = metaResult?.error?.error_subcode;

      if (subcode === 2388023) {
        return jsonResponse({
          error: "Não é possível adicionar novo conteúdo em Portuguese (BR) enquanto o conteúdo existente está sendo excluído. Tente novamente em 4 semanas ou crie outro modelo com nome diferente.",
          language_deleting: true,
        }, 409);
      }

      if (subcode === 2388024) {
        return jsonResponse({
          error: "Template já existe na Meta com este nome e idioma. Renomeie o template ou altere o idioma.",
          already_exists: true,
        }, 409);
      }

      if (subcode === 2388072) {
        return jsonResponse({
          error: "A Meta rejeitou o cabeçalho do template. Remova emojis, asteriscos, quebras de linha e formatação do título.",
          field: "header_content",
          details: metaResult,
        }, 400);
      }

      if (subcode === 2388299) {
        return jsonResponse({
          error: "A Meta não permite variáveis no início ou no fim do corpo do template. Ajuste o texto para ter conteúdo fixo antes e depois das variáveis.",
          field: "body",
          code: "META_TEMPLATE_EDGE_VARIABLE",
          details: metaResult,
        }, 400);
      }

      return jsonResponse({ error: "Meta API error", details: metaResult }, 502);
    }

    console.log("Meta API success:", metaResult);

    await supabase
      .from("message_templates")
      .update({
        meta_template_id: metaResult.id,
        status: metaResult.status === "APPROVED" ? "approved" : "pending",
      })
      .eq("id", template_id);

    return jsonResponse({
      success: true,
      meta_template_id: metaResult.id,
      status: metaResult.status,
    }, 200);
  } catch (error) {
    console.error("Template submission error:", error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});