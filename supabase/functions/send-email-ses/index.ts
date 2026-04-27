import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { SESClient, SendEmailCommand, GetSendQuotaCommand, GetIdentityVerificationAttributesCommand } from "npm:@aws-sdk/client-ses@3.645.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const { to, subject, html, text, fromName, fromEmail, validate_only, accessKey, secretKey, region: reqRegion } = payload;

    let AWS_REGION = (reqRegion || Deno.env.get("AWS_REGION") || "sa-east-1").trim();
    let AWS_ACCESS_KEY_ID = (accessKey || Deno.env.get("AWS_ACCESS_KEY_ID") || "").trim();
    let AWS_SECRET_ACCESS_KEY = (secretKey || Deno.env.get("AWS_SECRET_ACCESS_KEY") || "").trim();
    let SENDER_EMAIL = (fromEmail || Deno.env.get("SENDER_EMAIL") || "").trim();

    // Fallback to DB-stored config
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
    if (!SENDER_EMAIL) throw new Error("E-mail do remetente não configurado.");

    const ses = new SESClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });

    if (validate_only) {
      // 1. Validate credentials & permission
      try {
        await ses.send(new GetSendQuotaCommand({}));
      } catch (e: any) {
        throw new Error(`Credenciais inválidas ou sem permissão ses:GetSendQuota: ${e.message}`);
      }

      // 2. Validate sender email is verified in SES
      try {
        const verifyResult = await ses.send(
          new GetIdentityVerificationAttributesCommand({ Identities: [SENDER_EMAIL] })
        );
        const attr = verifyResult.VerificationAttributes?.[SENDER_EMAIL];
        if (!attr || attr.VerificationStatus !== "Success") {
          throw new Error(
            `O e-mail "${SENDER_EMAIL}" não está verificado no SES (status: ${attr?.VerificationStatus || "não encontrado"}). Verifique a identidade no console AWS SES.`
          );
        }
      } catch (e: any) {
        if (e.message.includes("não está verificado")) throw e;
        throw new Error(`Erro ao verificar identidade no SES: ${e.message}`);
      }

      return new Response(JSON.stringify({ success: true, validated: true, message: "Credenciais, região e remetente validados com sucesso." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email
    console.log(`[SES] Sending: To=${Array.isArray(to) ? to[0] : to}, From=${SENDER_EMAIL}, Region=${AWS_REGION}`);

    const result = await ses.send(new SendEmailCommand({
      Source: fromName ? `${fromName} <${SENDER_EMAIL}>` : SENDER_EMAIL,
      Destination: {
        ToAddresses: Array.isArray(to) ? to : [to],
      },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          ...(text ? { Text: { Data: text, Charset: "UTF-8" } } : {}),
        },
      },
    }));

    return new Response(JSON.stringify({ success: true, messageId: result.MessageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error(`[SES] Handler Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
