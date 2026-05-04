import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Copy, Send, CheckCircle2, AlertCircle, Plus, Trash2, Webhook, ShieldCheck, History } from "lucide-react";
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
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState("");
  const [pixelKey, setPixelKey] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newWebhook, setNewWebhook] = useState({
    url: "",
    events: [] as string[],
  });

  const AVAILABLE_EVENTS = [
    { id: "message.delivered", label: "Mensagem Entregue" },
    { id: "message.read", label: "Mensagem Lida" },
    { id: "campaign.completed", label: "Campanha Concluída" },
    { id: "customer.converted", label: "Cliente Converteu" },
    { id: "chat.assigned", label: "Chat Atribuído" },
  ];

  const { data: outboundWebhooks } = useQuery({
    queryKey: ["outbound-webhooks", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outbound_webhooks")
        .select("*")
        .eq("tenant_id", currentTenant?.id);
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const createWebhookMutation = useMutation({
    mutationFn: async (data: typeof newWebhook) => {
      const { error } = await supabase.from("outbound_webhooks").insert({
        tenant_id: currentTenant?.id,
        url: data.url,
        events: data.events,
        secret_token: Math.random().toString(36).substring(7),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Webhook criado!", description: "Seu sistema agora receberá eventos em tempo real." });
      setIsModalOpen(false);
      setNewWebhook({ url: "", events: [] });
      queryClient.invalidateQueries({ queryKey: ["outbound-webhooks"] });
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("outbound_webhooks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Webhook removido" });
      queryClient.invalidateQueries({ queryKey: ["outbound-webhooks"] });
    },
  });

  useEffect(() => {
    const fetchConfig = async () => {
      const { data: tenant } = await supabase.from("tenants").select("pixel_public_key").single();
      if (tenant) setPixelKey(tenant.pixel_public_key || "");
      
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Webhook className="h-6 w-6 text-primary" /> Integrações via Webhook
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure endpoints para receber e enviar dados em tempo real.
            </p>
          </div>
          
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Novo Webhook de Saída
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Configurar Webhook de Saída</DialogTitle>
                <DialogDescription>
                  Envie notificações do CRM para o seu sistema externo (ERP, Dashboard, etc).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>URL do seu Endpoint</Label>
                  <Input 
                    placeholder="https://seu-sistema.com/webhook" 
                    value={newWebhook.url}
                    onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Eventos para Notificar</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {AVAILABLE_EVENTS.map((event) => (
                      <div key={event.id} className="flex items-center space-x-2 border rounded-md p-2">
                        <Checkbox 
                          id={event.id} 
                          checked={newWebhook.events.includes(event.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setNewWebhook({ ...newWebhook, events: [...newWebhook.events, event.id] });
                            } else {
                              setNewWebhook({ ...newWebhook, events: newWebhook.events.filter(e => e !== event.id) });
                            }
                          }}
                        />
                        <label htmlFor={event.id} className="text-[10px] font-medium leading-none cursor-pointer">
                          {event.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button 
                  onClick={() => createWebhookMutation.mutate(newWebhook)}
                  disabled={!newWebhook.url || newWebhook.events.length === 0 || createWebhookMutation.isPending}
                >
                  {createWebhookMutation.isPending ? "Criando..." : "Salvar Webhook"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary rotate-45" /> Webhooks de Entrada (Inbound)
            </h2>
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
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" /> Segurança e Auditoria
                </CardTitle>
                <CardDescription>Gerencie logs e acessos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-between" onClick={() => window.location.href = "/settings/audit"}>
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" />
                    <span>Ver Log de Auditoria</span>
                  </div>
                  <CheckCircle2 className="h-3 w-3 opacity-50" />
                </Button>
                <Button variant="outline" className="w-full justify-between" onClick={() => window.location.href = "/settings/collaborators"}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span>Gerenciar Permissões (RBAC)</span>
                  </div>
                  <CheckCircle2 className="h-3 w-3 opacity-50" />
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Dicas de Integração</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <p>
                  <strong>Webhooks de Saída:</strong> Use para sincronizar dados com seu próprio banco de dados ou sistemas de BI externos sempre que uma mensagem for entregue ou uma venda ocorrer.
                </p>
                <p>
                  <strong>Segurança:</strong> Cada webhook de saída inclui um <code>secret_token</code> no cabeçalho <code>X-Maxfem-Secret</code> para validação de autenticidade.
                </p>
              </CardContent>
            </Card>

            {outboundWebhooks && outboundWebhooks.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Send className="h-5 w-5" /> Webhooks de Saída Ativos
                </h2>
                <div className="space-y-4">
                  {outboundWebhooks.map((webhook) => (
                    <Card key={webhook.id} className="border-l-4 border-l-primary">
                      <CardHeader className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <CardTitle className="text-sm font-mono truncate max-w-[200px]">{webhook.url}</CardTitle>
                            <div className="flex flex-wrap gap-1">
                              {webhook.events?.map((e: string) => (
                                <Badge key={e} variant="secondary" className="text-[10px]">
                                  {AVAILABLE_EVENTS.find(ae => ae.id === e)?.label || e}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch checked={webhook.is_active} />
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteWebhookMutation.mutate(webhook.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
