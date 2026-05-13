// SES Statistics: GetSendQuota + GetSendStatistics + GetAccountSendingEnabled
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { SESClient, GetSendQuotaCommand, GetSendStatisticsCommand } from "npm:@aws-sdk/client-ses@3.645.0";
import { SESv2Client, GetAccountCommand } from "npm:@aws-sdk/client-sesv2@3.645.0";
import { getAwsCredentials } from "../_shared/aws-credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autenticado.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Não autenticado.");

    const sbAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const awsCreds = await getAwsCredentials(sbAdmin);
    if (!awsCreds.accessKeyId || !awsCreds.secretAccessKey) {
      throw new Error("Credenciais AWS não configuradas. Cole AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY em /settings/integrations/aws.");
    }
    const region = awsCreds.region;
    const credentials = { accessKeyId: awsCreds.accessKeyId, secretAccessKey: awsCreds.secretAccessKey };
    const sesClient = new SESClient({ region, credentials });
    const sesv2Client = new SESv2Client({ region, credentials });

    const [quota, stats, account] = await Promise.allSettled([
      sesClient.send(new GetSendQuotaCommand({})),
      sesClient.send(new GetSendStatisticsCommand({})),
      sesv2Client.send(new GetAccountCommand({})),
    ]);

    const quotaData = quota.status === "fulfilled" ? {
      max_24h: quota.value.Max24HourSend,
      sent_24h: quota.value.SentLast24Hours,
      max_per_second: quota.value.MaxSendRate,
      is_sandbox: quota.value.Max24HourSend === 200,
    } : null;

    const datapoints = stats.status === "fulfilled" 
      ? (stats.value.SendDataPoints || []).sort((a, b) => 
          new Date(a.Timestamp!).getTime() - new Date(b.Timestamp!).getTime()
        ).map(dp => ({
          timestamp: dp.Timestamp,
          sent: dp.DeliveryAttempts || 0,
          bounces: dp.Bounces || 0,
          complaints: dp.Complaints || 0,
          rejects: dp.Rejects || 0,
        }))
      : [];

    const accountData = account.status === "fulfilled" ? {
      production_access_enabled: account.value.ProductionAccessEnabled,
      sending_enabled: account.value.SendingEnabled,
      enforcement_status: account.value.EnforcementStatus,
      send_quota: account.value.SendQuota,
    } : null;

    return new Response(JSON.stringify({
      quota: quotaData,
      datapoints,
      account: accountData,
      region,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[ses-statistics]", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
