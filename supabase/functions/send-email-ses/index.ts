import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { SESClient, SendEmailCommand, GetSendQuotaCommand, GetIdentityVerificationAttributesCommand } from "npm:@aws-sdk/client-ses@3.645.0";
import { STSClient, GetCallerIdentityCommand } from "npm:@aws-sdk/client-sts@3.645.0";
import { getAwsCredentials, awsCredsStatus } from "../_shared/aws-credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Translates AWS error codes into actionable Portuguese messages
function translateAwsError(err: any): string {
  const code = err?.name || err?.Code || err?.$metadata?.httpStatusCode;
  const msg = err?.message || String(err);

  if (msg.includes("SignatureDoesNotMatch") || msg.toLowerCase().includes("request signature we calculated")) {
    return "AWS Secret Access Key incorreta. Atualize AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY juntos, usando o mesmo par gerado no IAM, sem espaços.";
  }
  if (msg.includes("InvalidClientTokenId") || code === "InvalidClientTokenId") {
    return "AWS Access Key ID não existe ou foi desativada. Atualize o secret AWS_ACCESS_KEY_ID no projeto.";
  }
  if (msg.includes("AccessDenied") || code === "AccessDenied") {
    return "Permissão negada. O usuário IAM não tem ses:SendEmail, ses:GetSendQuota ou ses:GetIdentityVerificationAttributes. Anexe a policy 'AmazonSESFullAccess'.";
  }
  if (msg.includes("UnrecognizedClientException")) {
    return "Credenciais AWS não reconhecidas. Verifique os secrets AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY.";
  }
  if (msg.includes("MessageRejected")) {
    return "E-mail rejeitado pelo SES. Causa comum: conta em Sandbox (envia só para e-mails verificados) ou remetente não verificado.";
  }
  if (msg.includes("MailFromDomainNotVerified")) {
    return "Domínio do remetente não verificado no AWS SES.";
  }
  if (msg.includes("ResolveEndpoint") || msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return "Região AWS inválida. Atualize o secret AWS_REGION (ex: 'us-east-1', 'sa-east-1').";
  }
  return msg;
}

interface AwsEnv {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function getAwsEnv(tenantId?: string): Promise<AwsEnv> {
  const supabase = adminClient();
  const creds = await getAwsCredentials(supabase, { tenantId });
  if (!creds.accessKeyId || !creds.secretAccessKey) {
    throw new Error("Credenciais AWS não configuradas. Cole AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY em /settings/integrations/aws.");
  }
  return { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey, region: creds.region };
}

async function getAwsConfigFromDb(tenantId?: string | null): Promise<{ senderEmail: string; configurationSet: string | null }> {
  const supabase = adminClient();
  let q = supabase.from("integrations").select("config, tenant_id").eq("provider", "aws").eq("is_active", true);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data } = await q.limit(1).maybeSingle();
  if (!data?.config) throw new Error("Integração AWS SES não configurada ou inativa.");
  const cfg = data.config as any;
  const senderEmail = (cfg.sender_email || "").trim();
  if (!senderEmail) throw new Error("E-mail remetente não configurado na integração AWS SES.");
  return { senderEmail, configurationSet: (cfg.configuration_set || "").trim() || null };
}

