# Ativar Meta CAPI server-side (A5 auditoria Fable 5)

Edge function `meta-capi` + tabelas (`meta_capi_config`, `meta_capi_events`) + triggers em `orders` já estão em prod. Falta só **plugar pra um tenant**.

## O que isso resolve

O Pixel client-side perde ~38% de Purchase no iOS + adblock + ITP + Brave. Hoje o cupom **CLAREADOR15** é o proxy ground-truth, mas só cobre 1 campanha. CAPI envia o evento direto do servidor com `event_id = "<external_id>__Purchase"` — o **mesmo** ID que o Pixel já envia. Meta dedupla automaticamente. Resultado: a Meta enxerga o pedido **mesmo quando o pixel não dispara** no browser.

## Pré-requisitos no Meta Events Manager

1. Pegar o **Pixel ID** da Maxfem (Events Manager → seu pixel → ID na URL ou no header).
2. Gerar um **System User access token** com escopo `ads_management` + `business_management` (ou usar o `META_ACCESS_TOKEN` que o LogicaOS já tem — vale o mesmo token).
3. (Opcional pra smoke) Em Test Events, copiar o **test_event_code** (ex: `TEST12345`).

## Ativação em 3 passos

### 1) Secrets no Supabase

```bash
# Token Meta — se o tenant Maxfem reutiliza o token do LogicaOS, é só copiar
supabase secrets set --project-ref lfpwubqmpztxhrmxadcl \
  META_CAPI_ACCESS_TOKEN="<system_user_token>"

# Settings pra o trigger SQL conseguir invocar a edge function via net.http_post.
# Roda em SQL direto no projeto (uma vez só, persiste):
```

```sql
ALTER DATABASE postgres
  SET app.settings.supabase_url = 'https://lfpwubqmpztxhrmxadcl.supabase.co';
ALTER DATABASE postgres
  SET app.settings.service_role_key = '<service_role_key>';
```

> Se o `tracking-events-sync` ou outro cron já usa esses settings em prod, eles já estão configurados — esse passo é no-op.

### 2) Config do tenant (smoke com test_event_code)

```sql
INSERT INTO meta_capi_config (tenant_id, pixel_id, enabled, test_event_code, default_event_source_url)
VALUES (
  '317243f9-565c-43c2-adcc-849038c65f72',   -- Maxfem
  '<PIXEL_ID>',
  true,
  'TEST12345',                              -- pega na aba Test Events
  'https://maxfem.com.br'
);
```

### 3) Smoke test manual

```bash
# Pega um order pago real pra testar
ORDER_ID=$(curl -sS "https://lfpwubqmpztxhrmxadcl.supabase.co/rest/v1/orders?mapped_status=eq.paid&order=created_at.desc&limit=1&select=id" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK" | jq -r '.[0].id')

# Dispara CAPI manualmente
curl -sS -X POST "https://lfpwubqmpztxhrmxadcl.supabase.co/functions/v1/meta-capi" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SRK" \
  -d "{\"tenant_id\":\"317243f9-565c-43c2-adcc-849038c65f72\",\"order_id\":\"$ORDER_ID\",\"event\":\"Purchase\"}"
```

Esperado: HTTP 200 + `{"status":"sent","fbtrace_id":"...","events_received":1}`. Confere no Events Manager → Test Events que o evento apareceu.

### 4) Subir pra produção

Depois de validar no Test Events:

```sql
UPDATE meta_capi_config
SET test_event_code = NULL
WHERE tenant_id = '317243f9-565c-43c2-adcc-849038c65f72';
```

A partir desse momento, todo pedido que virar pago (insert ou update de `mapped_status` pra `paid|invoiced|approved|shipped|on_carriage|in_transit|delivered`) dispara CAPI automaticamente via trigger.

## Observabilidade

```sql
-- Últimos 50 eventos
SELECT event_name, status, http_status, fbtrace_id, events_received, error_message, created_at
FROM meta_capi_events
WHERE tenant_id = '317243f9-565c-43c2-adcc-849038c65f72'
ORDER BY created_at DESC LIMIT 50;

-- Stats últimas 24h
SELECT status, count(*) FROM meta_capi_events
WHERE created_at > now() - interval '24 hours'
GROUP BY 1;
```

## Dedup garantida em 2 níveis

1. **Local** (Supabase): `uq_meta_capi_events_dedup` em `(tenant_id, pixel_id, event_id, event_name)` — se trigger disparar 2× pro mesmo pedido (race ou retry), só o primeiro chama o Graph API; segundo retorna `skipped`.
2. **Meta** (Events Manager): `event_id` consistente com o Pixel client-side faz o Meta deduplar — pedido aparece 1 vez mesmo quando ambos os caminhos chegam.

## Como desligar

```sql
UPDATE meta_capi_config SET enabled = false
WHERE tenant_id = '317243f9-565c-43c2-adcc-849038c65f72';
```

Os triggers continuam armados (custo zero), mas a edge function retorna `skipped` imediatamente. Sem chamada Graph API.

## Custo operacional

- Supabase: 1 net.http_post por pedido pago + 1 INSERT/UPDATE em `meta_capi_events`.
- Meta: ilimitado pelo plano de business; CAPI não tem cota por evento separada do Pixel.
- Latência: fire-and-forget — não atrasa o `yampi-sync` nem a UI do cliente.
