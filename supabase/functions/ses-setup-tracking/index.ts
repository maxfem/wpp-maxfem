// Provisiona SES Configuration Set + SNS topic + assinatura para o webhook ses-events-webhook
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  SESClient,
  CreateConfigurationSetCommand,
  DescribeConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  UpdateConfigurationSetEventDestinationCommand,
  DeleteConfigurationSetEventDestinationCommand,
} from "npm:@aws-sdk/client-ses@3.645.0";
import {
  SNSClient,
  CreateTopicCommand,
  ListSubscriptionsByTopicCommand,
  SubscribeCommand,
  SetTopicAttributesCommand,
} from "npm:@aws-sdk/client-sns@3.645.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVENT_DESTINATION_NAME = "maxfem-events";
const EVENT_TYPES = ["send", "reject", "bounce", "complaint", "delivery", "open", "click", "renderingFailure"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const accessKeyId = (Deno.env.get("AWS_ACCESS_KEY_ID") || "").trim();
    const secretAccessKey = (Deno.env.get("AWS_SECRET_ACCESS_KEY") || "").trim();
    const region = (Deno.env.get("AWS_REGION") || "us-east-1").trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    if (!accessKeyId || !secretAccessKey) throw new Error("AWS secrets ausentes.");

    const credentials = { accessKeyId, secretAccessKey };
    const ses = new SESClient({ region, credentials });
    const sns = new SNSClient({ region, credentials });

    // Auth: tenant via JWT
    const sbAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("Authorization");
    let tenantId: string | null = null;
    if (authHeader) {
      const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const { data: tm } = await sbAdmin
          .from("tenant_members").select("tenant_id").eq("user_id", user.id).limit(1).maybeSingle();
        tenantId = tm?.tenant_id || null;
      }
    }
    if (!tenantId) throw new Error("Tenant não identificado.");

    const csName = `maxfem-${tenantId.replace(/-/g, "").substring(0, 12)}`;
    const topicName = `maxfem-ses-events-${tenantId.replace(/-/g, "").substring(0, 12)}`;
    const webhookUrl = `${supabaseUrl}/functions/v1/ses-events-webhook`;

    const log: string[] = [];

    // 1. Configuration Set
    try {
      await ses.send(new DescribeConfigurationSetCommand({ ConfigurationSetName: csName }));
      log.push(`Configuration Set "${csName}" já existe.`);
    } catch {
      await ses.send(new CreateConfigurationSetCommand({ ConfigurationSet: { Name: csName } }));
      log.push(`Configuration Set "${csName}" criado.`);
    }

    // 2. SNS Topic
    const topicRes = await sns.send(new CreateTopicCommand({ Name: topicName }));
    const topicArn = topicRes.TopicArn!;
    log.push(`Tópico SNS pronto: ${topicArn}`);

    // 2.1 Permite SES publicar no tópico
    try {
      const policy = {
        Version: "2012-10-17",
        Statement: [{
          Sid: "AllowSESPublish",
          Effect: "Allow",
          Principal: { Service: "ses.amazonaws.com" },
          Action: "sns:Publish",
          Resource: topicArn,
        }],
      };
      await sns.send(new SetTopicAttributesCommand({
        TopicArn: topicArn,
        AttributeName: "Policy",
        AttributeValue: JSON.stringify(policy),
      }));
      log.push("Política SNS atualizada (SES pode publicar).");
    } catch (e: any) {
      log.push(`Aviso política SNS: ${e.message}`);
    }

    // 3. Event Destination
    const eventDestinationConfig = {
      Name: EVENT_DESTINATION_NAME,
      Enabled: true,
      MatchingEventTypes: EVENT_TYPES,
      SNSDestination: { TopicARN: topicArn },
    };
    try {
      await ses.send(new CreateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: csName,
        EventDestination: eventDestinationConfig as any,
      }));
      log.push(`Event Destination criado.`);
    } catch (e: any) {
      // Já existe → atualiza
      try {
        await ses.send(new UpdateConfigurationSetEventDestinationCommand({
          ConfigurationSetName: csName,
          EventDestination: eventDestinationConfig as any,
        }));
        log.push(`Event Destination atualizado.`);
      } catch (e2: any) {
        log.push(`Erro Event Destination: ${e2.message}`);
      }
    }

    // 4. Subscription HTTPS para webhook
    const subs = await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: topicArn }));
    const existing = (subs.Subscriptions || []).find(s => s.Endpoint === webhookUrl);
    if (existing && existing.SubscriptionArn && existing.SubscriptionArn !== "PendingConfirmation") {
      log.push(`Subscrição já confirmada: ${existing.SubscriptionArn}`);
    } else {
      await sns.send(new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "https",
        Endpoint: webhookUrl,
        ReturnSubscriptionArn: true,
      }));
      log.push(`Subscrição criada — confirmação automática via webhook em andamento.`);
    }

    // 5. Salva no integrations.config
    const { data: integ } = await sbAdmin
      .from("integrations").select("id, config").eq("tenant_id", tenantId).eq("provider", "aws").maybeSingle();

    const newConfig = {
      ...(integ?.config as any || {}),
      configuration_set: csName,
      sns_topic_arn: topicArn,
      tracking_setup_at: new Date().toISOString(),
    };

    if (integ) {
      await sbAdmin.from("integrations").update({ config: newConfig }).eq("id", integ.id);
    } else {
      await sbAdmin.from("integrations").insert({
        tenant_id: tenantId, provider: "aws", config: newConfig, is_active: true,
      });
    }
    log.push(`Configuração salva no banco (configuration_set=${csName}).`);

    return new Response(JSON.stringify({
      ok: true,
      configuration_set: csName,
      topic_arn: topicArn,
      webhook_url: webhookUrl,
      log,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[ses-setup-tracking]", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
