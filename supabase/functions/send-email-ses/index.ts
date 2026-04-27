import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const { to, subject, html, text, fromName, fromEmail, validate_only, accessKey, secretKey, region: reqRegion } = payload;
    
    let AWS_REGION = reqRegion || Deno.env.get("AWS_REGION") || "sa-east-1";
    let AWS_ACCESS_KEY_ID = (accessKey || Deno.env.get("AWS_ACCESS_KEY_ID") || "").trim();
    let AWS_SECRET_ACCESS_KEY = (secretKey || Deno.env.get("AWS_SECRET_ACCESS_KEY") || "").trim();
    let SENDER_EMAIL = (fromEmail || Deno.env.get("SENDER_EMAIL") || "").trim();

    // If credentials not provided in request, try to get from DB
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !SENDER_EMAIL) {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data } = await supabase.from("integrations").select("config").eq("provider", "aws").eq("is_active", true).limit(1).maybeSingle();
      
      if (data?.config) {
        const config = data.config as any;
        if (!AWS_ACCESS_KEY_ID) AWS_ACCESS_KEY_ID = (config.access_key || "").trim();
        if (!AWS_SECRET_ACCESS_KEY) AWS_SECRET_ACCESS_KEY = (config.secret_key || "").trim();
        if (!SENDER_EMAIL) SENDER_EMAIL = (config.sender_email || "").trim();
        if (!reqRegion && config.region) AWS_REGION = (config.region || "").trim();
      }
    }

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) throw new Error("Credenciais AWS não configuradas.");
    if (!SENDER_EMAIL) throw new Error("SENDER_EMAIL não configurado.");

    if (validate_only) {
      // To validate, we'll try to list identities or just send a GetSendQuota request
      // Action: GetSendQuota is a lightweight read action
      const body = new URLSearchParams();
      body.append("Action", "GetSendQuota");
      const bodyStr = body.toString().replace(/\+/g, "%20");
      const datetime = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, "");
      const date = datetime.slice(0, 8);
      const host = `email.${AWS_REGION}.amazonaws.com`;
      const endpoint = `https://${host}/`;

      const bodyHash = await sha256(bodyStr);
      const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${datetime}`;
      const signedHeaders = "content-type;host;x-amz-date";
      const canonicalRequest = ["POST", "/", "", canonicalHeaders + "\n", signedHeaders, bodyHash].join("\n");
      const scope = `${date}/${AWS_REGION}/ses/aws4_request`;
      const stringToSign = ["AWS4-HMAC-SHA256", datetime, scope, await sha256(canonicalRequest)].join("\n");
      const kDate = await hmacRaw(new TextEncoder().encode("AWS4" + AWS_SECRET_ACCESS_KEY), date);
      const kRegion = await hmacRaw(kDate, AWS_REGION);
      const kService = await hmacRaw(kRegion, "ses");
      const kSigning = await hmacRaw(kService, "aws4_request");
      const signature = await hmacHex(kSigning, stringToSign);
      const authHeader = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Host": host,
          "X-Amz-Date": datetime,
          "Authorization": authHeader,
        },
        body: bodyStr,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Credenciais inválidas: ${errText}`);
      }

      return new Response(JSON.stringify({ success: true, validated: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!SENDER_EMAIL) throw new Error("SENDER_EMAIL não configurado.");

    const body = new URLSearchParams();
    body.append("Action", "SendEmail");
    body.append("Destination.ToAddresses.member.1", Array.isArray(to) ? to[0] : to);
    body.append("Message.Subject.Data", subject);
    body.append("Message.Body.Html.Data", html);
    if (text) body.append("Message.Body.Text.Data", text);
    body.append("Source", fromName ? `${fromName} <${SENDER_EMAIL}>` : SENDER_EMAIL);

    const bodyStr = body.toString().replace(/\+/g, "%20");
    const datetime = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, "");
    const date = datetime.slice(0, 8);
    const host = `email.${AWS_REGION}.amazonaws.com`;
    const endpoint = `https://${host}/`;

    // 1. Canonical Request
    const bodyHash = await sha256(bodyStr);
    // Explicit headers order for canonical request
    const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${datetime}`;
    const signedHeaders = "content-type;host;x-amz-date";
    const canonicalRequest = [
      "POST",
      "/",
      "",
      canonicalHeaders + "\n",
      signedHeaders,
      bodyHash
    ].join("\n");

    // 2. String to Sign
    const scope = `${date}/${AWS_REGION}/ses/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      datetime,
      scope,
      await sha256(canonicalRequest)
    ].join("\n");

    // 3. Signature
    // Important: secret key used in first hmacRaw must be prepended with "AWS4"
    const kDate = await hmacRaw(new TextEncoder().encode("AWS4" + AWS_SECRET_ACCESS_KEY), date);
    const kRegion = await hmacRaw(kDate, AWS_REGION);
    const kService = await hmacRaw(kRegion, "ses");
    const kSigning = await hmacRaw(kService, "aws4_request");
    const signature = await hmacHex(kSigning, stringToSign);

    const authHeader = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    console.log(`[SES] Attempting send: To=${Array.isArray(to) ? to[0] : to}, From=${SENDER_EMAIL}, Region=${AWS_REGION}`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Host": host,
        "X-Amz-Date": datetime,
        "Authorization": authHeader,
      },
      body: bodyStr,
    });

    const resultText = await response.text();
    if (!response.ok) {
      console.error(`[SES] AWS Error (Signature Check): ${resultText}`);
      throw new Error(`AWS SES Error: ${resultText}`);
    }

    return new Response(JSON.stringify({ success: true, messageId: resultText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[SES] Handler Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function sha256(message: string) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacRaw(key: ArrayBuffer, data: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function hmacHex(key: ArrayBuffer, data: string) {
  const signature = await hmacRaw(key, data);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
}
