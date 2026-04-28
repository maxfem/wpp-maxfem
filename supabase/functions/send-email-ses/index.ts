import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { SESClient, SendEmailCommand, GetSendQuotaCommand, GetIdentityVerificationAttributesCommand } from "npm:@aws-sdk/client-ses@3.645.0";
import { STSClient, GetCallerIdentityCommand } from "npm:@aws-sdk/client-sts@3.645.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Translates AWS error codes into actionable Portuguese messages
function translateAwsError(err: any): string {
  const code = err?.name || err?.Code || err?.$metadata?.httpStatusCode;
  const msg = err?.message || String(err);

  if (msg.includes("SignatureDoesNotMatch")) {
    return "Sua AWS Secret Access Key está incorreta. Copie-a novamente do console IAM (não pode haver espaços ou caracteres faltando — ela tem exatamente 40 caracteres).";
  }
  if (msg.includes("InvalidClientTokenId") || code === "InvalidClientTokenId") {
    return "Sua AWS Access Key ID não existe ou foi desativada. Verifique no console IAM da AWS.";
  }
  if (msg.includes("AccessDenied") || code === "AccessDenied") {
    return "Permissão negada. O usuário IAM não tem as permissões necessárias (ses:SendEmail, ses:GetSendQuota, ses:GetIdentityVerificationAttributes). Anexe a policy 'AmazonSESFullAccess' ao usuário IAM.";
  }
  if (msg.includes("UnrecognizedClientException")) {
    return "Credenciais AWS não reconhecidas. Verifique Access Key ID e Secret Access Key.";
  }
  if (msg.includes("MessageRejected")) {
    return "E-mail rejeitado pelo SES. Possíveis causas: conta em modo Sandbox (só envia para e-mails verificados), remetente não verificado, ou conteúdo bloqueado.";
  }
  if (msg.includes("MailFromDomainNotVerified")) {
    return "O domínio do remetente não está verificado no AWS SES.";
  }
  if (msg.includes("ResolveEndpoint") || msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return "Região AWS inválida ou inexistente. Use uma região válida como 'us-east-1', 'sa-east-1' ou 'eu-west-1'.";
  }
  return msg;
}

interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  senderEmail: string;
}

async function resolveCredentials(mode: string, payload: any): Promise<Credentials> {
  const region = (payload.region || "").trim();
  const accessKeyId = (payload.accessKey || "").trim();
  const secretAccessKey = (payload.secretKey || "").trim();
  const senderEmail = (payload.fromEmail || "").trim();

  if (mode === "validate" || mode === "test") {
    // Always use payload credentials — never read from DB
    if (!accessKeyId || !secretAccessKey || !region || !senderEmail) {
      throw new Error("Preencha todos os campos: Access Key ID, Secret Access Key, Região e E-mail do remetente.");
    }
    return { accessKeyId, secretAccessKey, region, senderEmail };
  }

  // mode === "send" — read from DB
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await supabase.from("integrations").select("config").eq("provider", "aws").eq("is_active", true).limit(1).maybeSingle();
  if (!data?.config) {
    throw new Error("Integração AWS SES não configurada ou inativa.");
  }
  const config = data.config as any;
  return {
    accessKeyId: (config.access_key || "").trim(),
    secretAccessKey: (config.secret_key || "").trim(),
    region: (config.region || "us-east-1").trim(),
    senderEmail: (config.sender_email || "").trim(),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    // Backward compatibility: if no mode provided, infer from payload
    const mode: string = payload.mode || (payload.validate_only ? "validate" : "send");

    const creds = await resolveCredentials(mode, payload);

    const sesClient = new SESClient({
      region: creds.region,
      credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
    });

    // ========== VALIDATE MODE ==========
    if (mode === "validate") {
      const checks: any = {
        credentials: { ok: false },
        region: { ok: false },
        identity: { ok: false },
        quota: { ok: false },
      };

      // Step 1: Validate credentials with STS GetCallerIdentity
      try {
        const stsClient = new STSClient({
          region: creds.region,
          credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
        });
        const identity = await stsClient.send(new GetCallerIdentityCommand({}));
        checks.credentials = { ok: true, account_id: identity.Account, arn: identity.Arn };
      } catch (e: any) {
        checks.credentials = { ok: false, error: translateAwsError(e) };
        return new Response(JSON.stringify({ validated: false, failed_at: "credentials", checks }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Step 2: Region marcada OK (validada implicitamente pelos próximos comandos SES)
      checks.region = { ok: true, region: creds.region };

      // Step 3: Validate sender identity
      try {
        const verifyResult = await sesClient.send(
          new GetIdentityVerificationAttributesCommand({ Identities: [creds.senderEmail] })
        );
        const attr = verifyResult.VerificationAttributes?.[creds.senderEmail];
        if (!attr) {
          checks.identity = {
            ok: false,
            error: `O e-mail "${creds.senderEmail}" não está cadastrado como identidade no AWS SES. Adicione-o em SES → Verified Identities.`,
          };
        } else if (attr.VerificationStatus !== "Success") {
          checks.identity = {
            ok: false,
            status: attr.VerificationStatus,
            error: `O e-mail "${creds.senderEmail}" está com status "${attr.VerificationStatus}". Verifique a caixa de entrada e clique no link de confirmação enviado pela AWS.`,
          };
        } else {
          checks.identity = { ok: true, status: "Success", email: creds.senderEmail };
        }
      } catch (e: any) {
        checks.identity = { ok: false, error: translateAwsError(e) };
      }

      // Step 4: Validate IAM permission for sending (GetSendQuota)
      try {
        const quota = await sesClient.send(new GetSendQuotaCommand({}));
        checks.quota = {
          ok: true,
          max_24h: quota.Max24HourSend,
          sent_24h: quota.SentLast24Hours,
          max_per_second: quota.MaxSendRate,
          is_sandbox: quota.Max24HourSend === 200, // Standard SES sandbox limit is 200 emails/24h
        };
      } catch (e: any) {
        checks.quota = { ok: false, error: translateAwsError(e) };
      }

      const allOk = checks.credentials.ok && checks.region.ok && checks.identity.ok && checks.quota.ok;
      const failedAt = !checks.credentials.ok ? "credentials" : !checks.region.ok ? "region" : !checks.identity.ok ? "identity" : !checks.quota.ok ? "quota" : null;

      return new Response(JSON.stringify({ validated: allOk, failed_at: failedAt, checks }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ========== TEST & SEND MODE ==========
    const { to, subject, html, text, fromName } = payload;
    if (!to || !subject || !html) {
      throw new Error("Campos obrigatórios: to, subject, html.");
    }

    console.log(`[SES] mode=${mode} To=${Array.isArray(to) ? to[0] : to} From=${creds.senderEmail} Region=${creds.region}`);

    try {
      const result = await sesClient.send(new SendEmailCommand({
        Source: fromName ? `${fromName} <${creds.senderEmail}>` : creds.senderEmail,
        Destination: { ToAddresses: Array.isArray(to) ? to : [to] },
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
    } catch (e: any) {
      throw new Error(translateAwsError(e));
    }
  } catch (error: any) {
    console.error(`[SES] Handler Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
