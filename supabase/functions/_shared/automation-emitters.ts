/**
 * Automation Event Emitters
 *
 * Sistema centralizado para emitir eventos que disparam automações.
 * Insere registros na automation_queue para processamento posterior.
 */

import { SupabaseClient } from "npm:@supabase/supabase-js";

interface EmitEventOptions {
  supabase: SupabaseClient;
  tenantId: string;
  triggerType: string;
  customerId?: string;
  triggerData?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Emite um evento de automação genérico
 */
export async function emitAutomationEvent(options: EmitEventOptions): Promise<void> {
  const { supabase, tenantId, triggerType, customerId, triggerData = {}, metadata = {} } = options;

  try {
    // Busca automações ativas para este trigger
    const { data: automations } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("kind", "automation")
      .eq("status", "running")
      .eq("trigger_type", triggerType);

    if (!automations || automations.length === 0) {
      console.log(`[automation-emitter] No active automations for trigger=${triggerType}, tenant=${tenantId}`);
      return;
    }

    // Insere na fila para cada automação ativa
    for (const automation of automations) {
      const queueEntry = {
        tenant_id: tenantId,
        campaign_id: automation.id,
        customer_id: customerId || null,
        trigger_type: triggerType,
        trigger_data: triggerData,
        status: "pending",
        current_node_id: "start",
        metadata,
      };

      // Index automation_queue_no_dup_active impede duplicata enquanto a
      // entrada anterior estiver em 'pending'/'running' (mig 20260606220000).
      // Mesmo assim mantemos esse try/catch + log distinto pra observabilidade.
      const { error } = await supabase
        .from("automation_queue")
        .upsert(queueEntry, { onConflict: "campaign_id,customer_id,trigger_type", ignoreDuplicates: true });

      if (error && !error.message?.includes("duplicate")) {
        console.error(`[automation-emitter] Error queueing automation ${automation.id}:`, error.message);
      } else if (!error) {
        console.log(`[automation-emitter] Queued automation ${automation.id} (${automation.name}) for trigger=${triggerType}`);
      }
    }
  } catch (err) {
    console.error(`[automation-emitter] Error in emitAutomationEvent:`, err);
  }
}

/**
 * Emite evento quando código de rastreio é gerado
 */
export async function emitTrackingCreated(
  supabase: SupabaseClient,
  tenantId: string,
  customerId: string,
  orderId: string,
  trackingCode: string,
  carrier?: string
): Promise<void> {
  await emitAutomationEvent({
    supabase,
    tenantId,
    triggerType: "tracking_created",
    customerId,
    triggerData: {
      order_id: orderId,
      tracking_code: trackingCode,
      carrier: carrier || null,
      created_at: new Date().toISOString(),
    },
  });
}

/**
 * Emite evento quando status de rastreio é atualizado
 */
export async function emitTrackingUpdated(
  supabase: SupabaseClient,
  tenantId: string,
  customerId: string,
  orderId: string,
  trackingCode: string,
  status: string,
  statusDetails?: string
): Promise<void> {
  await emitAutomationEvent({
    supabase,
    tenantId,
    triggerType: "tracking_updated",
    customerId,
    triggerData: {
      order_id: orderId,
      tracking_code: trackingCode,
      status,
      status_details: statusDetails || null,
      updated_at: new Date().toISOString(),
    },
  });
}

/**
 * Emite evento quando lead é inserido em uma lista
 */
export async function emitLeadCreated(
  supabase: SupabaseClient,
  tenantId: string,
  customerId: string,
  listId: string,
  listName?: string,
  source?: string
): Promise<void> {
  await emitAutomationEvent({
    supabase,
    tenantId,
    triggerType: "lead_created",
    customerId,
    triggerData: {
      list_id: listId,
      list_name: listName || null,
      source: source || "manual",
      created_at: new Date().toISOString(),
    },
  });
}

/**
 * Emite evento quando nova conversa WhatsApp é iniciada
 */
export async function emitConversationCreated(
  supabase: SupabaseClient,
  tenantId: string,
  customerId: string,
  phone: string,
  firstMessageId?: string
): Promise<void> {
  await emitAutomationEvent({
    supabase,
    tenantId,
    triggerType: "conversation_created",
    customerId,
    triggerData: {
      phone,
      first_message_id: firstMessageId || null,
      created_at: new Date().toISOString(),
    },
  });
}

/**
 * Emite evento quando conversa WhatsApp é arquivada
 */
export async function emitConversationArchived(
  supabase: SupabaseClient,
  tenantId: string,
  customerId: string,
  phone: string,
  archivedReason?: string
): Promise<void> {
  await emitAutomationEvent({
    supabase,
    tenantId,
    triggerType: "conversation_archived",
    customerId,
    triggerData: {
      phone,
      archived_reason: archivedReason || null,
      archived_at: new Date().toISOString(),
    },
  });
}

/**
 * Processa webhook customizado
 */
export async function emitWebhookEvent(
  supabase: SupabaseClient,
  tenantId: string,
  webhookId: string,
  payload: Record<string, any>,
  customerId?: string
): Promise<void> {
  await emitAutomationEvent({
    supabase,
    tenantId,
    triggerType: "webhook",
    customerId,
    triggerData: {
      webhook_id: webhookId,
      payload,
      received_at: new Date().toISOString(),
    },
  });
}
