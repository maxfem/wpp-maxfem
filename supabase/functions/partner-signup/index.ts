// Edge function: partner-signup
// Recebe POST do form público em maxfem.tech/parceiras (Programa Maxfem de Parceria Científica
// para Nutricionistas). Valida, insere em partner_signups e notifica via Telegram.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─────────────────────────────────────────────────────────────
// Validators
// ─────────────────────────────────────────────────────────────

const sanitize = (s: unknown) =>
  typeof s === "string" ? s.trim().slice(0, 500) : "";

function validCpf(raw: string): boolean {
  const cpf = (raw || "").replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (slice: string, factor: number) => {
    let sum = 0;
    for (const c of slice) sum += parseInt(c, 10) * factor--;
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(cpf.slice(0, 9), 10) === +cpf[9] && dv(cpf.slice(0, 10), 11) === +cpf[10];
}

const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const validCrn   = (s: string) => /^CRN-?\d{1,2}\s?\d{2,6}$/i.test((s || "").trim());
const validPhone = (s: string) => (s || "").replace(/\D/g, "").length >= 10;

// ─────────────────────────────────────────────────────────────
// Notificação Telegram (best-effort)
// ─────────────────────────────────────────────────────────────

async function notifyTelegram(text: string): Promise<void> {
  const token  = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error("[partner-signup] telegram fail:", e);
  }
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const tenantSlug      = sanitize(body.tenant)   || "maxfem";
    const program         = sanitize(body.program)  || "parceria_cientifica_nutricionistas";
    const name            = sanitize(body.name);
    const crn             = sanitize(body.crn);
    const cpf             = sanitize(body.cpf);
    const email           = sanitize(body.email).toLowerCase();
    const whatsapp        = sanitize(body.whatsapp);
    const instagram       = sanitize(body.instagram);
    const area            = sanitize(body.area);
    const patientsRange   = sanitize(body.patients);
    const motivation      = sanitize(body.motivation);
    const acceptReg       = body.accept_regulation === true || body.accept_regulation === "on";
    const acceptEthics    = body.accept_ethics     === true || body.accept_ethics     === "on";
    const acceptLgpd      = body.accept_lgpd       === true || body.accept_lgpd       === "on";
    const utmSource       = sanitize(body.utm_source);
    const utmMedium       = sanitize(body.utm_medium);
    const utmCampaign     = sanitize(body.utm_campaign);

    // Validações
    const errors: Record<string, string> = {};
    if (!name || name.length < 3)                     errors.name      = "nome_invalido";
    if (!validCrn(crn))                               errors.crn       = "crn_invalido";
    if (!validCpf(cpf))                               errors.cpf       = "cpf_invalido";
    if (!validEmail(email))                           errors.email     = "email_invalido";
    if (!validPhone(whatsapp))                        errors.whatsapp  = "whatsapp_invalido";
    if (!area)                                        errors.area      = "area_obrigatoria";
    if (!patientsRange)                               errors.patients  = "patients_obrigatorio";
    if (!acceptReg || !acceptEthics || !acceptLgpd)   errors.accept    = "consentimentos_obrigatorios";

    if (Object.keys(errors).length) {
      return new Response(JSON.stringify({ error: "validation_failed", errors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Resolve tenant
    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, name")
      .eq("slug", tenantSlug)
      .maybeSingle();

    if (tErr || !tenant) {
      console.error("[partner-signup] tenant lookup failed:", tErr);
      return new Response(JSON.stringify({ error: "tenant_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Metadados de origem (best-effort)
    const ip        = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    const payload = {
      tenant_id:         tenant.id,
      program,
      name,
      crn: crn.toUpperCase().replace(/\s+/g, " "),
      cpf,
      email,
      whatsapp,
      instagram: instagram || null,
      area,
      patients_range: patientsRange,
      motivation: motivation || null,
      accept_regulation: acceptReg,
      accept_ethics:     acceptEthics,
      accept_lgpd:       acceptLgpd,
      utm_source:   utmSource   || null,
      utm_medium:   utmMedium   || null,
      utm_campaign: utmCampaign || null,
      ip,
      user_agent: userAgent,
    };

    const { data: row, error: insErr } = await supabase
      .from("partner_signups")
      .insert(payload)
      .select("id")
      .single();

    if (insErr) {
      // Conflito de email/CRN já cadastrado (idempotência amistosa)
      if (insErr.code === "23505") {
        return new Response(JSON.stringify({
          ok: true,
          already_registered: true,
          message: "Já existe um cadastro com este e-mail ou CRN — vamos retomar o contato.",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("[partner-signup] insert error:", insErr);
      throw insErr;
    }

    // Notificação Telegram (best-effort, não bloqueia resposta)
    notifyTelegram(
      `<b>📋 Novo cadastro · Parceira Científica</b>\n` +
      `<b>Tenant:</b> ${tenant.name}\n` +
      `<b>Programa:</b> ${program}\n\n` +
      `<b>${name}</b>\n` +
      `<i>${crn}</i> · ${email} · ${whatsapp}\n` +
      `<b>Área:</b> ${area} · <b>Pacientes/mês:</b> ${patientsRange}\n` +
      (instagram ? `<b>IG:</b> ${instagram}\n` : "") +
      (utmSource ? `\n<i>UTM:</i> ${utmSource}/${utmMedium}/${utmCampaign}` : "") +
      `\n\n<i>ID:</i> <code>${row.id}</code>`,
    ).catch(() => {});

    return new Response(JSON.stringify({
      ok: true,
      id: row.id,
      message: "Cadastro recebido. Em até 5 dias úteis enviamos confirmação por e-mail e WhatsApp.",
    }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[partner-signup] fatal:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
