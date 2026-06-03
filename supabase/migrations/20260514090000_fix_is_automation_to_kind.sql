-- HOTFIX: a migration anterior (20260514000000_automation_event_dispatchers.sql) referenciava
-- campaigns.is_automation, mas o schema usa campaigns.kind = 'automation'. Isso quebrava o
-- INSERT em campaigns (erro: record "new" has no field "is_automation").
-- Recria as funções/triggers usando a coluna correta.

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
      and status = 'active'
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

create or replace function trg_auto_create_webhook()
returns trigger language plpgsql security definer as $$
begin
  if new.kind = 'automation' and new.trigger_type = 'webhook' then
    insert into automation_webhooks (tenant_id, campaign_id)
    values (new.tenant_id, new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
