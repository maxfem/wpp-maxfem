import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const PROVIDERS = [
  {
    id: "gemini",
    name: "Gemini AI",
    description: "IA multimodal integrada via Lovable AI. Analisa imagens, vídeos e áudios nativamente no atendimento. Sem necessidade de API Key.",
    logo: "",
    color: "#4285F4",
    features: ["Imagem", "Vídeo", "Áudio", "Copilot", "Sem API Key"],
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Assistente de IA para atendimento. Sugere respostas, copilot inteligente no chat.",
    logo: "",
    color: "#10A37F",
    features: ["Assistente IA", "Sugestão de Respostas", "Copilot"],
  },
  {
    id: "yampi",
    name: "Yampi",
    description: "Checkout transparente e gestão de e-commerce. Sincronize clientes, pedidos, carrinhos abandonados e transações Pix.",
    logo: "https://yampi.com.br/favicon.ico",
    color: "#6C5CE7",
    features: ["Clientes", "Pedidos", "Carrinhos Abandonados", "Pix Não Pago", "Rastreio"],
  },
  {
    id: "bling",
    name: "Bling",
    description: "ERP completo com emissão de NF-e, controle de estoque, financeiro e pedidos.",
    logo: "",
    color: "#0055AA",
    features: ["Clientes", "Pedidos", "Produtos", "NF-e", "Estoque", "Financeiro"],
  },
  {
    id: "nuvemshop",
    name: "Nuvemshop",
    description: "Plataforma de e-commerce líder na América Latina.",
    logo: "https://www.nuvemshop.com.br/favicon.ico",
    color: "#2B3990",
    features: ["Clientes", "Pedidos"],
    comingSoon: true,
  },
  {
    id: "tray",
    name: "Tray",
    description: "Plataforma completa de e-commerce.",
    logo: "https://www.tray.com.br/favicon.ico",
    color: "#FF6B00",
    features: ["Clientes", "Pedidos"],
    comingSoon: true,
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Plataforma global de comércio eletrônico.",
    logo: "https://www.shopify.com/favicon.ico",
    color: "#96BF48",
    features: ["Clientes", "Pedidos"],
    comingSoon: true,
  },
  {
    id: "vtex",
    name: "VTEX",
    description: "Plataforma de comércio digital enterprise.",
    logo: "https://vtex.com/favicon.ico",
    color: "#F71963",
    features: ["Clientes", "Pedidos"],
    comingSoon: true,
  },
];

export default function SettingsIntegrations() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();

  const { data: integrations } = useQuery({
    queryKey: ["integrations", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("tenant_id", currentTenant.id);
      return data || [];
    },
    enabled: !!currentTenant,
  });

  const getIntegrationStatus = (providerId: string) => {
    const integration = integrations?.find((i: any) => i.provider === providerId);
    if (!integration) return null;
    return integration;
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Conecte sua loja para sincronizar clientes, pedidos e automações
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PROVIDERS.map((provider) => {
            const integration = getIntegrationStatus(provider.id);
            const isConnected = integration?.is_active;
            const comingSoon = (provider as any).comingSoon;

            return (
              <Card
                key={provider.id}
                className={`border border-border transition-colors ${
                  comingSoon
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:border-primary/30 cursor-pointer"
                }`}
                onClick={() => !comingSoon && navigate(`/settings/integrations/${provider.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold text-lg"
                        style={{ backgroundColor: provider.color }}
                      >
                        {provider.name[0]}
                      </div>
                      <div>
                        <CardTitle className="text-sm">{provider.name}</CardTitle>
                        {isConnected && (
                          <Badge variant="default" className="mt-1 text-[10px] px-1.5 py-0 bg-green-600">
                            Conectado
                          </Badge>
                        )}
                        {comingSoon && (
                          <Badge variant="secondary" className="mt-1 text-[10px] px-1.5 py-0">
                            Em breve
                          </Badge>
                        )}
                      </div>
                    </div>
                    {!comingSoon && <ExternalLink className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CardDescription className="text-xs">{provider.description}</CardDescription>
                  <div className="flex flex-wrap gap-1">
                    {provider.features.map((f) => (
                      <Badge key={f} variant="outline" className="text-[10px] px-1.5 py-0">
                        {f}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
