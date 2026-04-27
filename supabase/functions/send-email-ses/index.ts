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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { to, subject, html, text, fromName, fromEmail }: EmailRequest = await req.json();
    const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID")!;
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;
    let SENDER_EMAIL = fromEmail || Deno.env.get("SENDER_EMAIL");

    if (!SENDER_EMAIL) {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data } = await supabase.from("integrations").select("config").eq("provider", "aws").eq("is_active", true).limit(1).maybeSingle();
      if (data?.config && (data.config as any).sender_email) SENDER_EMAIL = (data.config as any).sender_email;
    }

    if (!SENDER_EMAIL) throw new Error("SENDER_EMAIL não configurado.");

    const body = new URLSearchParams();
    body.append("Action", "SendEmail");
    body.append("Destination.ToAddresses.member.1", Array.isArray(to) ? to[0] : to);
    body.append("Message.Subject.Data", subject);
    body.append("Message.Body.Html.Data", html);
    if (text) body.append("Message.Body.Text.Data", text);
    body.append("Source", fromName ? `${fromName} <${SENDER_EMAIL}>` : SENDER_EMAIL);

    const endpoint = `https://email.${AWS_REGION}.amazonaws.com/`;
    const datetime = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, "");
    const date = datetime.slice(0, 8);
    const bodyStr = body.toString();

    // 1. Canonical Request
    const bodyHash = await sha256(bodyStr);
    const canonicalRequest = [
      "POST",
      "/",
      "",
      `content-type:application/x-www-form-urlencoded\nhost:email.${AWS_REGION}.amazonaws.com\nx-amz-date:${datetime}\n`,
      "content-type;host;x-amz-date",
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
    const kDate = await hmacRaw(`AWS4${AWS_SECRET_ACCESS_KEY}`, date);
    const kRegion = await hmacRaw(kDate, AWS_REGION);
    const kService = await hmacRaw(kRegion, "ses");
    const kSigning = await hmacRaw(kService, "aws4_request");
    const signature = await hmacHex(kSigning, stringToSign);

    const authHeader = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=content-type;host;x-amz-date, Signature=${signature}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Amz-Date": datetime,
        "Authorization": authHeader,
      },
      body: bodyStr,
    });

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

async function sha256(message: string) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacRaw(key: string | ArrayBuffer, data: string) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", 
    typeof key === "string" ? encoder.encode(key) : key, 
    { name: "HMAC", hash: "SHA-256" }, 
    false, 
    ["sign"]
  );
  return await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

async function hmacHex(key: ArrayBuffer, data: string) {
  const signature = await hmacRaw(key, data);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
}
