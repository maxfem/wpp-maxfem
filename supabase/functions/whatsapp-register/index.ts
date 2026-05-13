import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const GRAPH_API_BASE = WHATSAPP_PHONE_NUMBER_ID
  ? `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}`
  : null;

type GraphErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getGraphErrorMessage(result: GraphErrorPayload, fallback: string) {
  return result.error?.message || fallback;
}

function isExpiredTokenError(result: GraphErrorPayload) {
  return result.error?.code === 190 && result.error?.error_subcode === 463;
}

async function verifyAuth(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (
    !authHeader?.startsWith("Bearer ") || !SUPABASE_URL || !SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser();

  if (error) {
    console.error("Auth validation error:", error);
    return null;
  }

  return user;
}

function ensureServerConfig() {
  if (!WHATSAPP_ACCESS_TOKEN || !GRAPH_API_BASE) {
    return jsonResponse(
      {
        error: "Configuração incompleta do WhatsApp",
        code: "whatsapp_config_missing",
        user_message:
          "As credenciais do WhatsApp não estão configuradas corretamente no backend.",
      },
      500,
    );
  }

  return null;
}

async function callGraph(path: string, init?: RequestInit) {
  const response = await fetch(`${GRAPH_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      ...(init?.headers || {}),
    },
  });

  const result = (await response.json().catch(() => ({}))) as
    & GraphErrorPayload
    & Record<string, unknown>;

  if (response.ok) {
    return { ok: true as const, result };
  }

  const tokenExpired = isExpiredTokenError(result);

  return {
    ok: false as const,
    response: jsonResponse(
      {
        error: "Erro na Cloud API do WhatsApp",
        code: tokenExpired ? "whatsapp_token_expired" : "whatsapp_api_error",
        user_message: tokenExpired
          ? "O token da Cloud API expirou. Atualize o segredo WHATSAPP_ACCESS_TOKEN para continuar."
          : getGraphErrorMessage(
            result,
            "Falha ao comunicar com a Cloud API do WhatsApp.",
          ),
        details: result,
      },
      502,
    ),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const configError = ensureServerConfig();
    if (configError) return configError;

    const user = await verifyAuth(req);
    if (!user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : null;

    if (!action) {
      return jsonResponse({ error: "Ação é obrigatória" }, 400);
    }

    // Retorna presença/ausência dos secrets (sem chamar Graph) — usado pelo card de status na UI
    if (action === "secrets_status") {
      const tk = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
      const pn = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
      const ba = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID") || "";
      const vt = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
      return jsonResponse({
        has_access_token: !!tk,
        has_phone_number_id: !!pn,
        has_waba_id: !!ba,
        has_verify_token: !!vt,
        access_token_prefix: tk ? tk.slice(0, 6) + "..." + tk.slice(-4) : null,
        access_token_length: tk.length || 0,
        phone_number_id: pn || null,
        waba_id: ba || null,
      });
    }

    if (action === "request_code") {
      const codeMethod = body.code_method === "VOICE" ? "VOICE" : "SMS";
      const result = await callGraph("/request_code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code_method: codeMethod,
          language: "pt_BR",
        }),
      });

      if (!result.ok) return result.response;
      return jsonResponse({ success: true, ...result.result });
    }

    if (action === "verify_code") {
      const code = typeof body.code === "string" ? body.code.trim() : "";
      if (!/^\d{6}$/.test(code)) {
        return jsonResponse(
          { error: "Código de 6 dígitos é obrigatório" },
          400,
        );
      }

      const result = await callGraph("/verify_code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!result.ok) return result.response;
      return jsonResponse({ success: true, ...result.result });
    }

    if (action === "register") {
      const pin = typeof body.pin === "string" ? body.pin.trim() : "";
      if (!/^\d{6}$/.test(pin)) {
        return jsonResponse({ error: "PIN de 6 dígitos é obrigatório" }, 400);
      }

      const result = await callGraph("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          pin,
        }),
      });

      if (!result.ok) return result.response;
      return jsonResponse({ success: true, ...result.result });
    }

    if (action === "status") {
      const result = await callGraph(
        "?fields=verified_name,code_verification_status,display_phone_number,quality_rating,status,name_status",
      );

      if (!result.ok) return result.response;
      return jsonResponse(result.result);
    }

    return jsonResponse({ error: "Ação inválida" }, 400);
  } catch (error) {
    console.error("whatsapp-register error:", error);
    return jsonResponse(
      {
        error: "Erro interno",
        code: "internal_error",
        user_message: "Não foi possível concluir a operação do WhatsApp agora.",
      },
      500,
    );
  }
});
