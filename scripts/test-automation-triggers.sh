#!/bin/bash
# Script de validação dos 6 triggers de automação
# Testa cada trigger e verifica se eventos foram enfileirados corretamente
# Uso: ./test-automation-triggers.sh <supabase-url> <service-role-key> <tenant-id>

set -e

if [ "$#" -ne 3 ]; then
    echo "Uso: $0 <supabase-url> <service-role-key> <tenant-id>"
    echo "Exemplo: $0 https://abc.supabase.co eyJh... uuid-tenant"
    exit 1
fi

SUPABASE_URL="$1"
SERVICE_ROLE_KEY="$2"
TENANT_ID="$3"

FUNCTIONS_URL="$SUPABASE_URL/functions/v1"
HEADERS="Authorization: Bearer $SERVICE_ROLE_KEY"

echo "🧪 Testando 6 triggers de automação..."
echo "Tenant: $TENANT_ID"
echo ""

# ============================================
# Função helper para query SQL via REST API
# ============================================
function query_automation_queue() {
    local trigger_type="$1"
    curl -s "$SUPABASE_URL/rest/v1/automation_queue?trigger_type=eq.$trigger_type&order=created_at.desc&limit=1" \
        -H "$HEADERS" \
        -H "apikey: $SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json"
}

# ============================================
# TEST 1: conversation_created
# ============================================
echo "📱 [1/6] Testando conversation_created..."
echo "⚠️  Requer mensagem WhatsApp real via webhook Meta"
echo "    Envie mensagem de número novo para o WhatsApp do tenant"
echo "    Pressione ENTER quando mensagem for enviada..."
read

RESULT=$(query_automation_queue "conversation_created")
if echo "$RESULT" | grep -q "conversation_created"; then
    echo "✅ conversation_created: evento encontrado na fila"
else
    echo "❌ conversation_created: FALHOU (nenhum evento na fila)"
fi
echo ""

# ============================================
# TEST 2: conversation_archived
# ============================================
echo "📦 [2/6] Testando conversation_archived..."
# Precisa de customer_id real. Pegamos o primeiro customer do tenant.
CUSTOMER_ID=$(curl -s "$SUPABASE_URL/rest/v1/customers?tenant_id=eq.$TENANT_ID&limit=1" \
    -H "$HEADERS" \
    -H "apikey: $SERVICE_ROLE_KEY" | jq -r '.[0].id')

if [ "$CUSTOMER_ID" == "null" ] || [ -z "$CUSTOMER_ID" ]; then
    echo "❌ conversation_archived: SKIP (nenhum customer no tenant)"
else
    curl -s -X POST "$FUNCTIONS_URL/whatsapp-archive-conversation" \
        -H "$HEADERS" \
        -H "Content-Type: application/json" \
        -d "{\"tenant_id\": \"$TENANT_ID\", \"customer_id\": \"$CUSTOMER_ID\", \"reason\": \"test\"}" > /dev/null

    sleep 2
    RESULT=$(query_automation_queue "conversation_archived")
    if echo "$RESULT" | grep -q "conversation_archived"; then
        echo "✅ conversation_archived: evento encontrado na fila"
    else
        echo "❌ conversation_archived: FALHOU"
    fi
fi
echo ""

# ============================================
# TEST 3: lead_created
# ============================================
echo "📋 [3/6] Testando lead_created..."
# Precisa de list_id real. Pegamos a primeira lista do tenant.
LIST_ID=$(curl -s "$SUPABASE_URL/rest/v1/contact_lists?tenant_id=eq.$TENANT_ID&limit=1" \
    -H "$HEADERS" \
    -H "apikey: $SERVICE_ROLE_KEY" | jq -r '.[0].id')

if [ "$LIST_ID" == "null" ] || [ -z "$LIST_ID" ]; then
    echo "❌ lead_created: SKIP (nenhuma lista no tenant)"
