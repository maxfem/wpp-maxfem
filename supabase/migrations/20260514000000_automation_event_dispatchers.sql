-- Ativa os 6 triggers que estavam "em breve" criando:
-- 1. Helper genérico dispatch_automation_trigger(tenant, type, customer, data)
-- 2. DB triggers em customers + whatsapp_messages + contact_list_members
-- 3. Tabela automation_webhooks pra endpoint público customizado

-- ===== 1. HELPER GENÉRICO =====
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
  -- Pra cada automation ativa com esse trigger_type, enfileira uma execução
  for v_camp in
    select id, tenant_id
    from campaigns
    where tenant_id = p_tenant_id
      and is_automation = true
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

-- ===== 2. DB TRIGGERS =====

-- 2a. lead_created — quando um cliente é adicionado a uma contact_list
create or replace function trg_lead_created_on_list_member()
returns trigger language plpgsql security definer as $$
declare
  v_tenant uuid;
  v_list_name text;
begin
  select tenant_id, name into v_tenant, v_list_name
  from contact_lists where id = new.list_id;
  if v_tenant is null then return new; end if;

  perform dispatch_automation_trigger(
    v_tenant, 'lead_created', new.customer_id,
    jsonb_build_object('list_id', new.list_id, 'list_name', v_list_name, 'added_at', new.created_at)
  );
  return new;
end;
$$;

do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'contact_list_members') then
    drop trigger if exists trg_lead_created_dispatch on contact_list_members;
    create trigger trg_lead_created_dispatch
      after insert on contact_list_members
      for each row execute function trg_lead_created_on_list_member();
  end if;
end $$;

-- 2b. conversation_created — quando um cliente NOVO manda primeira mensagem WhatsApp
-- Detectado por: customers.is_lead=true criado via origem whatsapp (custom_attributes.source='whatsapp_inbound')
-- OU: primeiro INSERT em whatsapp_messages com direction=inbound pra esse customer
create or replace function trg_conversation_created_on_first_msg()
returns trigger language plpgsql security definer as $$
declare
  v_count int;
begin
  if new.direction <> 'inbound' then return new; end if;
  -- Verifica se é a PRIMEIRA mensagem inbound do customer
  select count(*) into v_count from whatsapp_messages
    where customer_id = new.customer_id and direction = 'inbound' and id <> new.id;
  if v_count > 0 then return new; end if;
  if new.customer_id is null then return new; end if;

  perform dispatch_automation_trigger(
    new.tenant_id, 'conversation_created', new.customer_id,
    jsonb_build_object('first_message', left(coalesce(new.content, ''), 200), 'phone', new.phone)
  );
  return new;
end;
$$;

drop trigger if exists trg_conversation_created_dispatch on whatsapp_messages;
create trigger trg_conversation_created_dispatch
  after insert on whatsapp_messages
  for each row execute function trg_conversation_created_on_first_msg();

-- 2c. conversation_archived — quando ticket_status muda pra resolved
create or replace function trg_conversation_archived_on_resolve()
returns trigger language plpgsql security definer as $$
begin
  if new.ticket_status is null or new.ticket_status <> 'resolved' then return new; end if;
  if old.ticket_status = new.ticket_status then return new; end if;
  if new.customer_id is null then return new; end if;

  perform dispatch_automation_trigger(
    new.tenant_id, 'conversation_archived', new.customer_id,
    jsonb_build_object('phone', new.phone, 'resolved_at', now())
  );
  return new;
end;
$$;

drop trigger if exists trg_conversation_archived_dispatch on whatsapp_messages;
create trigger trg_conversation_archived_dispatch
  after update of ticket_status on whatsapp_messages
  for each row execute function trg_conversation_archived_on_resolve();

-- 2d. tracking_created / tracking_updated — só fazem sentido se houver tabela bling_pedidos local com tracking_code
-- Como este projeto (CRM Maxfem) não importa pedidos diretamente — eles vivem no dashboard-vendas Supabase —
-- o disparo desses 2 triggers vai vir de fora: edge function bling-tracking-sync ou cron de diff.
-- Por enquanto, criamos uma stored function PÚBLICA que pode ser chamada via RPC pelo serviço externo
-- (dashboard-vendas faz POST /rest/v1/rpc/notify_tracking_event):
create or replace function notify_tracking_event(
  p_tenant_id uuid,
  p_event text,            -- 'tracking_created' | 'tracking_updated'
  p_customer_id uuid,
  p_order_id text,
  p_tracking_code text,
  p_tracking_status text default null,
  p_extra jsonb default '{}'::jsonb
) returns int language plpgsql security definer as $$
begin
  if p_event not in ('tracking_created', 'tracking_updated') then
    raise exception 'event must be tracking_created or tracking_updated';
  end if;
  return dispatch_automation_trigger(
    p_tenant_id, p_event, p_customer_id,
    jsonb_build_object(
      'order_id', p_order_id,
      'tracking_code', p_tracking_code,
      'tracking_status', p_tracking_status
    ) || p_extra
  );
end;
$$;

-- ===== 3. WEBHOOK CUSTOMIZADO =====
create table if not exists automation_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  endpoint_key text not null unique default ('wh_' || replace(gen_random_uuid()::text, '-', '')),
  is_active boolean default true,
  hits int default 0,
  last_fired_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_automation_webhooks_key on automation_webhooks(endpoint_key);
create index if not exists idx_automation_webhooks_campaign on automation_webhooks(campaign_id);

alter table automation_webhooks enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'automation_webhooks_tenant_access' and tablename = 'automation_webhooks') then
    create policy automation_webhooks_tenant_access on automation_webhooks
      for all using (tenant_id = (select auth.jwt() ->> 'tenant_id')::uuid);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'automation_webhooks_service' and tablename = 'automation_webhooks') then
    create policy automation_webhooks_service on automation_webhooks
      for all using (auth.role() = 'service_role');
  end if;
end $$;

-- Auto-cria registro de webhook quando uma campaign com trigger_type='webhook' é criada
create or replace function trg_auto_create_webhook()
returns trigger language plpgsql security definer as $$
begin
  if new.is_automation = true and new.trigger_type = 'webhook' then
    insert into automation_webhooks (tenant_id, campaign_id)
    values (new.tenant_id, new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_create_webhook_dispatch on campaigns;
create trigger trg_auto_create_webhook_dispatch
  after insert or update of trigger_type on campaigns
  for each row execute function trg_auto_create_webhook();

-- ===== 4. TRACKING STATE (snapshot p/ diff do cron tracking-events-sync) =====
create table if not exists tracking_state (
  tenant_id uuid not null,
  order_id text not null,
  customer_id uuid,
  tracking_code text,
  tracking_status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (tenant_id, order_id)
);
create index if not exists idx_tracking_state_customer on tracking_state(customer_id);

-- ===== 5. CRON tracking-events-sync (a cada 15min) =====
do $$
declare j record;
begin
  for j in select jobid, jobname from cron.job where jobname = 'tracking-events-sync' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'tracking-events-sync',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := 'https://lfpwubqmpztxhrmxadcl.supabase.co/functions/v1/tracking-events-sync',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb
    ) as request_id;
  $cron$
);
