// enrich-customers-from-bling — Edge function de backfill. Pega customers do tenant
// que estão sem phone OU email mas têm CPF (document), busca no Bling /contatos
// (por numeroDocumento) e completa os dados.
//
// Uso:
//   POST /functions/v1/enrich-customers-from-bling
//   body: { tenant_id?: uuid, limit?: number (default 100), missing?: "phone"|"email"|"any" (default "any") }
//
// Esse cron pode rodar 1× por dia também. Resolve o gap histórico de customers
// criados antes do fix de /contatos/{id}.

import { createClient } from "npm:@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshBlingToken(integrationId: string, cfg: any): Promise<string | null> {
  const clientId = cfg?.client_id || Deno.env.get("BLING_CLIENT_ID");
  const clientSecret = cfg?.client_secret || Deno.env.get("BLING_CLIENT_SECRET");
  if (!clientId || !clientSecret || !cfg?.refresh_token) return null;
  try {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    const res = await fetch("https://api.bling.com.br/Api/v3/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${credentials}` },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refresh_token }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    const now = new Date();
    const newConfig = {
      ...cfg, access_token: data.access_token, refresh_token: data.refresh_token,
      access_expires_at: new Date(now.getTime() + (data.expires_in || 21600) * 1000).toISOString(),
      refresh_expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    await supabase.from("integrations").update({ config: newConfig, sync_error: null, updated_at: now.toISOString() }).eq("id", integrationId);
    return data.access_token;
  } catch { return null; }
}

async function getBlingToken(tenantId: string): Promise<{ id: string; token: string; cfg: any } | null> {
  const { data } = await supabase
    .from("integrations").select("id, config")
    .eq("tenant_id", tenantId).eq("provider", "bling").eq("is_active", true).maybeSingle();
  if (!data) return null;
  const cfg = data.config as any;
  let token = cfg?.access_token;
  if (!token) return null;
  const expiresAt = cfg.access_expires_at ? new Date(cfg.access_expires_at).getTime() : 0;
  if (expiresAt < Date.now() + 5 * 60 * 1000) {
    const newToken = await refreshBlingToken(data.id, cfg);
    if (newToken) token = newToken;
  }
  return { id: data.id, token, cfg };
}

async function blingFetch(path: string, token: string): Promise<any> {
  const res = await fetch(`https://api.bling.com.br/Api/v3${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const errText = (await res.text()).slice(0, 200);
    throw new Error(`bling ${res.status}: ${errText}`);
  }
  return res.json();
}

// ===== Yampi (tem email + phone reais dos customers; Bling fiscal tem só dados frios) =====

interface YampiAuth { base: string; headers: Record<string, string> }
async function getYampiAuth(tenantId: string): Promise<YampiAuth | null> {
  const { data } = await supabase
    .from("integrations").select("config")
    .eq("tenant_id", tenantId).eq("provider", "yampi").eq("is_active", true).maybeSingle();
  const cfg = (data?.config || {}) as any;
  const token = cfg.user_token || cfg.token || Deno.env.get("YAMPI_TOKEN");
  const secret = cfg.user_secret_key || cfg.secret_key || Deno.env.get("YAMPI_SECRET_KEY");
  const alias = cfg.alias || cfg.store_alias || "imunofem-woo";
  if (!token || !secret) return null;
  return {
    base: `https://api.dooki.com.br/v2/${alias}`,
    headers: {
      "User-Token": token,
      "User-Secret-Key": secret,
      "Content-Type": "application/json",
    },
  };
}

async function yampiSearchByCpf(auth: YampiAuth, cpf: string): Promise<{ email?: string; phone?: string; name?: string } | null> {
  try {
    const res = await fetch(`${auth.base}/customers?q=${cpf}&limit=1`, { headers: auth.headers });
    if (!res.ok) return null;
    const json = await res.json();
    const c = (json?.data || [])[0];
    if (!c) return null;
    const phoneFull = c.phone?.full_number || c.phone?.number || "";
    return {
      email: (c.email || "").trim().toLowerCase() || undefined,
      phone: phoneFull ? String(phoneFull).replace(/\D/g, "") : undefined,
      name: c.full_name || (`${c.first_name || ""} ${c.last_name || ""}`).trim() || undefined,
    };
  } catch { return null; }
}

interface EnrichResult {
  scanned: number;
  enriched: number;
  no_match: number;
  errors: number;
}

async function enrichForTenant(tenantId: string, limit: number, missing: "phone" | "email" | "any"): Promise<EnrichResult> {
  const r: EnrichResult = { scanned: 0, enriched: 0, no_match: 0, errors: 0 };

  // Yampi é a fonte primária de email/phone (clientes reais com dados completos)
  // Bling é fallback fiscal (frequentemente sem email/phone)
  const yampi = await getYampiAuth(tenantId);
  const bling = await getBlingToken(tenantId);

  if (!yampi && !bling) return r;

  let query = supabase
    .from("customers")
    .select("id, name, phone, email, document")
    .eq("tenant_id", tenantId)
    .not("document", "is", null)
    .limit(limit);

  if (missing === "phone") query = query.is("phone", null);
  else if (missing === "email") query = query.is("email", null);
  else query = query.or("phone.is.null,email.is.null");

  const { data: customers, error } = await query;
  if (error || !customers) return r;

  for (const c of customers) {
    r.scanned++;
    const cpf = String(c.document || "").replace(/\D/g, "");
    if (cpf.length !== 11) continue;

    const patch: Record<string, string> = {};
    let foundContact = false;

    // 1) PRIMEIRO Yampi (mais dados de contato)
    if (yampi) {
      try {
        await new Promise((res) => setTimeout(res, 200));
        const yc = await yampiSearchByCpf(yampi, cpf);
        if (yc) {
          foundContact = true;
          if (!c.phone && yc.phone) {
            const clean = yc.phone;
            patch.phone = clean.startsWith("55") ? clean : (clean.length >= 10 ? `55${clean}` : clean);
          }
          if (!c.email && yc.email) patch.email = yc.email;
          if (!c.name && yc.name) patch.name = yc.name;
        }
      } catch { /* try bling */ }
    }

    // 2) Fallback Bling se Yampi não tinha tudo
    const stillNeeds = (missing === "phone" ? !patch.phone && !c.phone
                      : missing === "email" ? !patch.email && !c.email
                      : (!patch.phone && !c.phone) || (!patch.email && !c.email));
    if (bling && stillNeeds) {
      try {
        await new Promise((res) => setTimeout(res, 220));
        const list = await blingFetch(`/contatos?numeroDocumento=${cpf}`, bling.token);
        let blingContacts = list?.data || [];
        if (blingContacts.length === 0) {
          const formatted = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
          await new Promise((res) => setTimeout(res, 220));
          const list2 = await blingFetch(`/contatos?pesquisa=${encodeURIComponent(formatted)}`, bling.token);
          blingContacts = list2?.data || [];
        }
        if (blingContacts.length > 0) {
          foundContact = true;
          await new Promise((res) => setTimeout(res, 220));
          const detail = await blingFetch(`/contatos/${blingContacts[0].id}`, bling.token);
          const cd = detail?.data || {};
          if (!patch.phone && !c.phone) {
            const ph = cd.celular || cd.telefone || cd.fone || "";
            if (ph) {
              const clean = String(ph).replace(/\D/g, "");
              if (clean) patch.phone = clean.startsWith("55") ? clean : (clean.length >= 10 ? `55${clean}` : clean);
            }
          }
          if (!patch.email && !c.email && cd.email) patch.email = String(cd.email).trim().toLowerCase();
          if (!patch.name && !c.name && cd.nome) patch.name = String(cd.nome);
        }
      } catch { r.errors++; continue; }
    }

    if (Object.keys(patch).length > 0) {
      await supabase.from("customers").update(patch).eq("id", c.id);
      r.enriched++;
    } else if (!foundContact) {
      r.no_match++;
    } else {
      // Contato existe nos provedores mas sem email/phone — conta como no_match também
      r.no_match++;
    }
  }

  return r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let tenantFilter: string | null = null;
    let limit = 100;
    let missing: "phone" | "email" | "any" = "any";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.tenant_id) tenantFilter = String(body.tenant_id);
        if (body?.limit) limit = Math.min(500, Number(body.limit));
        if (body?.missing && ["phone", "email", "any"].includes(body.missing)) missing = body.missing;
      } catch { /* ignore */ }
    }

    let tenantsQuery = supabase.from("tenants").select("id");
    if (tenantFilter) tenantsQuery = tenantsQuery.eq("id", tenantFilter);
    const { data: tenants } = await tenantsQuery.limit(50);

    const results: any[] = [];
    for (const t of tenants || []) {
      try {
        const r = await enrichForTenant(t.id, limit, missing);
        results.push({ tenant_id: t.id, ...r });
      } catch (e: any) {
        results.push({ tenant_id: t.id, error: String(e?.message || e) });
      }
    }
    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
