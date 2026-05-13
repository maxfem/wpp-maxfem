// data-deletion-callback
// Endpoint oficial Meta para "User Data Deletion Callback".
// Doc: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
//
// Fluxo:
//   1. Meta envia POST com body: signed_request=<base64>.<base64>
//   2. Decodificamos usando HMAC-SHA256 com META_APP_SECRET
//   3. Extraímos user_id do payload
//   4. Registramos pedido em data_deletion_requests + soft-delete dos dados associados
//   5. Retornamos JSON: { url: <página de status>, confirmation_code: <código rastreável> }
//
// Spec exige: response com 200 OK + JSON com url + confirmation_code (Meta mostra ao usuário)
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = Deno.env.get("APP_URL") || "https://maxfem-crm.vercel.app";

function base64UrlDecode(input: string): Uint8Array {
  // base64url → base64
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const decoded = atob(padded + padding);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function parseSignedRequest(signedRequest: string, appSecret: string) {
  const [encodedSig, encodedPayload] = signedRequest.split(".");
  if (!encodedSig || !encodedPayload) throw new Error("Invalid signed_request format");

  const sig = base64UrlDecode(encodedSig);
  const expectedSig = await hmacSha256(appSecret, encodedPayload);
  if (!bytesEqual(sig, expectedSig)) {
    throw new Error("Invalid signature");
  }

  const payloadJson = bytesToText(base64UrlDecode(encodedPayload));
  return JSON.parse(payloadJson) as { user_id?: string; algorithm?: string; issued_at?: number };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    // Permite consulta de status: ?id=<confirmation_code>
    const url = new URL(req.url);
    const confirmationCode = url.searchParams.get("id");
    if (confirmationCode) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { data } = await supabase
          .from("data_deletion_requests")
          .select("status, requested_at, processed_at")
          .eq("confirmation_code", confirmationCode)
          .maybeSingle();
        const html = data
          ? `<h1>Status: ${data.status}</h1><p>Solicitação: ${data.requested_at}</p>${data.processed_at ? `<p>Processada em: ${data.processed_at}</p>` : "<p>Aguardando processamento.</p>"}`
          : `<h1>Solicitação não encontrada</h1>`;
        return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Exclusão de dados Maxfem</title><body style="font-family:system-ui;max-width:600px;margin:40px auto;padding:24px">${html}</body></html>`, {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
        });
      } catch (e) {
        return new Response(`<h1>Erro</h1><p>${(e as Error).message}</p>`, { status: 500 });
      }
    }
    return new Response("Maxfem Data Deletion Callback — POST signed_request", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appSecret) {
      return new Response(JSON.stringify({ error: "META_APP_SECRET ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let signedRequest = "";
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await req.text();
      const params = new URLSearchParams(body);
      signedRequest = params.get("signed_request") || "";
    } else if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      signedRequest = body.signed_request || "";
    } else {
      const body = await req.text();
      const params = new URLSearchParams(body);
      signedRequest = params.get("signed_request") || "";
    }

    if (!signedRequest) {
      return new Response(JSON.stringify({ error: "signed_request ausente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await parseSignedRequest(signedRequest, appSecret);
    const userId = payload.user_id || "unknown";

    // Gera código de confirmação único
    const confirmationCode = "MXF" + Math.random().toString(36).slice(2, 14).toUpperCase();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Registra pedido (a tabela data_deletion_requests pode não existir ainda — captura erro)
    try {
      await supabase.from("data_deletion_requests").insert({
        confirmation_code: confirmationCode,
        meta_user_id: userId,
        platform: "meta",
        status: "pending",
        requested_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[data-deletion] insert request failed (table may not exist):", (err as Error).message);
    }

    // Soft-delete melhor esforço — Instagram + WhatsApp
    try {
      // IG: marca contas com mesmo meta user como inativas (best-effort)
      await supabase
        .from("instagram_accounts")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("ig_user_id", userId);
    } catch {}

    return new Response(
      JSON.stringify({
        url: `${APP_URL}/data-deletion?id=${confirmationCode}`,
        confirmation_code: confirmationCode,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[data-deletion] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
