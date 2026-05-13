// whatsapp-media-handle
// Recebe URL ou base64 → executa Resumable Upload API do Meta → retorna handle
// Doc: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/resumable-upload
//
// Body:
//   { source_url: "https://..."  ou  file_base64: "...", file_type: "image/png", file_name: "img.png" }
//
// Retorna: { handle: "h:..." }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// WHATSAPP_APP_ID separado do META_APP_ID (Instagram) — preciso do app que tem
// WhatsApp Cloud API ativo (maxzap = 877027558735996), não o Instagram Login app.
const APP_ID =
  Deno.env.get("WHATSAPP_APP_ID") ||
  Deno.env.get("META_WHATSAPP_APP_ID") ||
  "877027558735996";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth check (user JWT)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    if (!accessToken) {
      return jsonResponse({
        error: "missing_token",
        user_message: "WHATSAPP_ACCESS_TOKEN não configurado nos secrets.",
      }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const sourceUrl = String(body.source_url || "").trim();
    const fileType = String(body.file_type || "image/png");
    const fileName = String(body.file_name || "upload");
    let fileBase64 = String(body.file_base64 || "");

    // 1. Obter bytes
    let bytes: Uint8Array;
    if (sourceUrl) {
      const r = await fetch(sourceUrl);
      if (!r.ok) {
        return jsonResponse({ error: "fetch_failed", user_message: `Não consegui baixar a imagem (${r.status}).` }, 400);
      }
      bytes = new Uint8Array(await r.arrayBuffer());
    } else if (fileBase64) {
      const clean = fileBase64.replace(/^data:[^;]+;base64,/, "");
      const binary = atob(clean);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else {
      return jsonResponse({ error: "no_source", user_message: "Informe source_url ou file_base64." }, 400);
    }

    const fileLength = bytes.length;
    // Limites Meta: image ≤ 5MB, video ≤ 16MB
    if (fileType.startsWith("image/") && fileLength > 5 * 1024 * 1024) {
      return jsonResponse({
        error: "too_large",
        user_message: `Imagem muito grande (${(fileLength / 1024 / 1024).toFixed(1)}MB). Máximo 5MB pra image.`,
      }, 400);
    }

    // 2. Iniciar sessão de upload
    const startUrl = new URL(`https://graph.facebook.com/v22.0/${APP_ID}/uploads`);
    startUrl.searchParams.set("file_length", String(fileLength));
    startUrl.searchParams.set("file_type", fileType);
    startUrl.searchParams.set("file_name", fileName);
    startUrl.searchParams.set("access_token", accessToken);

    const startRes = await fetch(startUrl, { method: "POST" });
    const startData = await startRes.json().catch(() => ({}));
    if (!startRes.ok || !startData.id) {
      return jsonResponse({
        error: "start_session_failed",
        user_message: `Meta Upload API falhou ao iniciar sessão: ${startData?.error?.message || startRes.status}`,
        details: startData,
      }, 500);
    }

    const sessionId = String(startData.id); // formato "upload:..."

    // 3. Subir bytes
    // sessionId já vem com `?sig=...` — não dá pra adicionar outro query param
    // file_offset deve ir SÓ no header
    const uploadUrl = `https://graph.facebook.com/v22.0/${sessionId}`;
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${accessToken}`,
        "Content-Type": fileType,
        "file_offset": "0",
      },
      body: bytes,
    });
    const uploadText = await uploadRes.text();
    let uploadData: any = {};
    try { uploadData = JSON.parse(uploadText); } catch {}

    if (!uploadRes.ok || !uploadData.h) {
      console.error("[wa-media] upload failed", uploadRes.status, uploadText);
      return jsonResponse({
        error: "upload_failed",
        user_message: `Meta Upload falhou (${uploadRes.status}): ${uploadData?.error?.message || uploadText.slice(0, 200)}`,
        meta_error: uploadData?.error || null,
        raw: uploadText.slice(0, 500),
        session_id: sessionId,
        bytes_size: fileLength,
        content_type: fileType,
      }, 500);
    }

    return jsonResponse({
      ok: true,
      handle: uploadData.h,
      session_id: sessionId,
      bytes: fileLength,
      file_type: fileType,
      file_name: fileName,
    });
  } catch (err) {
    return jsonResponse({
      error: "internal",
      user_message: (err as Error).message,
    }, 500);
  }
});
