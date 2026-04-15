

## Plano: Limpar histórico de automações e resetar cron

### O que será feito

**1. Limpar a fila de automação (SQL via insert tool)**
- Deletar todos os ~2.932 registros antigos da `automation_queue` (failed, sent, skipped, completed)
- Isso remove o lixo acumulado desde 11/04

**2. Atualizar `start_date` das automações ativas para `now()`**
- As duas automações running ("Pix Não Pago" e "Pedido Aprovado") têm `start_date = null`
- Setar `start_date = now()` garante que apenas pedidos **a partir de agora** serão processados
- Isso funciona junto com o fix anterior que usa `start_date || created_at` como cutoff

**3. Atualizar `last_synced_at` da integração Yampi para `now()`**
- Garante que o próximo sync só busque pedidos novos, sem reprocessar histórico

### O que NÃO será tocado
- Os cron jobs existentes continuam rodando normalmente (campaign-executor a cada minuto, yampi-sync a cada 10min, automation-cron diário às 12h UTC)
- Nenhuma mudança de código — apenas limpeza de dados

### Comandos SQL (via insert tool)
```sql
-- 1. Limpar fila antiga
DELETE FROM automation_queue;

-- 2. Setar start_date = now() nas automações ativas
UPDATE campaigns 
SET start_date = now(), updated_at = now() 
WHERE kind = 'automation' AND status = 'running';

-- 3. Resetar last_synced_at da Yampi para agora
UPDATE integrations 
SET last_synced_at = now(), sync_status = 'pending'
WHERE provider = 'yampi' AND is_active = true;
```

### Resultado
- Fila zerada e limpa
- Próximos pedidos reais serão os primeiros a entrar na fila
- Crons continuam rodando sem interrupção

