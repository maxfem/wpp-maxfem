// SES Suppression List management (account-level)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  SESv2Client,
  ListSuppressedDestinationsCommand,
  PutSuppressedDestinationCommand,
  DeleteSuppressedDestinationCommand,
} from "npm:@aws-sdk/client-sesv2@3.645.0";

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    // Check if it's service role or a valid user
    const isServiceRole = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (!isServiceRole) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!user) throw new Error("Não autenticado.");
    }

    const ses = new SESv2Client({
      region: Deno.env.get("AWS_REGION") || "us-east-1",
      credentials: {
        accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!.trim(),
        secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!.trim(),
      },
    });

    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    if (action === "add") {
      const email = (body.email || "").trim().toLowerCase();
      const reason = body.reason === "COMPLAINT" ? "COMPLAINT" : "BOUNCE";
      if (!email) throw new Error("E-mail é obrigatório.");
      await ses.send(new PutSuppressedDestinationCommand({ EmailAddress: email, Reason: reason }));
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "remove") {
      const email = (body.email || "").trim().toLowerCase();
      if (!email) throw new Error("E-mail é obrigatório.");
      await ses.send(new DeleteSuppressedDestinationCommand({ EmailAddress: email }));
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List
    const all: any[] = [];
    let nextToken: string | undefined;
    let pages = 0;
    do {
      const r = await ses.send(new ListSuppressedDestinationsCommand({
        PageSize: 100,
        NextToken: nextToken,
      }));
      for (const item of r.SuppressedDestinationSummaries || []) {
        all.push({
          email: item.EmailAddress,
          reason: item.Reason,
          last_update_time: item.LastUpdateTime,
        });
      }
      nextToken = r.NextToken;
      pages++;
    } while (nextToken && pages < 10); // cap at 1000 records

    return new Response(JSON.stringify({ suppressed: all, total: all.length, has_more: !!nextToken }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[ses-suppression]", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
