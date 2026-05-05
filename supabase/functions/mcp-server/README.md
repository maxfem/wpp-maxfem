# MCP Server (`mcp-server`)

Servidor MCP (Model Context Protocol) que expõe o CRM Maxfem para LLMs externas (Claude Code, Cursor, etc).

- Endpoint público: `https://<project-ref>.supabase.co/functions/v1/mcp-server`
- Health check (sem auth): `GET /health` → `200 {status:"ok"}`
- Transport: Streamable HTTP (`mcp-lite` v0.10)
- Auth: header `X-MCP-Key: mcp_...` (gerada em `/settings/mcp`)
- RLS: permanece **ativo** nas tabelas. A Edge Function usa `SUPABASE_SERVICE_ROLE_KEY` e **filtra manualmente por `tenant_id`** vindo da key.

## Tools registrados

| Tool | Scope | Status |
|---|---|---|
| `whoami` | — | ✅ pronto |
| `search_customers` | `customers:read` | ✅ pronto |
| `get_customer_360` | `customers:read` | ✅ pronto |
| `list_campaigns` | `campaigns:read` | ✅ pronto |
| `create_campaign` | `campaigns:write` | ✅ pronto |
| `get_campaign_report` | `campaigns:read` | ✅ pronto (usa RPC `get_campaign_stats` ou fallback agregado) |
| `list_contact_lists` | `lists:read` | ✅ pronto |
| `create_contact_list` | `lists:write` | ✅ pronto |
| `list_message_templates` | `templates:read` | ✅ pronto |
| `create_whatsapp_template` | `templates:write` | ⚠️ known-issue: insere no DB com `status=pending` mas **não submete pra Meta**. Submissão real precisa ser feita em `/templates`. |
| `list_conversations` | `chat:read` | ✅ pronto |
| `send_whatsapp_message` | `chat:write` | ⚠️ known-issue: stub — apenas confirma intenção, não enfileira de fato no `whatsapp-send`. |

Scope wildcard: `*` ou `<dominio>:*` (ex: `campaigns:*`).

## Logging estruturado

Cada request gera 2 linhas JSON em stdout do edge function:

```json
{"ts":"2026-05-05T10:09:18Z","level":"info","msg":"mcp.request","reqId":"...","method":"tools/call","tool":"list_campaigns","tenantId":"...","apiKeyId":"..."}
{"ts":"2026-05-05T10:09:18Z","level":"info","msg":"mcp.response","reqId":"...","method":"tools/call","tool":"list_campaigns","tenantId":"...","status":200,"durationMs":6,"ok":true}
```

Toda chamada `tools/call` também é persistida em `mcp_call_logs` (tenant, key, tool, args, status, duration).

A key crua **nunca** é logada — só o `keyPrefix` (11 chars) em casos de auth_failed.

## Como adicionar uma nova tool

1. Crie o handler em `tools/<dominio>.ts`:

```ts
server.tool("minha_tool", {
  description: "...",
  inputSchema: { type: "object", properties: { foo: { type: "string" } }, required: ["foo"] },
  handler: async (args, ctx: any) => {
    const { tenant_id, scopes } = (ctx?.authInfo?.extra ?? {}) as any;
    if (!checkScope("dominio:read", scopes)) {
      return { content: [{ type: "text", text: "Error: Forbidden." }], isError: true };
    }
    const { data, error } = await supabaseAdmin
      .from("minha_tabela").select("*").eq("tenant_id", tenant_id);
    if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
});
```

2. Importe e registre em `index.ts` (`registerXxxTools(mcpServer)`).
3. Atualize a tabela acima.
4. Rode o smoke test (próxima seção).

## Smoke test

Script em `/tmp/mcp_smoke.sh` (gerado pelo agente). Rodar:

```bash
MCP_KEY=mcp_xxx bash /tmp/mcp_smoke.sh
```

Testa: `/health`, 401 sem key, 403 key inválida, `initialize`, `notifications/initialized`, `tools/list`, e cada tool de read (whoami, list_contact_lists, list_campaigns, search_customers, list_message_templates, list_conversations).

Última run em prod: **11/11 ✅**.

## Debug

- Erros de tool retornam `{"content":[{"type":"text","text":"Error: ..."}], "isError": true}` — códigos JSON-RPC corretos (`-32603` só em throw real do handler, com `reqId` no `data`).
- Logs: `supabase functions logs mcp-server` ou painel → procure por `reqId` específico.
- Auditoria: `select * from mcp_call_logs order by created_at desc limit 20`.
- Erros comuns:
  - `Missing X-MCP-Key header` → header não chegou ou nome errado.
  - `Invalid or revoked API key` → hash não bate / key revogada / expirada.
  - `Forbidden` → key não tem o scope pedido.
