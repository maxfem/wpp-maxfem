import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Copy, Send, CheckCircle2, AlertCircle, Plus, Trash2, Webhook, ShieldCheck } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const WEBHOOKS = [
  {
    id: "pixel",
    name: "Pixel de Rastreamento",
    description: "Endpoint para receber eventos do pixel (Shopify, sites externos)",
    endpoint: "pixel-collect",
    testPayload: {
      key: "SUA_CHAVE_PUBLICA",
      visitor_id: "test-visitor-123",
      session_key: "test-session-456",
      events: [
        { type: "page_view", url: "https://exemplo.com/home", page_title: "Home Teste" }
      ]
    }
  },
  {
    id: "whatsapp",
    name: "WhatsApp Webhook",
    description: "Endpoint para receber mensagens e eventos da API do WhatsApp Cloud",
    endpoint: "whatsapp-webhook",
    testPayload: {
      object: "whatsapp_business_account",
      entry: [{
        id: "WHATSAPP_ID",
        changes: [{
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "5511999999999", phone_number_id: "123456" },
            messages: [{
              from: "5511999999999",
              id: "wamid.test",
              timestamp: Math.floor(Date.now() / 1000),
              text: { body: "Olá, teste de webhook" },
              type: "text"
            }]
          },
          field: "messages"
        }]
      }]
    }
  },
  {
    id: "ses",
    name: "SES Email Events",
    description: "Endpoint para receber notificações de entrega, abertura e clique da AWS SES",
    endpoint: "ses-events-webhook",
    testPayload: {
      eventType: "Delivery",
      mail: {
        messageId: "test-msg-id-" + Math.random().toString(36).substring(7),
        source: "contato@exemplo.com",
        timestamp: new Date().toISOString(),
        destination: ["teste@exemplo.com"]
      },
      delivery: {
        timestamp: new Date().toISOString(),
        processingTimeMillis: 100,
        recipients: ["teste@exemplo.com"],
        smtpResponse: "250 2.0.0 OK"
      }
    }
  }
];

export default function SettingsWebhooks() {
  const { toast } = useToast();
  const [baseUrl, setBaseUrl] = useState("");
  const [pixelKey, setPixelKey] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      const { data: tenant } = await supabase.from("tenants").select("pixel_public_key").single();
      if (tenant) setPixelKey(tenant.pixel_public_key || "");
      
      // Use the project's functions URL
      const { data: { publicUrl } } = supabase.storage.from('whatsapp-media').getPublicUrl('test');
      const urlMatch = publicUrl.match(/https:\/\/(.*?)\.supabase\.co/);
      if (urlMatch) {
        setBaseUrl(`https://${urlMatch[1]}.supabase.co/functions/v1`);
      }
    };
    fetchConfig();
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: "URL copiada para a área de transferência.",
    });
  };

  const testWebhook = async (webhook: typeof WEBHOOKS[0]) => {
    setTestingId(webhook.id);
    try {
      const payload = { ...webhook.testPayload };
      if (webhook.id === "pixel") {
        (payload as any).key = pixelKey;
      }

      const response = await fetch(`${baseUrl}/${webhook.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Teste bem-sucedido!",
          description: `O webhook ${webhook.name} respondeu corretamente.`,
        });
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error: any) {
      toast({
        title: "Erro no teste",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            URLs de entrada para integrações externas e testes de recebimento.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            {WEBHOOKS.map((w) => (
              <Card key={w.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{w.name}</CardTitle>
                      <CardDescription>{w.description}</CardDescription>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => testWebhook(w)}
                      disabled={testingId === w.id}
                    >
                      <Send className={`h-4 w-4 mr-2 ${testingId === w.id ? "animate-pulse" : ""}`} />
                      Testar Agora
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Endpoint URL</label>
                    <div className="flex gap-2">
                      <Input 
                        readOnly 
                        value={`${baseUrl}/${w.endpoint}`} 
                        className="bg-muted/50 font-mono text-xs"
                      />
                      <Button variant="secondary" size="icon" onClick={() => copyToClipboard(`${baseUrl}/${w.endpoint}`)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Dicas de Integração</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <p>
                  <strong>WhatsApp:</strong> Configure a URL acima no painel do Facebook Developers (Webhooks → WhatsApp Business Account). 
                  A <i>Verify Token</i> é o próprio ID do seu Tenant.
                </p>
                <p>
                  <strong>Shopify:</strong> Para rastrear abandono de carrinho, instale o script do Pixel (disponível em Configurações → Pixel) no seu <code>theme.liquid</code>.
                </p>
                <p>
                  <strong>AWS SES:</strong> Configure uma notificação SNS para o endpoint acima para rastrear aberturas e cliques em tempo real.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Acompanhamento</CardTitle>
                <CardDescription>Veja o processamento em tempo real</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-between" onClick={() => window.location.href = "/pixel"}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span>Ver eventos do Pixel</span>
                  </div>
                  <Copy className="h-3 w-3 opacity-50" />
                </Button>
                <Button variant="outline" className="w-full justify-between" onClick={() => window.location.href = "/activities"}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span>Ver histórico de atividades</span>
                  </div>
                  <Copy className="h-3 w-3 opacity-50" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

