import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
}

// Simple SigV4 signing implementation for SES
async function sign(request: Request, accessKey: string, secretKey: string, region: string) {
  const service = "ses";
  const host = `email.${region}.amazonaws.com`;
  const datetime = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, "");
  const date = datetime.slice(0, 8);

  request.headers.set("x-amz-date", datetime);
  request.headers.set("host", host);

  const canonicalRequest = [
    request.method,
    "/",
    "",
    Array.from(request.headers.entries())
      .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
      .sort()
      .join("\n") + "\n",
    Array.from(request.headers.keys()).map(k => k.toLowerCase()).sort().join(";"),
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(await request.clone().text())).then(b => 
      Array.from(new Uint8Array(b)).map(b => b.toString(16).padStart(2, "0")).join("")
    ),
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    datetime,
    `${date}/${region}/${service}/aws4_request`,
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest)).then(b => 
      Array.from(new Uint8Array(b)).map(b => b.toString(16).padStart(2, "0")).join("")
    ),
  ].join("\n");

  const kDate = await hmac(new TextEncoder().encode("AWS4" + secretKey), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = Array.from(new Uint8Array(await hmac(kSigning, stringToSign))).map(b => b.toString(16).padStart(2, "0")).join("");

  request.headers.set("Authorization", `AWS4-HMAC-SHA256 Credential=${accessKey}/${date}/${region}/${service}/aws4_request, SignedHeaders=${Array.from(request.headers.keys()).map(k => k.toLowerCase()).sort().join(";")}, Signature=${signature}`);
}

async function hmac(key: ArrayBufferView | ArrayBuffer, data: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { to, subject, html, text, fromName, fromEmail }: EmailRequest = await req.json();
    const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID")!;
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;
    let SENDER_EMAIL = fromEmail || Deno.env.get("SENDER_EMAIL");

    // Fallback: try to load sender_email from integrations table (AWS provider)
    if (!SENDER_EMAIL) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        const { data } = await supabase
          .from("integrations")
          .select("config")
          .eq("provider", "aws")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        const cfg = data?.config as any;
        if (cfg?.sender_email) SENDER_EMAIL = cfg.sender_email;
      } catch (_) { /* ignore */ }
    }

    if (!SENDER_EMAIL) throw new Error("SENDER_EMAIL não configurado. Defina o e-mail remetente em /settings/integrations/aws ou no Secret SENDER_EMAIL.");

    const body = new URLSearchParams();
    body.append("Action", "SendEmail");
    body.append("Destination.ToAddresses.member.1", Array.isArray(to) ? to[0] : to);
    body.append("Message.Subject.Data", subject);
    body.append("Message.Body.Html.Data", html);
    if (text) body.append("Message.Body.Text.Data", text);
    body.append("Source", fromName ? `${fromName} <${SENDER_EMAIL}>` : SENDER_EMAIL);

    const request = new Request(`https://email.${AWS_REGION}.amazonaws.com/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    await sign(request, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
    const response = await fetch(request);
    const resultText = await response.text();

    if (!response.ok) throw new Error(`AWS Error: ${resultText}`);

    return new Response(JSON.stringify({ success: true, details: resultText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
