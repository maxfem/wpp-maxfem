// Quality Rating Monitor — consulta Meta Graph e atualiza saúde da conta WhatsApp
// Auto-pausa campanhas se rating cair para RED.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: accounts, error } = await supabase
      .from("whatsapp_accounts")
      .select("id, tenant_id, phone_number_id, access_token, quality_rating, quality_history")
      .eq("is_active", true);
    if (error) throw error;

    const results: any[] = [];
    for (const acc of accounts || []) {
      try {
        const url = `https://graph.facebook.com/v22.0/${acc.phone_number_id}?fields=quality_rating,messaging_limit_tier,name_status,verified_name,display_phone_number`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${acc.access_token}` } });
        const json = await res.json();
        if (!res.ok) {
          console.error(`[quality] Account ${acc.id}:`, json);
          results.push({ account_id: acc.id, ok: false, error: json.error?.message });
          continue;
        }

        const newRating = json.quality_rating || "UNKNOWN";
        const previousRating = acc.quality_rating;
        const history = Array.isArray(acc.quality_history) ? acc.quality_history : [];
        history.unshift({
          checked_at: new Date().toISOString(),
          rating: newRating, tier: json.messaging_limit_tier, name_status: json.name_status,
        });
        history.splice(168); // mantém ~7 dias se rodar 1x/h

        await supabase.from("whatsapp_accounts").update({
          quality_rating: newRating,
          messaging_limit_tier: json.messaging_limit_tier || null,
          name_status: json.name_status || null,
          last_quality_check_at: new Date().toISOString(),
          quality_history: history,
        }).eq("id", acc.id);

        // Auto-pause se RED e flag ativa
        if (newRating === "RED" && previousRating !== "RED") {
          const { data: policy } = await supabase.from("messaging_policies")
            .select("auto_pause_on_red").eq("tenant_id", acc.tenant_id).maybeSingle();
          if (policy?.auto_pause_on_red) {
            await supabase.from("messaging_policies").update({
              whatsapp_paused: true,
              pause_reason: `Auto-pausado: quality rating caiu para RED em ${new Date().toISOString()}`,
            }).eq("tenant_id", acc.tenant_id);
            console.warn(`[quality] AUTO-PAUSED tenant ${acc.tenant_id} (RED)`);
          }
        }

        results.push({ account_id: acc.id, rating: newRating, tier: json.messaging_limit_tier });
      } catch (e: any) {
        console.error(`[quality] Account ${acc.id} error:`, e.message);
        results.push({ account_id: acc.id, ok: false, error: e.message });
      }
    }

    return new Response(JSON.stringify({ checked: accounts?.length || 0, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
