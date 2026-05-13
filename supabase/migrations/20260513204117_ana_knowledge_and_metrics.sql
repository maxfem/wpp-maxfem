-- Extensões necessárias
create extension if not exists vector;
create extension if not exists pg_trgm;

-- Tabela de conhecimento aprendido pela Ana (RAG-lite via similarity search)
create table if not exists ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  question text not null,
  answer text not null,
  category text,
  source text default 'human_resolved', -- human_resolved | manual | imported | doc
  source_message_id uuid references whatsapp_messages(id) on delete set null,
  embedding vector(768), -- gemini text-embedding-004 dimension
  hits int default 0,
  last_used_at timestamptz,
  confidence numeric(3,2) default 0.80,
  created_at timestamptz default now()
);

create index if not exists idx_ai_knowledge_tenant on ai_knowledge(tenant_id);
create index if not exists idx_ai_knowledge_category on ai_knowledge(tenant_id, category);
-- HNSW p/ similarity search
create index if not exists idx_ai_knowledge_embedding on ai_knowledge using hnsw (embedding vector_cosine_ops);

-- Função pra buscar top-k mais similares (RAG)
create or replace function search_ai_knowledge(
  p_tenant_id uuid,
  p_query_embedding vector(768),
  p_match_count int default 3,
  p_min_similarity float default 0.65
) returns table (
  id uuid,
  question text,
  answer text,
  category text,
  similarity float
) language sql stable as $$
  select
    k.id, k.question, k.answer, k.category,
    1 - (k.embedding <=> p_query_embedding) as similarity
  from ai_knowledge k
  where k.tenant_id = p_tenant_id
    and k.embedding is not null
    and 1 - (k.embedding <=> p_query_embedding) >= p_min_similarity
  order by k.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- Função pra incrementar hits (call após usar)
create or replace function increment_ai_knowledge_hits(p_ids uuid[])
returns void language sql as $$
  update ai_knowledge set hits = hits + 1, last_used_at = now() where id = any(p_ids);
$$;

-- Tabela de métricas diárias da IA (alimenta dashboard)
create table if not exists ai_metrics_daily (
  tenant_id uuid not null references tenants(id) on delete cascade,
  date date not null,
  inbound_count int default 0,
  ai_replied_count int default 0,
  human_replied_count int default 0,
  flagged_count int default 0,
  avg_latency_ms int,
  total_tokens_in bigint default 0,
  total_tokens_out bigint default 0,
  errors_count int default 0,
  knowledge_hits int default 0,
  primary key (tenant_id, date)
);
create index if not exists idx_ai_metrics_date on ai_metrics_daily(date desc);

-- Log de chamadas IA (eventos, source pro dashboard)
create table if not exists ai_call_events (
  id bigserial primary key,
  tenant_id uuid not null,
  customer_id uuid,
  phone text,
  event text not null, -- 'reply_sent' | 'tool_call' | 'error' | 'knowledge_hit' | 'flag_for_human'
  model text,
  provider text,
  latency_ms int,
  tokens_in int,
  tokens_out int,
  error_message text,
  metadata jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_ai_call_events_tenant_created on ai_call_events(tenant_id, created_at desc);
create index if not exists idx_ai_call_events_event on ai_call_events(event, created_at desc);