async function resolveTenantFromAuth(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const admin = adminClient();
  const { data } = await admin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  return data?.tenant_id || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const mode: string = payload.mode || (payload.validate_only ? "validate" : "send");

    // Auth: Supabase Functions já valida o JWT no proxy (verify_jwt = true).
    // Aqui só extraímos o tenant: prioriza tenantId do body (caso server-to-server),
    // fallback pro tenant_members do user.
    const authHeader = req.headers.get("Authorization");
    let authedTenantId: string | null =
      String(payload.tenantId || payload.tenant_id || "").trim() || null;
    if (!authedTenantId) {
      authedTenantId = await resolveTenantFromAuth(authHeader);
    }
    if (!authedTenantId) {
      return new Response(JSON.stringify({ error: "Unauthorized — missing tenant" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== STATUS MODE ========== (no AWS calls, returns DB+env credential availability)
    if (mode === "status") {
      const supabase = adminClient();
      const creds = await getAwsCredentials(supabase, { tenantId: authedTenantId });
      return new Response(JSON.stringify(awsCredsStatus(creds)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const env = await getAwsEnv(authedTenantId);

    const sesClient = new SESClient({
      region: env.region,
      credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
    });

    // ========== VALIDATE MODE ==========
    if (mode === "validate") {
      const senderEmail = (payload.fromEmail || "").trim();
      if (!senderEmail) {
        return new Response(JSON.stringify({ error: "E-mail do remetente é obrigatório." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const checks: any = {
        credentials: { ok: false },
        region: { ok: false },
        identity: { ok: false },
        quota: { ok: false },
      };

      // Step 1: STS GetCallerIdentity
      try {
        const stsClient = new STSClient({
          region: env.region,
          credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
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

      checks.region = { ok: true, region: env.region };

      // Step 3: Identity verification
      try {
        const verifyResult = await sesClient.send(
          new GetIdentityVerificationAttributesCommand({ Identities: [senderEmail] })
        );
        const attr = verifyResult.VerificationAttributes?.[senderEmail];
        if (!attr) {
          checks.identity = { ok: false, error: `O e-mail "${senderEmail}" não está cadastrado no AWS SES → Verified Identities.` };
        } else if (attr.VerificationStatus !== "Success") {
          checks.identity = { ok: false, status: attr.VerificationStatus, error: `O e-mail "${senderEmail}" está com status "${attr.VerificationStatus}". Confirme o link enviado pela AWS.` };
        } else {
          checks.identity = { ok: true, status: "Success", email: senderEmail };
        }
      } catch (e: any) {
        checks.identity = { ok: false, error: translateAwsError(e) };
      }

      // Step 4: Quota & sandbox detection
      try {
        const quota = await sesClient.send(new GetSendQuotaCommand({}));
        checks.quota = {
          ok: true,
          max_24h: quota.Max24HourSend,
          sent_24h: quota.SentLast24Hours,
          max_per_second: quota.MaxSendRate,
          is_sandbox: quota.Max24HourSend === 200,
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
    const { to, subject, html, text, fromName, tenantId, campaignId, customerId, nodeId } = payload;
    let configurationSet: string | null = (payload.configurationSet || "").trim() || null;
    if (!to || !subject || !html) {
      throw new Error("Campos obrigatórios: to, subject, html.");
    }

    // Resolve sender + configuration set: payload (test) or DB (send)
    let senderEmail: string;
    if (mode === "test") {
      senderEmail = (payload.fromEmail || "").trim();
      if (!senderEmail) throw new Error("E-mail do remetente é obrigatório no modo teste.");
      // Mesmo em teste, usa o CS do tenant se houver, para validar tracking
      if (!configurationSet) {
        try {
          const cfg = await getAwsConfigFromDb(tenantId || null);
          configurationSet = cfg.configurationSet;
        } catch {}
      }
    } else {
      const cfg = await getAwsConfigFromDb(tenantId || null);
      senderEmail = cfg.senderEmail;
      if (!configurationSet) configurationSet = cfg.configurationSet;
    }

    // Resolve user via auth header for logging
    let userId: string | null = null;
    let resolvedTenant: string | null = tenantId || null;
    try {
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } });
        const { data: { user } } = await sb.auth.getUser();
        userId = user?.id || null;
      }
    } catch {}

    // Resolve tenant if not provided
    if (!resolvedTenant && userId) {
      try {
        const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: tm } = await sbAdmin.from("tenant_members").select("tenant_id").eq("user_id", userId).limit(1).maybeSingle();
        resolvedTenant = tm?.tenant_id || null;
      } catch {}
    }

    console.log(`[SES] mode=${mode} To=${Array.isArray(to) ? to[0] : to} From=${senderEmail} Region=${env.region} CS=${configurationSet || "-"}`);

    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Check suppression list
    if (resolvedTenant) {
      const targetEmail = Array.isArray(to) ? to[0] : to;
      const { data: suppression } = await sbAdmin
        .from("email_suppressions")
        .select("id")
        .eq("tenant_id", resolvedTenant)
        .eq("email", targetEmail.toLowerCase())
        .maybeSingle();
      
      if (suppression) {
        console.warn(`[SES] Skipping email to ${targetEmail} - Suppressed`);
        return new Response(JSON.stringify({ success: false, error: "E-mail está na lista de descadastro." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200, // Return 200 to avoid retry loops, but with success: false
        });
      }
    }

    try {
      const sendParams: any = {
        Source: fromName ? `${fromName} <${senderEmail}>` : senderEmail,
        Destination: { ToAddresses: Array.isArray(to) ? to : [to] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: html, Charset: "UTF-8" },
            ...(text ? { Text: { Data: text, Charset: "UTF-8" } } : {}),
          },
        },
      };
      
      if (configurationSet) sendParams.ConfigurationSetName = configurationSet;
      
      // SES Tags for tracking (metadata)
      const tags = [];
      if (resolvedTenant) tags.push({ Name: "tenant_id", Value: resolvedTenant });
      if (campaignId) tags.push({ Name: "campaign_id", Value: campaignId });
      if (customerId) tags.push({ Name: "customer_id", Value: customerId });
      if (tags.length > 0) sendParams.Tags = tags;

      const result = await sesClient.send(new SendEmailCommand(sendParams));
      const messageId = result.MessageId;
      console.log(`[SES] ✅ Sent messageId=${messageId}`);

      // Log to email_logs and campaign_activities
      if (resolvedTenant) {
        try {
          
          // Log in email_logs
          await sbAdmin.from("email_logs").insert({
            user_id: userId,
            tenant_id: resolvedTenant,
            campaign_id: campaignId || null,
            customer_id: customerId || null,
            to_email: Array.isArray(to) ? to.join(", ") : to,
            from_email: senderEmail,
            subject,
            body_html: html,
            status: "sent",
            sent_at: new Date().toISOString(),
            aws_message_id: messageId,
            configuration_set: configurationSet || null,
          });

          // Log in campaign_activities if it's a campaign
          // IMPORTANTE: passar nodeId é o que faz as métricas por nó aparecerem
          // no editor de automation flow (rpc_node_metrics agrupa por node_id).
          // Sem isso, contadores de envios/abrir/clique ficam zerados nos nós.
          if (campaignId && customerId) {
            const activityRow: Record<string, unknown> = {
              campaign_id: campaignId,
              customer_id: customerId,
              tenant_id: resolvedTenant,
              channel: "email",
              status: "sent",
              sent_at: new Date().toISOString(),
            };
            if (nodeId) activityRow.node_id = nodeId;
            await sbAdmin.from("campaign_activities").upsert(activityRow, {
              onConflict: "campaign_id,customer_id,channel",
            });
          }
        } catch (logErr) {
          console.error("[SES] log error:", logErr);
        }
      }


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
