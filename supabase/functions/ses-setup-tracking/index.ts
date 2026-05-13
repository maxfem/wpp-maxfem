// Provisiona/reutiliza SES Configuration Set + SNS topic + assinatura para o webhook ses-events-webhook
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  SESClient,
  CreateConfigurationSetCommand,
  DescribeConfigurationSetCommand,
  ListConfigurationSetsCommand,
  CreateConfigurationSetEventDestinationCommand,
  UpdateConfigurationSetEventDestinationCommand,
} from "npm:@aws-sdk/client-ses@3.645.0";
import {
  SNSClient,
  CreateTopicCommand,
  ListTopicsCommand,
  ListSubscriptionsByTopicCommand,
  SubscribeCommand,
  SetTopicAttributesCommand,
  GetTopicAttributesCommand,
} from "npm:@aws-sdk/client-sns@3.645.0";
import { getAwsCredentials } from "../_shared/aws-credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVENT_DESTINATION_NAME = "maxfem-events";
const EVENT_TYPES = ["send", "reject", "bounce", "complaint", "delivery", "open", "click", "renderingFailure"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const sbAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Auth: tenant via JWT
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

    const awsCreds = await getAwsCredentials(sbAdmin, { tenantId });
    if (!awsCreds.accessKeyId || !awsCreds.secretAccessKey) {
      throw new Error("Credenciais AWS não configuradas. Cole AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY em /settings/integrations/aws.");
    }
    const region = awsCreds.region;
    const credentials = { accessKeyId: awsCreds.accessKeyId, secretAccessKey: awsCreds.secretAccessKey };
    const ses = new SESClient({ region, credentials });
    const sns = new SNSClient({ region, credentials });

    const webhookUrl = `${supabaseUrl}/functions/v1/ses-events-webhook`;
    const log: string[] = [];

    // Permite override via body
    let body: any = {};
    try { body = await req.json(); } catch {}
    const overrideTopicArn: string | undefined = body?.topic_arn;
    const overrideCsName: string | undefined = body?.configuration_set;

    // ----- 1. Descobrir/escolher SNS Topic -----
    let topicArn: string | null = overrideTopicArn || null;

    if (!topicArn) {
      // Procura tópico existente que já tenha assinatura confirmada para nosso webhook
      let nextToken: string | undefined = undefined;
      do {
        const list = await sns.send(new ListTopicsCommand({ NextToken: nextToken }));
        for (const t of list.Topics || []) {
          const arn = t.TopicArn!;
          try {
            const subs = await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: arn }));
            const match = (subs.Subscriptions || []).find(
              (s) => s.Endpoint === webhookUrl && s.SubscriptionArn && s.SubscriptionArn !== "PendingConfirmation"
            );
            if (match) {
              topicArn = arn;
              log.push(`Tópico SNS reutilizado (assinatura confirmada): ${arn}`);
              break;
            }
          } catch {}
        }
        nextToken = list.NextToken;
      } while (nextToken && !topicArn);
    } else {
      log.push(`Tópico SNS informado: ${topicArn}`);
    }

    // Se ainda não encontrou, cria
    if (!topicArn) {
      const topicName = `maxfem-ses-events-${tenantId.replace(/-/g, "").substring(0, 12)}`;
      const topicRes = await sns.send(new CreateTopicCommand({ Name: topicName }));
      topicArn = topicRes.TopicArn!;
      log.push(`Tópico SNS criado: ${topicArn}`);
    }

    // Garante política permitindo SES publicar (ignora se sem permissão)
    try {
      const attrs = await sns.send(new GetTopicAttributesCommand({ TopicArn: topicArn }));
      const currentPolicy = attrs.Attributes?.Policy ? JSON.parse(attrs.Attributes.Policy) : { Version: "2012-10-17", Statement: [] };
      const hasSesAllow = (currentPolicy.Statement || []).some((s: any) =>
        s?.Principal?.Service === "ses.amazonaws.com" && (s?.Action === "sns:Publish" || (Array.isArray(s?.Action) && s.Action.includes("sns:Publish")))
      );
      if (!hasSesAllow) {
        currentPolicy.Statement = currentPolicy.Statement || [];
        currentPolicy.Statement.push({
          Sid: "AllowSESPublish", Effect: "Allow",
          Principal: { Service: "ses.amazonaws.com" },
          Action: "sns:Publish", Resource: topicArn,
        });
        await sns.send(new SetTopicAttributesCommand({
          TopicArn: topicArn, AttributeName: "Policy", AttributeValue: JSON.stringify(currentPolicy),
        }));
        log.push("Política SNS atualizada (SES autorizado a publicar).");
      } else {
        log.push("Política SNS já permite SES publicar.");
      }
    } catch (e: any) {
      log.push(`Aviso política SNS (sem permissão IAM ou erro): ${e.message}`);
    }

    // Verifica assinatura HTTPS para webhook (ignora se sem permissão)
    try {
      const subs = await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: topicArn }));
      const existing = (subs.Subscriptions || []).find((s) => s.Endpoint === webhookUrl);
      if (existing && existing.SubscriptionArn && existing.SubscriptionArn !== "PendingConfirmation") {
        log.push(`Assinatura webhook já confirmada (${existing.SubscriptionArn}).`);
      } else if (existing) {
        log.push(`Assinatura webhook pendente de confirmação.`);
      } else {
        try {
          await sns.send(new SubscribeCommand({
            TopicArn: topicArn, Protocol: "https", Endpoint: webhookUrl, ReturnSubscriptionArn: true,
          }));
          log.push(`Assinatura webhook criada — confirmação automática em andamento.`);
        } catch (e: any) {
          log.push(`Aviso ao criar assinatura: ${e.message}`);
        }
      }
    } catch (e: any) {
      log.push(`Aviso ao listar assinaturas (sem permissão IAM): ${e.message}. Assumindo que já existe — verifique no console SNS.`);
    }

    // ----- 2. Descobrir/escolher SES Configuration Set -----
    let csName: string | null = overrideCsName || null;

    if (!csName) {
      // Procura um config set cujo Event Destination aponte para nosso topicArn
      let nextToken: string | undefined = undefined;
      do {
        const list = await ses.send(new ListConfigurationSetsCommand({ NextToken: nextToken }));
        for (const cs of list.ConfigurationSets || []) {
          const name = cs.Name!;
          try {
            const eds = await ses.send(new DescribeConfigurationSetCommand({ ConfigurationSetName: name, ConfigurationSetAttributeNames: ["eventDestinations"] as any }));
            const match = (eds.EventDestinations || []).find((e: any) => e?.SNSDestination?.TopicARN === topicArn);
            if (match) {
              csName = name;
              log.push(`Configuration Set reutilizado: ${name}`);
              break;
            }
          } catch {}
        }
        nextToken = list.NextConfigurationSetName;
      } while (nextToken && !csName);
    } else {
      log.push(`Configuration Set informado: ${csName}`);
    }

    // Se ainda não encontrou, cria
    if (!csName) {
      csName = `maxfem-${tenantId.replace(/-/g, "").substring(0, 12)}`;
      try {
        await ses.send(new DescribeConfigurationSetCommand({ ConfigurationSetName: csName }));
        log.push(`Configuration Set "${csName}" já existia.`);
      } catch {
        await ses.send(new CreateConfigurationSetCommand({ ConfigurationSet: { Name: csName } }));
        log.push(`Configuration Set "${csName}" criado.`);
      }
    }

    // Garante Event Destination para nosso topic
    const eventDestinationConfig = {
      Name: EVENT_DESTINATION_NAME,
      Enabled: true,
      MatchingEventTypes: EVENT_TYPES,
      SNSDestination: { TopicARN: topicArn },
    };
    try {
      const eds = await ses.send(new DescribeConfigurationSetCommand({ ConfigurationSetName: csName, ConfigurationSetAttributeNames: ["eventDestinations"] as any }));
      const matchOurTopic = (eds.EventDestinations || []).find((e: any) => e?.SNSDestination?.TopicARN === topicArn);
      const sameName = (eds.EventDestinations || []).find((e: any) => e?.Name === EVENT_DESTINATION_NAME);
      if (matchOurTopic) {
        // já existe destino para nosso topic — atualiza para garantir tipos de evento
        await ses.send(new UpdateConfigurationSetEventDestinationCommand({
          ConfigurationSetName: csName,
          EventDestination: { ...eventDestinationConfig, Name: matchOurTopic.Name } as any,
        }));
        log.push(`Event Destination "${matchOurTopic.Name}" atualizado.`);
      } else if (sameName) {
        await ses.send(new UpdateConfigurationSetEventDestinationCommand({
          ConfigurationSetName: csName, EventDestination: eventDestinationConfig as any,
        }));
        log.push(`Event Destination "${EVENT_DESTINATION_NAME}" atualizado.`);
      } else {
        await ses.send(new CreateConfigurationSetEventDestinationCommand({
          ConfigurationSetName: csName, EventDestination: eventDestinationConfig as any,
        }));
        log.push(`Event Destination "${EVENT_DESTINATION_NAME}" criado.`);
      }
    } catch (e: any) {
      log.push(`Erro Event Destination: ${e.message}`);
    }

    // ----- 3. Salva no integrations.config -----
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
    log.push(`Configuração salva (configuration_set=${csName}).`);

    return new Response(JSON.stringify({
      ok: true, configuration_set: csName, topic_arn: topicArn, webhook_url: webhookUrl, region, log,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[ses-setup-tracking]", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
