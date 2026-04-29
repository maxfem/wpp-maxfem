import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Activity, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export default function SettingsPixel() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; count: number }>(null);

  const { data: tenant, refetch } = useQuery({
    queryKey: ["tenant-pixel", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await supabase
        .from("tenants")
        .select("id, name, pixel_public_key")
        .eq("id", currentTenant.id)
        .single();
      return data;
    },
    enabled: !!currentTenant,
  });

  const pixelKey = tenant?.pixel_public_key || "";
  const scriptUrl = `${SUPABASE_URL}/functions/v1/pixel-script?key=${pixelKey}`;
  const snippet = `<!-- Maxfem Pixel -->\n<script async src="${scriptUrl}"></script>`;

  const shopifyIdentifySnippet = `<!-- Maxfem Pixel - identificação Shopify -->
<script>
  window.mxf = window.mxf || function(){(window.mxf.q = window.mxf.q || []).push(arguments)};
  {% if customer %}
    mxf('identify', {
      email: {{ customer.email | json }},
      name: {{ customer.name | json }},
      phone: {{ customer.phone | json }}
    });
  {% endif %}
</script>`;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const testInstall = async () => {
    if (!tenant?.id) return;
    setTesting(true);
    setTestResult(null);
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const { count, error } = await supabase
      .from("pixel_events")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .gte("created_at", since);
    setTesting(false);
    setTestResult({ ok: !error && (count ?? 0) > 0, count: count ?? 0 });
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pixel de Rastreamento</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Identifique visitantes, capture intenção de compra e dispare remarketing automático
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Sua chave pública</CardTitle>
                <CardDescription>Identifica seu pixel publicamente — pode ser exposta no site</CardDescription>
              </div>
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-md bg-secondary text-xs font-mono break-all">
                {pixelKey}
              </code>
              <Button size="sm" variant="outline" onClick={() => copy(pixelKey, "Chave")}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="shopify">
          <TabsList>
            <TabsTrigger value="shopify">Shopify</TabsTrigger>
            <TabsTrigger value="generic">Site / outras plataformas</TabsTrigger>
            <TabsTrigger value="api">API JS</TabsTrigger>
          </TabsList>

          <TabsContent value="shopify" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">1. Cole no theme.liquid</CardTitle>
                <CardDescription>
                  No admin Shopify: Lojas online → Temas → Editar código → Layout → <code>theme.liquid</code> →
                  cole logo antes de <code>&lt;/head&gt;</code>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="p-3 bg-secondary rounded-md text-xs font-mono overflow-x-auto">{snippet}</pre>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => copy(snippet, "Snippet")}>
                  <Copy className="h-3 w-3 mr-2" /> Copiar snippet
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">2. Identifique clientes logados (opcional, recomendado)</CardTitle>
                <CardDescription>
                  Cole logo após o snippet do pixel para vincular automaticamente clientes Shopify ao CRM
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="p-3 bg-secondary rounded-md text-xs font-mono overflow-x-auto">{shopifyIdentifySnippet}</pre>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => copy(shopifyIdentifySnippet, "Snippet identify")}>
                  <Copy className="h-3 w-3 mr-2" /> Copiar
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">3. Eventos automáticos detectados</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>✅ Page view (todas as páginas)</li>
                  <li>✅ Product view (página de produto)</li>
                  <li>✅ Identify (cliente logado)</li>
                  <li>⚠️ Add to cart, checkout e purchase: instalar via <strong>Customer Events</strong> da Shopify para captura nativa</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="generic" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Cole no &lt;head&gt; do seu site</CardTitle>
                <CardDescription>Funciona em Yampi, Nuvemshop, Tray, WordPress, sites custom, etc.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="p-3 bg-secondary rounded-md text-xs font-mono overflow-x-auto">{snippet}</pre>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => copy(snippet, "Snippet")}>
                  <Copy className="h-3 w-3 mr-2" /> Copiar
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">API JavaScript</CardTitle>
                <CardDescription>Após o pixel carregar, use <code>window.mxf(...)</code> em qualquer lugar</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="p-3 bg-secondary rounded-md text-xs font-mono overflow-x-auto">{`// Identificar cliente (após login/checkout)
mxf('identify', { email: 'cliente@email.com', phone: '11999999999', name: 'Maria' });

// Visualização de produto
mxf('product', { id: '123', name: 'Calcinha XYZ', price: 49.90, image: 'https://...', url: location.href });

// Adicionou ao carrinho
mxf('cart', { value: 129.80, items: [{ id: '123', qty: 2 }] });

// Iniciou checkout
mxf('checkout', { value: 129.80, url: 'https://checkout.exemplo.com/abc' });

// Comprou
mxf('purchase', { id: 'PEDIDO-123', value: 129.80 });`}</pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Testar instalação
            </CardTitle>
            <CardDescription>
              Verifica se eventos do pixel chegaram nos últimos 5 minutos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={testInstall} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
              Testar agora
            </Button>
            {testResult && (
              <div className={`p-3 rounded-md text-sm flex items-center gap-2 ${
                testResult.ok ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
              }`}>
                {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {testResult.ok
                  ? `Tudo certo! ${testResult.count} eventos recebidos nos últimos 5 minutos.`
                  : `Nenhum evento recebido. Acesse seu site e tente novamente.`}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
