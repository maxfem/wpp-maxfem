-- HOTFIX 2: dispatch_automation_trigger filtrava `status = 'active'` mas
-- as automations usam `status = 'running'` (toggle "Ativa" no UI).
-- Aceita ambos pra ser robusto.

create or replace function dispatch_automation_trigger(
  p_tenant_id uuid,
  p_trigger_type text,
  p_customer_id uuid,
  p_trigger_data jsonb default '{}'::jsonb
) returns int language plpgsql security definer as $$
declare
  v_count int := 0;
  v_camp record;
begin
  for v_camp in
    select id, tenant_id
    from campaigns
    where tenant_id = p_tenant_id
      and kind = 'automation'
      and status in ('active', 'running')
      and trigger_type = p_trigger_type
  loop
    begin
      insert into automation_queue (
        tenant_id, campaign_id, customer_id, trigger_type, trigger_data, status, current_node_id
      ) values (
        v_camp.tenant_id, v_camp.id, p_customer_id, p_trigger_type, p_trigger_data, 'pending', 'start'
      ) on conflict do nothing;
      v_count := v_count + 1;
    exception when others then
      raise warning 'dispatch_automation_trigger insert failed for campaign=% : %', v_camp.id, sqlerrm;
    end;
  end loop;
  return v_count;
end;
$$;

-- Normaliza trigger_type das 3 automations Maxfem que estavam em texto livre
update campaigns set trigger_type = 'cart_abandoned'
  where name = 'Carrinho Abandonado' and trigger_type ilike '%Carrinho abandonado%';
update campaigns set trigger_type = 'order_created_pix'
  where name = 'Pix Não Pago' and trigger_type ilike '%Pix pendente%';
update campaigns set trigger_type = 'order_paid'
  where name = 'Pedido Aprovado' and trigger_type ilike '%Pagamento confirmado%';
