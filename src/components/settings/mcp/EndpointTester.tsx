import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, Loader2, CheckCircle2, XCircle } from "lucide-react";

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server`;

const METHODS: Record<string, any> = {
  initialize: {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "maxfem-tester", version: "1.0" },
    },
  },
  "tools/list": { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  whoami: {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "whoami", arguments: {} },
  },
};

export function EndpointTester() {
  const [apiKey, setApiKey] = useState("");
  const [method, setMethod] = useState("initialize");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [responseBody, setResponseBody] = useState<string>("");
  const [duration, setDuration] = useState<number | null>(null);

  const run = async () => {
    setLoading(true);
    setStatus(null);
    setResponseBody("");
    setDuration(null);

    const start = performance.now();
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "X-MCP-Key": apiKey,
        },
        body: JSON.stringify(METHODS[method]),
      });
      const text = await res.text();
      setStatus(res.status);
      try {
        setResponseBody(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponseBody(text);
      }
    } catch (e: any) {
      setStatus(0);
      setResponseBody(`Network error: ${e.message}`);
    } finally {
      setDuration(Math.round(performance.now() - start));
      setLoading(false);
    }
  };

  const statusVariant =
    status === null ? "secondary" : status >= 200 && status < 300 ? "default" : "destructive";
  const StatusIcon = status && status >= 200 && status < 300 ? CheckCircle2 : XCircle;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <PlayCircle className="h-5 w-5 text-primary" />
          Testador de Endpoint
        </CardTitle>
        <CardDescription>
          Valide sua API Key chamando o servidor MCP em tempo real.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="mcp-test-key">API Key</Label>
          <Input
            id="mcp-test-key"
            type="password"
            placeholder="mcp_..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label>Método</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="initialize">initialize (handshake)</SelectItem>
              <SelectItem value="tools/list">tools/list (listar ferramentas)</SelectItem>
              <SelectItem value="whoami">tools/call → whoami (identidade)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={run} disabled={!apiKey || loading} className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
          Executar requisição
        </Button>

        {status !== null && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2 text-sm">
              <StatusIcon className={`h-4 w-4 ${status >= 200 && status < 300 ? "text-green-500" : "text-destructive"}`} />
              <Badge variant={statusVariant as any}>HTTP {status}</Badge>
              {duration !== null && (
                <span className="text-xs text-muted-foreground">{duration} ms</span>
              )}
            </div>
            <pre className="text-[10px] bg-zinc-950 text-zinc-50 p-3 rounded-lg overflow-x-auto max-h-80">
{responseBody}
            </pre>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Endpoint: <code className="break-all">{ENDPOINT}</code>
        </p>
      </CardContent>
    </Card>
  );
}
