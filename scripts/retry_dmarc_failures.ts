import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-email-ses`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function retryFailedEmails() {
  console.log("Iniciando reenvio de e-mails que falharam por autenticação (DMARC)...");

  // 1. Buscar os logs de e-mail que falharam por DMARC
  const { data: failedLogs, error } = await supabase
    .from("email_logs")
    .select("*")
    .eq("status", "bounced")
    .ilike("error_message", "%doesn't meet the required authentication level%")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar logs falhos:", error);
    return;
  }

  if (!failedLogs || failedLogs.length === 0) {
    console.log("Nenhum e-mail falho por DMARC encontrado.");
    return;
  }

  console.log(`Encontrados ${failedLogs.length} e-mails para reenvio.`);

  for (const log of failedLogs) {
    console.log(`Reenviando para: ${log.to_email} (ID Original: ${log.id})`);

    try {
      const payload = {
        to: log.to_email,
        subject: log.subject,
        html: log.body_html,
        fromEmail: log.from_email,
        tenantId: log.tenant_id,
        campaignId: log.campaign_id,
        customerId: log.customer_id,
        configurationSet: log.configuration_set,
        mode: "send"
      };

      const response = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log(`✅ Sucesso para ${log.to_email}. Novo MessageId: ${result.messageId}`);
        
        // Marcar o log antigo como 'retried' para não processar de novo se rodar o script novamente
        // E para limpar a lista de erros visualmente (embora o status original de bounce permaneça, 
        // podemos adicionar uma flag ou mudar o status se o cliente preferir).
        // Aqui vamos apenas atualizar o status para 'retried_success'
        await supabase
          .from("email_logs")
          .update({ 
            status: 'retried_success',
            metadata: { ...log.metadata, retry_original_id: log.id, retried_at: new Date().toISOString() }
          })
          .eq("id", log.id);

      } else {
        console.error(`❌ Falha no reenvio para ${log.to_email}:`, result.error || response.statusText);
      }
    } catch (e) {
      console.error(`💥 Erro catastrófico ao reenviar para ${log.to_email}:`, e);
    }
    
    // Pequeno delay para não sobrecarregar
    await new Promise(r => setTimeout(r, 200));
  }

  console.log("Processo de reenvio concluído.");
}

retryFailedEmails();
