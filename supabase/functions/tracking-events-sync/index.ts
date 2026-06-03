// tracking-events-sync — Bling-first. Fonte ÚNICA de eventos de RASTREIO.
//
// Regra Maxfem: triggers de rastreio são consultados APENAS no Bling (que é quem
// gera a etiqueta de transportadora). Yampi não tem o `codigoRastreamento` — só
// status do pedido. Carrinho/Pix continuam vindo do yampi-sync (separados).
//
// Fluxo:
//   1. A cada 15min: consulta Bling /Api/v3/pedidos/vendas com filtro de alteração últimas 48h
//   2. Pra cada pedido, busca o detalhe (que traz transporte.volumes[].codigoRastreamento)
//   3. Compara com snapshot em tracking_state:
//        - sem state + tem tracking → dispara tracking_created
//        - state difere (tracking ou status) → dispara tracking_updated
//   4. Resolve customer no CRM por CPF/email/phone (várias variantes). Se não achar, CRIA.
//   5. Loga tudo em ai_call_events (event=tracking_sync) pra observabilidade.

import { createClient } from "npm:@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ===== Bling auth =====

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
      ...cfg,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      access_expires_at: new Date(now.getTime() + (data.expires_in || 21600) * 1000).toISOString(),
      refresh_expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    await supabase.from("integrations").update({ config: newConfig, sync_error: null, updated_at: now.toISOString() }).eq("id", integrationId);
    return data.access_token;
  } catch {
    return null;
  }
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

