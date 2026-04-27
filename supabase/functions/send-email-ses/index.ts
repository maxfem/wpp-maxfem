import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { AwsClient } from "https://deno.land/x/aws4fetch@v1.0.1/mod.ts";

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, subject, html, text, fromName, fromEmail }: EmailRequest = await req.json();

    const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const SENDER_EMAIL = fromEmail || Deno.env.get("SENDER_EMAIL");

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error("AWS credentials not configured");
    }

    const aws = new AwsClient({
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region: AWS_REGION,
      service: "ses",
    });

    const body = new URLSearchParams();
    body.append("Action", "SendEmail");
    body.append("Destination.ToAddresses.member.1", Array.isArray(to) ? to[0] : to);
    body.append("Message.Subject.Data", subject);
    body.append("Message.Body.Html.Data", html);
    if (text) body.append("Message.Body.Text.Data", text);
    body.append("Source", fromName ? `${fromName} <${SENDER_EMAIL}>` : SENDER_EMAIL!);

    const response = await aws.fetch(`https://email.${AWS_REGION}.amazonaws.com`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SES API error: ${errorText}`);
    }

    return new Response(JSON.stringify({ message: "Email sent successfully", to }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error sending email:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
