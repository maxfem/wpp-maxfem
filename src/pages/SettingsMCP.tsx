import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateKeyDialog } from "@/components/settings/mcp/CreateKeyDialog";
import { ApiKeysTable } from "@/components/settings/mcp/ApiKeysTable";
import { CallLogsTable } from "@/components/settings/mcp/CallLogsTable";
import { EndpointTester } from "@/components/settings/mcp/EndpointTester";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Bot, Info, Terminal, Code } from "lucide-react";

export default function SettingsMCP() {
  const { currentTenant } = useAuth();
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [callLogs, setCallLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    if (!currentTenant) return;
    setIsLoading(true);
    
    const [keysRes, logsRes] = await Promise.all([
      supabase.from("mcp_api_keys").select("*").eq("tenant_id", currentTenant.id).order("created_at", { ascending: false }),
      supabase.from("mcp_call_logs").select("*").eq("tenant_id", currentTenant.id).order("created_at", { ascending: false }).limit(50)
    ]);

    if (keysRes.data) setApiKeys(keysRes.data);
    if (logsRes.data) setCallLogs(logsRes.data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [currentTenant]);

  const endpointUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server`;

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Model Context Protocol (MCP)</h1>
            <p className="text-muted-foreground">Integre seu CRM com LLMs externas como Claude Desktop e Cursor.</p>
          </div>
          <CreateKeyDialog onKeyCreated={fetchData} />
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Terminal className="h-5 w-5 text-primary" />
                Configuração de Conexão
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Endpoint URL</span>
                  <Code className="h-4 w-4 text-muted-foreground" />
                </div>
                <code className="block text-xs break-all bg-background p-2 rounded border">
                  {endpointUrl}
                </code>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Exemplo Claude Desktop (config.json)</h4>
                <pre className="text-[10px] bg-zinc-950 text-zinc-50 p-4 rounded-lg overflow-x-auto">
{`{
  "mcpServers": {
    "maxfem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-http", "${endpointUrl}"],
      "env": {
        "X_MCP_KEY": "SUA_API_KEY_AQUI"
      }
    }
  }
}`}
                </pre>
                <p className="text-[10px] text-muted-foreground">
                  * Nota: O transporte nativo do Maxfem CRM é HTTP Streamable. Algumas ferramentas podem exigir o uso do bridge `@modelcontextprotocol/server-http`.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Info className="h-5 w-5 text-primary" />
                O que é MCP?
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <p>
                O MCP é um padrão aberto que permite que assistentes de IA acessem ferramentas e dados de forma segura.
              </p>
              <p>
                Ao conectar o Maxfem CRM via MCP, você pode pedir ao Claude para:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>"Crie uma lista de clientes que não compram há 30 dias"</li>
                <li>"Resuma o histórico do cliente João Silva"</li>
                <li>"Agende uma campanha de WhatsApp para amanhã"</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="keys" className="w-full">
          <TabsList>
            <TabsTrigger value="keys">API Keys</TabsTrigger>
            <TabsTrigger value="logs">Logs de Atividade</TabsTrigger>
          </TabsList>
          <TabsContent value="keys" className="mt-4">
            <ApiKeysTable keys={apiKeys} onRefresh={fetchData} />
          </TabsContent>
          <TabsContent value="logs" className="mt-4">
            <CallLogsTable logs={callLogs} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
