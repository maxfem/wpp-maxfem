#!/usr/bin/env node
/**
 * Cron diário: extrai conhecimento de conversas resolvidas
 *
 * Roda todos os dias às 03:00 BRT
 * Invoca ai-knowledge-extract edge function para cada tenant
 *
 * Guardian: CRON_ID=ai-knowledge-extract-daily
 */

const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.CRM_SUPABASE_URL || "https://lfpwubqmpztxhrmxadcl.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.CRM_SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("[ai-knowledge-extract-daily] ERRO: CRM_SUPABASE_SERVICE_KEY não configurado");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const now = new Date().toISOString();
  console.log(`[ai-knowledge-extract-daily] ${now} Iniciando extração de conhecimento...`);

  try {
    // 1. Buscar todos os tenants ativos
    const { data: tenants, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name")
      .eq("is_active", true);

    if (tenantError) {
      throw new Error(`Erro ao buscar tenants: ${tenantError.message}`);
    }

    if (!tenants || tenants.length === 0) {
      console.log("[ai-knowledge-extract-daily] Nenhum tenant ativo encontrado");
      return;
    }

    console.log(`[ai-knowledge-extract-daily] ${tenants.length} tenant(s) ativo(s) encontrado(s)`);

    // 2. Invocar edge function para cada tenant
    let totalExtracted = 0;
    let totalErrors = 0;

    for (const tenant of tenants) {
      console.log(`[ai-knowledge-extract-daily] Processando ${tenant.name} (${tenant.id})...`);

      try {
        const { data, error } = await supabase.functions.invoke("ai-knowledge-extract", {
          body: { tenantId: tenant.id },
        });

        if (error) {
          console.error(`[ai-knowledge-extract-daily] Erro em ${tenant.name}:`, error);
          totalErrors++;
          continue;
        }

        const extracted = data?.extracted || 0;
        const skipped = data?.skipped || 0;
        totalExtracted += extracted;

        console.log(
          `[ai-knowledge-extract-daily] ${tenant.name}: ${extracted} novos, ${skipped} já existentes`
        );
      } catch (err) {
        console.error(`[ai-knowledge-extract-daily] Exceção em ${tenant.name}:`, err);
        totalErrors++;
      }
    }

    console.log(
      `[ai-knowledge-extract-daily] ✅ Finalizado · ${totalExtracted} conhecimentos extraídos · ${totalErrors} erros`
    );
  } catch (err) {
    console.error("[ai-knowledge-extract-daily] ERRO FATAL:", err);
    process.exit(1);
  }
}

main();
