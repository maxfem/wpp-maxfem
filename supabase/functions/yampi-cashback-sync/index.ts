// yampi-cashback-sync: puxa regras de cashback do Yampi e recalcula saldos.
//
// Por que recalcular no CRM em vez de ler do Yampi:
// A API REST do Yampi (/v2/{alias}/pricing/cashbacks) expõe as REGRAS de
// cashback (% sobre faixa de valor, validade em dias), mas NÃO o saldo
// acumulado por cliente. O saldo é calculado server-side aplicando as
// regras sobre os pedidos pagos.
//
// Modos:
//   POST {} → sync de TODOS os tenants com Yampi conectado
//   POST {"tenant_id":"..."} → sync de UM tenant específico
//
// Fluxo por tenant:
//   1. Lê config Yampi (alias, user_token, user_secret_key)
//   2. GET /v2/{alias}/pricing/cashbacks → upsert em cashback_rules
//   3. Chama RPC recalc_cashback_for_tenant → atualiza customers.cashback_*
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const YAMPI_BASE = "https://api.dooki.com.br/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const tenantFilter = body.tenant_id || null;

    let q = supabase
      .from("integrations")
      .select("tenant_id, config")
      .eq("provider", "yampi")
      .eq("is_active", true);
    if (tenantFilter) q = q.eq("tenant_id", tenantFilter);

    const { data: integrations, error } = await q;
    if (error) throw error;

    const results: any[] = [];
    for (const integ of integrations || []) {
      const tenantId = integ.tenant_id;
      const cfg = integ.config as any;
      const alias = cfg?.alias;
      const userToken = cfg?.user_token;
      const userSecret = cfg?.user_secret_key;
      if (!alias || !userToken || !userSecret) {
        results.push({ tenant_id: tenantId, error: "yampi creds missing" });
        continue;
      }

      // 1. Puxa regras de cashback do Yampi
      let rulesUpserted = 0;
      try {
        const url = `${YAMPI_BASE}/${alias}/pricing/cashbacks?limit=50`;
        const r = await fetch(url, {
          headers: { "User-Token": userToken, "User-Secret-Key": userSecret, Accept: "application/json" },
        });
        if (!r.ok) throw new Error(`yampi GET cashbacks HTTP ${r.status}`);
        const data = await r.json();
        const rules = data?.data || [];

        for (const rule of rules) {
          const startsAt = parseYampiDate(rule.starts_at);
          const expiresAt = parseYampiDate(rule.expires_at);
          const payload = {
            tenant_id: tenantId,
            external_id: String(rule.id),
            name: rule.name || `Regra ${rule.id}`,
            active: !!rule.active,
            percent_amount: Number(rule.percent_amount || 0),
            min_amount: rule.min_amount != null ? Number(rule.min_amount) : null,
            max_amount: rule.max_amount != null ? Number(rule.max_amount) : null,
            valid_for_days: rule.valid_for != null ? Number(rule.valid_for) : null,
            has_expiration: !!rule.has_expiration,
            starts_at: startsAt,
            expires_at: expiresAt,
            raw_payload: rule,
            updated_at: new Date().toISOString(),
          };
          const { error: upErr } = await supabase
            .from("cashback_rules")
            .upsert(payload, { onConflict: "tenant_id,external_id" });
          if (upErr) {
            results.push({ tenant_id: tenantId, rule_error: upErr.message });
          } else {
            rulesUpserted++;
          }
        }
      } catch (err: any) {
        results.push({ tenant_id: tenantId, fetch_error: err.message });
        continue;
      }

      // 2. Recalcula saldos baseado nas regras + orders
      const { data: recalcCount, error: recalcErr } = await supabase.rpc(
        "recalc_cashback_for_tenant",
        { _tenant_id: tenantId },
      );
      if (recalcErr) {
        results.push({ tenant_id: tenantId, rules_upserted: rulesUpserted, recalc_error: recalcErr.message });
      } else {
        results.push({
          tenant_id: tenantId,
          rules_upserted: rulesUpserted,
          customers_updated: Number(recalcCount) || 0,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("yampi-cashback-sync error:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Yampi devolve datas como { date: "2025-01-31 10:10:01.000000", timezone: "America/Sao_Paulo" }
function parseYampiDate(d: any): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  if (typeof d === "object" && d.date) {
    return `${d.date.replace(" ", "T")}-03:00`;
  }
  return null;
}
