// whatsapp-set-credentials
// Recebe { access_token, phone_number_id, business_account_id } do CRM,
// valida via Graph e atualiza os Supabase Secrets via Management API.
//
// Requer secret no projeto: MGMT_PAT (sbp_…).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROJECT_REF = "lfpwubqmpztxhrmxadcl";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function setSupabaseSecrets(pairs: Record<string, string>, pat: string) {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`;
  const payload = Object.entries(pairs).map(([name, value]) => ({ name, value }));
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase Management API ${res.status}: ${text.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth obrigatório (user logado)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Não autenticado." }, 401);
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authErr,
    } = await supabaseAuth.auth.getUser();
    if (authErr || !user) {
      return jsonResponse({ error: "Não autenticado." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const accessToken = String(body.access_token || "").trim();
    const phoneNumberId = String(body.phone_number_id || "").trim();
    const wabaId = String(body.business_account_id || body.waba_id || "").trim();

    if (!accessToken || accessToken.length < 30) {
      return jsonResponse({ error: "access_token inválido." }, 400);
    }
    if (!phoneNumberId || !/^\d+$/.test(phoneNumberId)) {
      return jsonResponse({ error: "phone_number_id deve ser numérico." }, 400);
    }
    if (!wabaId || !/^\d+$/.test(wabaId)) {
      return jsonResponse({ error: "business_account_id deve ser numérico." }, 400);
    }

    // 1) Validar token contra o phone_number_id via Graph
    const validateRes = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}?fields=verified_name,code_verification_status,display_phone_number,quality_rating,status,name_status&access_token=${encodeURIComponent(accessToken)}`,
    );
    const validateData = await validateRes.json().catch(() => ({}));

    if (!validateRes.ok) {
      return jsonResponse(
        {
          error: "Validação Graph API falhou",
          user_message:
            validateData?.error?.message ||
            "Token não tem permissão sobre esse phone_number_id, ou IDs incorretos.",
          details: validateData,
        },
        400,
      );
    }

    // 2) Update Supabase Secrets via Management API
    const pat = Deno.env.get("MGMT_PAT");
    if (!pat) {
      return jsonResponse(
        {
          error: "MGMT_PAT ausente no projeto",
          user_message:
            "O Astro precisa configurar o secret MGMT_PAT pra essa Edge Function poder atualizar os secrets do projeto.",
          phone_validation: validateData,
        },
        500,
      );
    }

    try {
      await setSupabaseSecrets(
        {
          WHATSAPP_ACCESS_TOKEN: accessToken,
          WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
          WHATSAPP_BUSINESS_ACCOUNT_ID: wabaId,
        },
        pat,
      );
    } catch (err) {
      return jsonResponse(
        {
          error: "Falha ao atualizar secrets",
          user_message: (err as Error).message,
        },
        500,
      );
    }

    return jsonResponse({
      ok: true,
      message: "Credenciais conectadas com sucesso. As Edge Functions vão usar os novos valores em ~30s.",
      phone: {
        verified_name: validateData.verified_name,
        display_phone_number: validateData.display_phone_number,
        quality_rating: validateData.quality_rating,
        status: validateData.status,
      },
    });
  } catch (err) {
    return jsonResponse(
      { error: "Erro interno", user_message: (err as Error).message },
      500,
    );
  }
});