else
    curl -s -X POST "$FUNCTIONS_URL/contact-list-webhook?list_id=$LIST_ID" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"Test Lead $(date +%s)\", \"email\": \"test$(date +%s)@example.com\", \"phone\": \"11999990$(date +%s | tail -c 4)\"}" > /dev/null

    sleep 2
    RESULT=$(query_automation_queue "lead_created")
    if echo "$RESULT" | grep -q "lead_created"; then
        echo "✅ lead_created: evento encontrado na fila"
    else
        echo "❌ lead_created: FALHOU"
    fi
fi
echo ""

# ============================================
# TEST 4: webhook customizado
# ============================================
echo "🔗 [4/6] Testando webhook customizado..."
# Criar config de teste
WEBHOOK_ID="test-webhook-$(date +%s)"
curl -s -X POST "$SUPABASE_URL/rest/v1/webhook_configs" \
    -H "$HEADERS" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{\"tenant_id\": \"$TENANT_ID\", \"webhook_id\": \"$WEBHOOK_ID\", \"name\": \"Test Webhook\", \"is_active\": true}" > /dev/null

sleep 1

# Enviar payload
curl -s -X POST "$FUNCTIONS_URL/custom-webhook?webhook_id=$WEBHOOK_ID" \
    -H "Content-Type: application/json" \
    -d "{\"test\": true, \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > /dev/null

sleep 2
RESULT=$(query_automation_queue "webhook")
if echo "$RESULT" | grep -q "webhook"; then
    echo "✅ webhook: evento encontrado na fila"
else
    echo "❌ webhook: FALHOU"
fi

# Limpar config de teste
curl -s -X DELETE "$SUPABASE_URL/rest/v1/webhook_configs?webhook_id=eq.$WEBHOOK_ID" \
    -H "$HEADERS" \
    -H "apikey: $SERVICE_ROLE_KEY" > /dev/null
echo ""

# ============================================
# TEST 5 & 6: tracking_created / tracking_updated
# ============================================
echo "📦 [5/6] Testando tracking_created..."
echo "📦 [6/6] Testando tracking_updated..."
echo "⚠️  Requer sync manual do Yampi com pedido que receba rastreio"
echo "    1. Crie pedido de teste no Yampi SEM rastreio"
echo "    2. Adicione tracking_code no pedido via Yampi admin"
echo "    3. Rode: curl -X POST $FUNCTIONS_URL/yampi-sync \\"
echo "              -H '$HEADERS' \\"
echo "              -d '{\"phase\": \"refresh_tracking\"}'"
echo ""
echo "    Quando sync rodar, pressione ENTER..."
read

RESULT_CREATED=$(query_automation_queue "tracking_created")
RESULT_UPDATED=$(query_automation_queue "tracking_updated")

if echo "$RESULT_CREATED" | grep -q "tracking_created"; then
    echo "✅ tracking_created: evento encontrado na fila"
else
    echo "❌ tracking_created: FALHOU (pode não ter pedido novo com rastreio)"
fi

if echo "$RESULT_UPDATED" | grep -q "tracking_updated"; then
    echo "✅ tracking_updated: evento encontrado na fila"
else
    echo "⚠️  tracking_updated: não encontrado (normal se código não mudou)"
fi
echo ""

# ============================================
# RESUMO FINAL
# ============================================
echo "════════════════════════════════════════"
echo "📊 RESUMO DOS TESTES"
echo "════════════════════════════════════════"
echo ""
echo "Consultar automation_queue completa:"
echo "  curl '$SUPABASE_URL/rest/v1/automation_queue?order=created_at.desc&limit=10' \\"
echo "    -H '$HEADERS' -H 'apikey: $SERVICE_ROLE_KEY'"
echo ""
echo "Consultar por trigger específico:"
echo "  ?trigger_type=eq.conversation_created"
echo "  ?trigger_type=eq.conversation_archived"
echo "  ?trigger_type=eq.lead_created"
echo "  ?trigger_type=eq.webhook"
echo "  ?trigger_type=eq.tracking_created"
echo "  ?trigger_type=eq.tracking_updated"
echo ""
echo "✅ Teste completo!"