async function blingFetch(path: string, token: string, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`https://api.bling.com.br/Api/v3${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 300);
      throw new Error(`bling ${res.status}: ${errText}`);
    }
    return res.json();
  }
}

// ===== Customer resolution =====

function phoneVariants(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const clean = String(raw).replace(/\D/g, "");
  if (!clean) return [];
  const v = new Set<string>();
  v.add(clean);
  v.add(`+${clean}`);
  // Remove DDI 55 se existir
  if (clean.startsWith("55") && clean.length >= 12) {
    v.add(clean.slice(2));
    v.add(`+${clean.slice(2)}`);
  } else if (clean.length >= 10) {
    v.add(`55${clean}`);
    v.add(`+55${clean}`);
  }
  // Tenta sem 9 inicial (celular antigo)
  if (clean.length === 11 && clean[2] === "9") {
    v.add(clean.slice(0, 2) + clean.slice(3));
  }
  // Tenta com 9 inicial (celular sem)
  if (clean.length === 10 && clean[2] !== "9") {
    v.add(clean.slice(0, 2) + "9" + clean.slice(2));
  }
  return Array.from(v);
}

async function resolveOrCreateCustomer(
  tenantId: string,
  args: { cpf?: string; email?: string; phone?: string; name?: string },
): Promise<{ id: string; created: boolean } | null> {
  const cpf = (args.cpf || "").replace(/\D/g, "");
  const email = (args.email || "").trim().toLowerCase();
  const phones = phoneVariants(args.phone);

  // Helper: enriquece customer existente com phone/email/cpf do Bling se estiverem faltando.
  // Sem isso, customers Yampi/Bling que casaram por CPF mas estavam sem phone ficam
  // intocados e o executor falha no sendWhatsApp (customer.phone=null).
  async function enrichExisting(customerId: string) {
    const { data: cur } = await supabase
      .from("customers").select("phone, email, document, name").eq("id", customerId).maybeSingle();
    if (!cur) return;
    const patch: Record<string, string> = {};
    if (!cur.phone && phones.length > 0) patch.phone = phones[0];
    if (!cur.email && email) patch.email = email;
    if (!cur.document && cpf && cpf.length === 11) patch.document = cpf;
    if (!cur.name && args.name) patch.name = args.name;
    if (Object.keys(patch).length > 0) {
      await supabase.from("customers").update(patch).eq("id", customerId);
    }
  }

  // 1. CPF (mais único)
  if (cpf && cpf.length === 11) {
    const { data } = await supabase
      .from("customers").select("id").eq("tenant_id", tenantId).eq("document", cpf).limit(1).maybeSingle();
    if (data?.id) { await enrichExisting(data.id); return { id: data.id, created: false }; }
  }

  // 2. Email
  if (email) {
    const { data } = await supabase
      .from("customers").select("id").eq("tenant_id", tenantId).eq("email", email).limit(1).maybeSingle();
    if (data?.id) { await enrichExisting(data.id); return { id: data.id, created: false }; }
  }

  // 3. Phone variants
  if (phones.length > 0) {
    const filter = phones.map((p) => `phone.eq.${p}`).join(",");
    const { data } = await supabase
      .from("customers").select("id").eq("tenant_id", tenantId).or(filter).limit(1).maybeSingle();
    if (data?.id) { await enrichExisting(data.id); return { id: data.id, created: false }; }
  }

  // 4. Fallback: cria customer mínimo se houver pelo menos email ou phone
  if (!email && phones.length === 0 && !cpf) return null;
  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      tenant_id: tenantId,
      name: args.name || email || (phones[0] || cpf || "Cliente"),
      email: email || null,
      phone: phones[0] || null,
      document: cpf && cpf.length === 11 ? cpf : null,
      is_lead: true,
      custom_attributes: { source: "tracking-events-sync" },
    })
    .select("id").single();
  if (error || !created) {
    console.error("[tracking-sync] customer create error:", error);
    return null;
  }
  return { id: created.id, created: true };
}

// ===== Logging =====

async function logEvent(tenantId: string, event: string, metadata: Record<string, any>) {
  try {
    await supabase.from("ai_call_events").insert({
      tenant_id: tenantId,
      event,
      metadata,
    });
  } catch (e) {
    console.error("[tracking-sync] logEvent error:", e);
  }
}

// ===== Bling sync =====

function blingDate(d: Date): string {
  // Bling espera "YYYY-MM-DD HH:mm:ss"
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

interface SyncResult {
  checked: number;
  created: number;
  updated: number;
  errors: number;
  unresolved: number;
}

async function syncForTenant(tenantId: string, lookbackHours = 24, maxOrders = 80): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, created: 0, updated: 0, errors: 0, unresolved: 0 };

  const auth = await getBlingToken(tenantId);
  if (!auth?.token) {
    await logEvent(tenantId, "tracking_sync_skipped", { reason: "no_bling_token" });
    return result;
  }

  // Filtro Maxfem: tracking só é enviado pra pedidos cuja origem no Bling é a loja Yampi.
  // Pedidos vindos de marketplaces (TikTok Shop, Mercado Livre, Amazon, Shopee) ficam de fora
  // porque (1) o cliente já recebe rastreio do próprio marketplace e (2) o Bling não tem email/phone deles.
  const yampiLojaId = Number(auth.cfg?.yampi_loja_id || 0);

  const since = new Date(Date.now() - lookbackHours * 3600 * 1000);
  const dataInicial = blingDate(since);

  // Pagina pedidos alterados nas últimas N horas (limite total de maxOrders)
  let page = 1;
  const listed: { id: number; numeroLoja?: string; numero?: number }[] = [];
  while (page <= 5 && listed.length < maxOrders) {
    const path = `/pedidos/vendas?dataAlteracaoInicial=${encodeURIComponent(dataInicial)}&pagina=${page}&limite=100`;
    let resp: any;
    try {
      resp = await blingFetch(path, auth.token);
    } catch (e: any) {
      // Tenta refresh token e retry
      const newToken = await refreshBlingToken(auth.id, auth.cfg);
      if (newToken) {
        auth.token = newToken;
        try { resp = await blingFetch(path, auth.token); }
        catch (e2: any) {
          await logEvent(tenantId, "tracking_sync_error", { stage: "list", page, error: String(e2?.message || e2).slice(0, 300) });
          result.errors++;
          break;
        }
      } else {
        await logEvent(tenantId, "tracking_sync_error", { stage: "list", page, error: String(e?.message || e).slice(0, 300) });
        result.errors++;
        break;
      }
    }
    const list = resp?.data || [];
    if (list.length === 0) break;
    for (const item of list) {
      listed.push({ id: item.id, numeroLoja: item.numeroLoja, numero: item.numero });
      if (listed.length >= maxOrders) break;
    }
    if (list.length < 100) break;
    page++;
  }

  // Pra cada pedido, busca detalhe e processa tracking. Throttle: 220ms entre chamadas (~4.5 req/s),
  // dentro do limite do Bling (5 req/s).
  for (const item of listed) {
    try {
      await new Promise((r) => setTimeout(r, 220));
      const detail = await blingFetch(`/pedidos/vendas/${item.id}`, auth.token);
      const d = detail?.data;
      if (!d) continue;

      const volumes = d.transporte?.volumes || [];
      const trackingCode: string | null = volumes[0]?.codigoRastreamento || null;
      const trackingUrl: string | null = volumes[0]?.urlRastreamento || null;
      const carrier: string | null = d.transporte?.contato?.nome || null;
      const situacaoValor: string | null = d.situacao?.valor != null ? String(d.situacao.valor) : null;

      if (!trackingCode) continue;

      // Filtra: só pedidos da loja Yampi (quando configurado)
      const orderLojaId = Number(d.loja?.id || 0);
      if (yampiLojaId && orderLojaId !== yampiLojaId) {
        await logEvent(tenantId, "tracking_skipped_non_yampi_store", {
          order_id: String(d.id), loja_id: orderLojaId, numero_loja: d.numeroLoja,
        });
        continue;
      }

      // Se o pedido já tem NF emitida, busca o detalhe pra pegar linkDanfe/linkPDF.
      // Esses links são públicos (com accessKey embutida) e podem ir direto pro cliente.
      let linkNf: string | null = null;
      let linkNfPdf: string | null = null;
      let nfNumero: string | null = null;
      let nfChaveAcesso: string | null = null;
      const nfId = d.notaFiscal?.id;
      if (nfId) {
        try {
          await new Promise((r) => setTimeout(r, 220));
          const nfDetail = await blingFetch(`/nfe/${nfId}`, auth.token);
          const nfd = nfDetail?.data || {};
          linkNf = nfd.linkDanfe || null;
          linkNfPdf = nfd.linkPDF || null;
          nfNumero = nfd.numero ? String(nfd.numero) : null;
          nfChaveAcesso = nfd.chaveAcesso || null;
        } catch (e: any) {
          await logEvent(tenantId, "tracking_sync_nf_fetch_error", {
            order_id: String(d.id), nf_id: nfId, error: String(e?.message || e).slice(0, 200),
          });
        }
      }

      const orderId = String(d.id);
      const contato = d.contato || {};
      const cpfRaw = String(contato.numeroDocumento || "").replace(/\D/g, "");
      let email = (contato.email || "").trim().toLowerCase() || undefined;
      let phone = String(contato.telefone || contato.celular || "").trim() || undefined;
      const name = (contato.nome || "").trim() || undefined;

      // Bling /pedidos/vendas/{id} NÃO retorna email/telefone do contato — só id+nome+CPF.
      // Pra ter telefone/email (essencial pra WhatsApp/Email), buscamos /contatos/{id}.
      if (contato.id && (!email || !phone)) {
        try {
          await new Promise((r) => setTimeout(r, 220));
          const cDetail = await blingFetch(`/contatos/${contato.id}`, auth.token);
          const cd = cDetail?.data || {};
          if (!email && cd.email) email = String(cd.email).trim().toLowerCase();
          if (!phone) {
            const cdPhone = cd.celular || cd.telefone || cd.fone || "";
            if (cdPhone) phone = String(cdPhone).trim();
          }
        } catch (e: any) {
          await logEvent(tenantId, "tracking_sync_contact_fetch_error", { contact_id: contato.id, error: String(e?.message || e).slice(0, 200) });
        }
      }

      const customer = await resolveOrCreateCustomer(tenantId, {
        cpf: cpfRaw,
        email,
        phone,
        name,
      });
      if (!customer) {
        result.unresolved++;
        await logEvent(tenantId, "tracking_sync_unresolved", { order_id: orderId, cpf: cpfRaw, email, phone, name });
        continue;
      }

      const { data: state } = await supabase
        .from("tracking_state").select("*")
        .eq("tenant_id", tenantId).eq("order_id", orderId).maybeSingle();

      result.checked++;

      const triggerData = {
        order_id: orderId,
        order_number: d.numero ?? item.numero,
        numero_loja: d.numeroLoja ?? item.numeroLoja,
        tracking_code: trackingCode,
        tracking_url: trackingUrl,
        tracking_status: situacaoValor,
        carrier,
        source: "bling",
        // Nota Fiscal (quando emitida) — links públicos do Bling
        link_nf: linkNf,
        link_nf_pdf: linkNfPdf,
        nf_numero: nfNumero,
        nf_chave_acesso: nfChaveAcesso,
      };

      if (!state) {
        await supabase.rpc("dispatch_automation_trigger", {
          p_tenant_id: tenantId,
          p_trigger_type: "tracking_created",
          p_customer_id: customer.id,
          p_trigger_data: triggerData,
        });
        await supabase.from("tracking_state").insert({
          tenant_id: tenantId, order_id: orderId, customer_id: customer.id,
          tracking_code: trackingCode, tracking_status: situacaoValor,
        });
        await logEvent(tenantId, "tracking_created_dispatched", { ...triggerData, customer_id: customer.id, customer_created: customer.created });
        result.created++;
      } else if (state.tracking_code !== trackingCode || state.tracking_status !== situacaoValor) {
        await supabase.rpc("dispatch_automation_trigger", {
          p_tenant_id: tenantId,
          p_trigger_type: "tracking_updated",
          p_customer_id: customer.id,
          p_trigger_data: { ...triggerData, previous_tracking_code: state.tracking_code, previous_status: state.tracking_status },
        });
        await supabase.from("tracking_state").update({
          tracking_code: trackingCode, tracking_status: situacaoValor, updated_at: new Date().toISOString(),
        }).eq("tenant_id", tenantId).eq("order_id", orderId);
        await logEvent(tenantId, "tracking_updated_dispatched", { ...triggerData, customer_id: customer.id });
        result.updated++;
      }
    } catch (e: any) {
      result.errors++;
      await logEvent(tenantId, "tracking_sync_error", { stage: "detail", order_id: item.id, error: String(e?.message || e).slice(0, 300) });
    }
  }

  await logEvent(tenantId, "tracking_sync_completed", { ...result, listed: listed.length, lookback_hours: lookbackHours });
  return result;
}

// ===== HTTP entrypoint =====

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let lookbackHours = 48;
    let tenantFilter: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.lookback_hours) lookbackHours = Number(body.lookback_hours);
        if (body?.tenant_id) tenantFilter = String(body.tenant_id);
      } catch { /* empty */ }
    }

    let tenantsQuery = supabase.from("tenants").select("id");
    if (tenantFilter) tenantsQuery = tenantsQuery.eq("id", tenantFilter);
    const { data: tenants } = await tenantsQuery.limit(50);

    const results: any[] = [];
    for (const t of tenants || []) {
      try {
        const r = await syncForTenant(t.id, lookbackHours);
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
