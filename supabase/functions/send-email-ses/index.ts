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

    if (!SENDER_EMAIL) throw new Error("SENDER_EMAIL não configurado.");

    // Simple SMTP-like request to SES API via URL params to avoid SigV4 complexities in manual implementation
    const url = new URL(`https://email.${AWS_REGION}.amazonaws.com/`);
    url.searchParams.append("Action", "SendEmail");
    url.searchParams.append("Destination.ToAddresses.member.1", Array.isArray(to) ? to[0] : to);
    url.searchParams.append("Message.Subject.Data", subject);
    url.searchParams.append("Message.Body.Html.Data", html);
    if (text) url.searchParams.append("Message.Body.Text.Data", text);
    url.searchParams.append("Source", fromName ? `${fromName} <${SENDER_EMAIL}>` : SENDER_EMAIL);

    // Using AWS standard Auth Header for simple requests
    const datetime = new Date().toUTCString();
    
    // AWS SES specific auth header for simple requests (AWS3-HTTPS)
    const authHeader = `AWS3-HTTPS AWSAccessKeyId=${AWS_ACCESS_KEY_ID},Algorithm=HmacSHA256,Signature=${await hmacSignature(AWS_SECRET_ACCESS_KEY, datetime)}`;

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "X-Amzn-Authorization": authHeader,
        "Date": datetime,
      },
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

async function hmacSignature(secret: string, date: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(date));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
