import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("t");
    const email = url.searchParams.get("e");

    if (!tenantId || !email) {
      return new Response("Parâmetros inválidos", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Add to our suppression list
    const { error: suppressionError } = await supabase
      .from("email_suppressions")
      .upsert({
        tenant_id: tenantId,
        email: email.toLowerCase(),
        reason: "unsubscribe"
      }, { onConflict: "tenant_id, email" });

    if (suppressionError) {
      console.error("Error adding to suppressions:", suppressionError);
      throw suppressionError;
    }

    // Call SES suppression if configured
    try {
      const sesSuppressionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ses-suppression`;
      await fetch(sesSuppressionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
        },
        body: JSON.stringify({
          action: "add",
          email: email.toLowerCase(),
          reason: "COMPLAINT" // SES uses COMPLAINT or BOUNCE for suppression reasons
        })
      });
    } catch (sesErr) {
      console.warn("Failed to update SES suppression list:", sesErr);
    }

    // Return a nice HTML page
    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Descadastro Realizado</title>
          <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f4f4f7; }
              .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
              h1 { color: #1a1f2c; font-size: 1.5rem; margin-bottom: 1rem; }
              p { color: #4a5568; line-height: 1.5; }
              .icon { font-size: 3rem; margin-bottom: 1rem; color: #10b981; }
          </style>
      </head>
      <body>
          <div class="card">
              <div class="icon">✅</div>
              <h1>Descadastro Realizado</h1>
              <p>Você foi removido com sucesso da nossa lista de e-mails. Você não receberá mais comunicações de marketing deste remetente.</p>
          </div>
      </body>
      </html>
    `;

    return new Response(html, {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Unsubscribe error:", error.message);
    return new Response("Ocorreu um erro ao processar seu descadastro.", { status: 500 });
  }
});
