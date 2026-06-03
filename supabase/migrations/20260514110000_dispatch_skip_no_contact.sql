-- Pula enfileiramento de automation pra customers que não têm phone NEM email.
-- Esses customers vêm geralmente de marketplaces (TikTok/ML/Amazon/Shopee) onde o
-- Bling fiscal só recebe nome+CPF+endereço — sem dados de contato. Enfileirar essas
-- entries só geraria skipped/failed silenciosos e inflaria as métricas.
--
-- A função também loga skip em ai_call_events pra auditoria.

create or replace function dispatch_automation_trigger(
  p_tenant_id uuid,
  p_trigger_type text,
  p_customer_id uuid,
  p_trigger_data jsonb default '{}'::jsonb
) returns int language plpgsql security definer as $$
declare
  v_count int := 0;
  v_camp record;
  v_has_phone boolean;
  v_has_email boolean;
begin
  -- Verifica se o customer tem dados de contato úteis
  select (phone is not null and length(phone) >= 8),
         (email is not null and email like '%@%')
    into v_has_phone, v_has_email
  from customers
  where id = p_customer_id;

  if not coalesce(v_has_phone, false) and not coalesce(v_has_email, false) then
    -- Loga e pula. Continua retornando 0 pra não quebrar caller.
    begin
      insert into ai_call_events (tenant_id, customer_id, event, metadata)
      values (p_tenant_id, p_customer_id, 'dispatch_skipped_no_contact',
              jsonb_build_object('trigger_type', p_trigger_type) || coalesce(p_trigger_data, '{}'::jsonb));
    exception when others then null; end;
    return 0;
  end if;

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
