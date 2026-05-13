-- AI Conversations tracking for knowledge extraction
create table if not exists ai_conversation_status (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  phone text not null,
  status text not null default 'active', -- 'active', 'resolved', 'escalated', 'extracted'
  resolved_at timestamptz,
  extracted_at timestamptz,
  last_message_at timestamptz default now(),
  message_count integer default 0,
  ai_message_count integer default 0,
  human_message_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists ai_conv_status_tenant_idx on ai_conversation_status(tenant_id);
create index if not exists ai_conv_status_status_idx on ai_conversation_status(status);
create index if not exists ai_conv_status_customer_idx on ai_conversation_status(customer_id);

-- RLS
alter table ai_conversation_status enable row level security;

create policy "ai_conv_status_tenant_access" on ai_conversation_status
  for all using (tenant_id = (select auth.jwt() ->> 'tenant_id')::uuid);

create policy "ai_conv_status_service_role" on ai_conversation_status
  for all using (auth.role() = 'service_role');
