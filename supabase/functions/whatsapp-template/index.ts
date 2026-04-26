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

// ── Server-side validation ──────────────────────────────────────
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{200D}\u{FE0E}\u{FE0F}\u{20E3}]/gu;
const MD_RE = /[*_~]/;
const VAR_RE = /\{\{(\d+)\}\}/g;

interface ValidationError { error: string; field?: string; code?: string }

function validateServerSide(template: Record<string, unknown>): ValidationError | null {
  const name = template.name as string;
  const body = template.body as string;
  const footer = template.footer as string | null;
  const headerType = template.header_type as string | null;
  const headerContent = template.header_content as string | null;
  const buttons = (template.buttons as { type: string; text?: string; url?: string; phone_number?: string; example?: string }[]) || [];

  // Name
  if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
    return { error: "Nome do template inválido. Use apenas letras minúsculas, números e underscore, começando com letra.", field: "name" };
  }
  if (name.length > 512) {
    return { error: "Nome excede 512 caracteres.", field: "name" };
  }

  // Header text
  if (headerType === "text" && headerContent) {
    if (headerContent.length > 60) {
      return { error: "Cabeçalho excede 60 caracteres.", field: "header_content" };
    }
    if (EMOJI_RE.test(headerContent)) {
      return { error: "Cabeçalho não pode conter emojis.", field: "header_content" };
    }
    if (MD_RE.test(headerContent)) {
      return { error: "Cabeçalho não pode conter formatação (* _ ~).", field: "header_content" };
    }
    const sanitized = sanitizeForMeta(headerContent);
    if (!sanitized) {
      return { error: "O cabeçalho ficou vazio após remover emojis e formatação. Use apenas texto simples.", field: "header_content" };
    }
    const headerVars = headerContent.match(VAR_RE) || [];
    if (headerVars.length > 1) {
      return { error: "Cabeçalho permite no máximo 1 variável.", field: "header_content" };
    }
  }

  if (["image", "video", "document"].includes(headerType || "") && !headerContent?.trim()) {
    return { error: "URL de mídia é obrigatória para cabeçalho de mídia.", field: "header_content" };
  }

  // Body
  if (!body?.trim()) {
    return { error: "O corpo do template é obrigatório.", field: "body" };
  }
  if (body.length > 1024) {
    return { error: "Corpo excede 1024 caracteres.", field: "body" };
  }

  const trimmedBody = body.trim();
  if (/^[^a-zA-Z0-9]*\{\{\d+\}\}/.test(trimmedBody) || /\{\{\d+\}\}[^a-zA-Z0-9]*$/.test(trimmedBody)) {
    return { error: "Variáveis não podem estar no início ou no fim do corpo. Adicione texto fixo antes e depois.", field: "body", code: "META_TEMPLATE_EDGE_VARIABLE" };
  }

  const bodyVars = [...body.matchAll(VAR_RE)].map((m) => parseInt(m[1], 10));
  if (bodyVars.length > 0) {
    const sorted = [...new Set(bodyVars)].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        return { error: `Variáveis devem ser sequenciais: {{1}}, {{2}}, {{3}}... Encontrado {{${sorted[i]}}} mas esperado {{${i + 1}}}.`, field: "body" };
      }
    }
    const fixedText = body.replace(VAR_RE, "").trim();
    const fixedWords = fixedText.split(/\s+/).filter(Boolean).length;
    if (fixedWords < bodyVars.length) {
      return { error: "O corpo deve conter mais texto fixo do que variáveis.", field: "body" };
    }
  }

  // Footer
  if (footer) {
    if (footer.length > 60) {
      return { error: "Rodapé excede 60 caracteres.", field: "footer" };
    }
    if (VAR_RE.test(footer)) {
      return { error: "Rodapé não pode conter variáveis.", field: "footer" };
    }
    if (EMOJI_RE.test(footer)) {
      return { error: "Rodapé não pode conter emojis.", field: "footer" };
    }
    if (MD_RE.test(footer)) {
      return { error: "Rodapé não pode conter formatação (* _ ~).", field: "footer" };
    }
  }

  // Buttons
  if (buttons.length > 10) {
    return { error: "Máximo de 10 botões permitidos.", field: "buttons" };
  }
  const urlCount = buttons.filter((b) => b.type === "URL").length;
  const phoneCount = buttons.filter((b) => b.type === "PHONE_NUMBER").length;
  const copyCodeCount = buttons.filter((b) => b.type === "COPY_CODE").length;
  if (urlCount > 2) return { error: "Máximo de 2 botões de URL.", field: "buttons" };
  if (phoneCount > 1) return { error: "Máximo de 1 botão de telefone.", field: "buttons" };
  if (copyCodeCount > 1) return { error: "Máximo de 1 botão 'Copiar código'.", field: "buttons" };

  for (const btn of buttons) {
    if (btn.text && btn.text.length > 25) {
      return { error: `Texto do botão "${btn.text}" excede 25 caracteres.`, field: "buttons" };
    }
    if (btn.type === "URL" && btn.url) {
      if (btn.url.length > 2000) return { error: `URL do botão "${btn.text}" excede 2000 caracteres.`, field: "buttons" };
      if (!/^https?:\/\//i.test(btn.url.replace(/\{\{\d+\}\}/g, ""))) {
        return { error: `A URL do botão "${btn.text}" deve começar com https://. Para código Pix, use "Copiar código".`, field: "buttons" };
      }
    }
    if (btn.type === "PHONE_NUMBER" && btn.phone_number && btn.phone_number.length > 20) {
      return { error: `Telefone do botão "${btn.text}" excede 20 caracteres.`, field: "buttons" };
    }
    if (btn.type === "COPY_CODE" && btn.example && btn.example.length > 15) {
      return { error: `Exemplo do botão "Copiar código" excede 15 caracteres.`, field: "buttons" };
    }
  }

  return null;
}

