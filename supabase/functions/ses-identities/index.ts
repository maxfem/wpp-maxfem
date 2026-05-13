// SES Identities: ListIdentities + GetIdentityVerificationAttributes + GetIdentityDkimAttributes
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  SESClient,
  ListIdentitiesCommand,
  GetIdentityVerificationAttributesCommand,
  GetIdentityDkimAttributesCommand,
  VerifyEmailIdentityCommand,
  VerifyDomainIdentityCommand,
  DeleteIdentityCommand,
} from "npm:@aws-sdk/client-ses@3.645.0";
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
    const ses = new SESClient({
      region: awsCreds.region,
      credentials: { accessKeyId: awsCreds.accessKeyId, secretAccessKey: awsCreds.secretAccessKey },
    });

    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    if (action === "verify_email") {
      const email = (body.email || "").trim();
      if (!email) throw new Error("E-mail é obrigatório.");
      await ses.send(new VerifyEmailIdentityCommand({ EmailAddress: email }));
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify_domain") {
      const domain = (body.domain || "").trim();
      if (!domain) throw new Error("Domínio é obrigatório.");
      const result = await ses.send(new VerifyDomainIdentityCommand({ Domain: domain }));
      return new Response(JSON.stringify({ success: true, verification_token: result.VerificationToken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const identity = (body.identity || "").trim();
      if (!identity) throw new Error("Identidade é obrigatória.");
      await ses.send(new DeleteIdentityCommand({ Identity: identity }));
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: list all
    const list = await ses.send(new ListIdentitiesCommand({ MaxItems: 100 }));
    const identities = list.Identities || [];

    if (identities.length === 0) {
      return new Response(JSON.stringify({ identities: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [verifyAttrs, dkimAttrs] = await Promise.all([
      ses.send(new GetIdentityVerificationAttributesCommand({ Identities: identities })),
      ses.send(new GetIdentityDkimAttributesCommand({ Identities: identities })),
    ]);

    const result = identities.map(id => {
      const v = verifyAttrs.VerificationAttributes?.[id];
      const d = dkimAttrs.DkimAttributes?.[id];
      const isDomain = !id.includes("@");
      return {
        identity: id,
        type: isDomain ? "domain" : "email",
        verification_status: v?.VerificationStatus || "Unknown",
        verification_token: v?.VerificationToken || null,
        dkim_enabled: d?.DkimEnabled || false,
        dkim_status: d?.DkimVerificationStatus || "Unknown",
        dkim_tokens: d?.DkimTokens || [],
      };
    });

    return new Response(JSON.stringify({ identities: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[ses-identities]", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