// ── Meta error subcode mapping ──────────────────────────────────
function mapMetaSubcode(subcode: number | undefined): string | null {
  if (!subcode) return null;
  const map: Record<number, string> = {
    2388023: "Não é possível criar template neste idioma enquanto o conteúdo anterior está sendo excluído. Tente novamente em 4 semanas ou crie com nome diferente.",
    2388024: "Template já existe na Meta com este nome e idioma. Renomeie ou altere o idioma.",
    2388019: "Limite de 250 templates atingido na conta WABA. Exclua templates antigos.",
    2388040: "Um ou mais campos excedem o limite de caracteres da Meta.",
    2388047: "Cabeçalho contém conteúdo inválido. Remova emojis, formatação e quebras de linha.",
    2388072: "Corpo do template contém formatação ou estrutura inválida.",
    2388073: "Rodapé contém conteúdo inválido. Use apenas texto simples.",
    2388293: "Corpo tem muitas variáveis em relação ao texto fixo.",
    2388299: "Variáveis não podem estar no início ou fim do corpo.",
    80008: "Limite de requisições atingido (100 templates/hora). Aguarde e tente novamente.",
  };
  return map[subcode] || null;
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

    // ── Server-side validation ────────────────────────────────
    const validationError = validateServerSide(template);
    if (validationError) {
      return jsonResponse(validationError, 400);
    }

    const sanitizedHeader =
      template.header_type === "text" && template.header_content
        ? sanitizeForMeta(template.header_content)
        : null;

    // ── Build components ──────────────────────────────────────
    const components: Record<string, unknown>[] = [];

    if (template.header_type && template.header_type !== "none") {
      const isTextHeader = template.header_type === "text";
      const isMediaHeader = ["image", "video", "document"].includes(template.header_type);

      // Skip HEADER entirely if required content is missing — Meta rejects empty headers (subcode 2388043)
      const hasValidContent =
        (isTextHeader && sanitizedHeader) ||
        (isMediaHeader && template.header_content);

      if (hasValidContent) {
        const headerComponent: Record<string, unknown> = {
          type: "HEADER",
          format: template.header_type.toUpperCase(),
        };

        if (isTextHeader) {
          headerComponent.text = sanitizedHeader;
        }

        if (isMediaHeader) {
          headerComponent.example = {
            header_handle: [template.header_content],
          };
        }

        components.push(headerComponent);
      }
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

    const buttons = (template.buttons as { type: string; text: string; url?: string; phone_number?: string; example?: string }[]) || [];
    if (buttons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: buttons.map((btn) => {
          if (btn.type === "URL") {
            const normalizedUrl = btn.url?.replace(/\{\{\d+\}\}/g, "{{1}}");
            const urlObj: Record<string, unknown> = { type: "URL", text: btn.text, url: normalizedUrl };
            if (normalizedUrl?.includes("{{1}}")) {
              urlObj.example = ["https://example.com/checkout"];
            }
            return urlObj;
          }
          if (btn.type === "PHONE_NUMBER") {
            return { type: "PHONE_NUMBER", text: btn.text, phone_number: btn.phone_number };
          }
          if (btn.type === "COPY_CODE") {
            return { type: "COPY_CODE", example: "CODIGO123" };
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

      // Map known subcodes to user-friendly messages
      const mappedMessage = mapMetaSubcode(subcode);
      if (mappedMessage) {
        const statusCode = [2388023, 2388024].includes(subcode) ? 409 : 400;
        return jsonResponse({
          error: mappedMessage,
          field: subcode === 2388047 ? "header_content" : subcode === 2388073 ? "footer" : subcode === 2388299 ? "body" : undefined,
          code: subcode === 2388299 ? "META_TEMPLATE_EDGE_VARIABLE" : undefined,
          ...(subcode === 2388023 ? { language_deleting: true } : {}),
          ...(subcode === 2388024 ? { already_exists: true } : {}),
          details: metaResult,
        }, statusCode);
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
