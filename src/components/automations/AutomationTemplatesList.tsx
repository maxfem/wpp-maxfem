import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  ShoppingCart, CreditCard, Package, Truck, Star, Heart,
  Gift, RefreshCw, MessageSquare, Upload, Search, Plus, Zap,
  ArrowRight, Clock, CheckCircle2, Store,
} from "lucide-react";
import { toast } from "sonner";

interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ElementType;
  steps: number;
  triggers: string[];
  integrations: string[];
  type: string;
}

const integrationLogos: Record<string, { label: string; color: string }> = {
  nuvemshop: { label: "Nuvemshop", color: "bg-blue-100 text-blue-700" },
  tray: { label: "Tray", color: "bg-purple-100 text-purple-700" },
  vtex: { label: "VTEX", color: "bg-pink-100 text-pink-700" },
  yampi: { label: "Yampi", color: "bg-orange-100 text-orange-700" },
  shopify: { label: "Shopify", color: "bg-green-100 text-green-700" },
  bling: { label: "Bling", color: "bg-yellow-100 text-yellow-700" },
  tiny: { label: "Tiny", color: "bg-indigo-100 text-indigo-700" },
  csv: { label: "CSV", color: "bg-muted text-muted-foreground" },
  whatsapp: { label: "WhatsApp", color: "bg-emerald-100 text-emerald-700" },
};

const categories = [
  { value: "all", label: "Todas" },
  { value: "recovery", label: "Recuperação" },
  { value: "transactional", label: "Transacional" },
  { value: "retention", label: "Retenção" },
  { value: "engagement", label: "Engajamento" },
  { value: "loyalty", label: "Fidelização" },
];

const templates: AutomationTemplate[] = [
  {
    id: "cart_abandoned",
    name: "Carrinho Abandonado",
    description: "Recupere vendas perdidas com mensagens automáticas quando o cliente abandona o carrinho",
    category: "recovery",
    icon: ShoppingCart,
    steps: 5,
    triggers: ["Carrinho abandonado há 30min"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify"],
    type: "recovery",
  },
  {
    id: "pix_pending",
    name: "Pix Não Pago",
    description: "Lembre o cliente de pagar o Pix antes que expire, aumentando a taxa de conversão",
    category: "recovery",
    icon: CreditCard,
    steps: 3,
    triggers: ["Pedido com Pix pendente"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify", "bling"],
    type: "recovery",
  },
  {
    id: "boleto_pending",
    name: "Boleto Não Pago",
    description: "Envie lembretes automáticos para clientes com boletos pendentes",
    category: "recovery",
    icon: CreditCard,
    steps: 3,
    triggers: ["Pedido com boleto pendente"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify"],
    type: "recovery",
  },
  {
    id: "order_approved",
    name: "Pedido Aprovado",
    description: "Confirme o pagamento e informe o cliente que o pedido está sendo preparado",
    category: "transactional",
    icon: CheckCircle2,
    steps: 1,
    triggers: ["Pagamento confirmado"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify", "bling", "tiny"],
    type: "post_sale",
  },
  {
    id: "order_shipped",
    name: "Pedido Enviado + Rastreio",
    description: "Envie o código de rastreio automaticamente quando o pedido for despachado",
    category: "transactional",
    icon: Truck,
    steps: 1,
    triggers: ["Status alterado para enviado"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify", "bling", "tiny"],
    type: "post_sale",
  },
  {
    id: "order_delivered",
    name: "Pedido Entregue",
    description: "Confirme a entrega e peça avaliação do produto e da experiência de compra",
    category: "transactional",
    icon: Package,
    steps: 2,
    triggers: ["Status alterado para entregue"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify"],
    type: "post_sale",
  },
  {
    id: "first_purchase",
    name: "Boas-vindas (1ª Compra)",
    description: "Encante o novo cliente com uma mensagem de boas-vindas e cupom de desconto",
    category: "engagement",
    icon: Heart,
    steps: 2,
    triggers: ["Primeiro pedido aprovado"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify"],
    type: "post_sale",
  },
  {
    id: "nps_survey",
    name: "Pesquisa NPS",
    description: "Colete feedback dos clientes automaticamente após a entrega do pedido",
    category: "engagement",
    icon: Star,
    steps: 2,
    triggers: ["7 dias após entrega"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify", "csv"],
    type: "post_sale",
  },
  {
    id: "reengagement_30",
    name: "Reengajamento 30 dias",
    description: "Traga de volta clientes que não compram há 30 dias com ofertas especiais",
    category: "retention",
    icon: RefreshCw,
    steps: 3,
    triggers: ["Última compra há 30 dias"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify", "csv"],
    type: "custom",
  },
  {
    id: "reengagement_60",
    name: "Reengajamento 60 dias",
    description: "Recupere clientes inativos há 60 dias com descontos progressivos",
    category: "retention",
    icon: RefreshCw,
    steps: 3,
    triggers: ["Última compra há 60 dias"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify", "csv"],
    type: "custom",
  },
  {
    id: "reengagement_90",
    name: "Reengajamento 90 dias",
    description: "Última tentativa de recuperar clientes inativos com oferta agressiva",
    category: "retention",
    icon: RefreshCw,
    steps: 2,
    triggers: ["Última compra há 90 dias"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify", "csv"],
    type: "custom",
  },
  {
    id: "birthday",
    name: "Aniversário do Cliente",
    description: "Envie felicitações e cupom exclusivo no dia do aniversário do cliente",
    category: "loyalty",
    icon: Gift,
    steps: 1,
    triggers: ["Data de aniversário"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify", "csv"],
    type: "birthday",
  },
  {
    id: "purchase_anniversary",
    name: "Aniversário da 1ª Compra",
    description: "Celebre a data da primeira compra e incentive uma recompra",
    category: "loyalty",
    icon: Gift,
    steps: 1,
    triggers: ["Aniversário de 1 ano da 1ª compra"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify", "csv"],
    type: "first_purchase_anniversary",
  },
  {
    id: "review_request",
    name: "Solicitar Avaliação",
    description: "Peça reviews dos produtos comprados para gerar prova social na loja",
    category: "engagement",
    icon: MessageSquare,
    steps: 2,
    triggers: ["14 dias após entrega"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify"],
    type: "post_sale",
  },
  {
    id: "repurchase_reminder",
    name: "Lembrete de Recompra",
    description: "Lembre clientes de recomprar produtos consumíveis com base no ciclo de uso",
    category: "retention",
    icon: RefreshCw,
    steps: 2,
    triggers: ["Ciclo médio de recompra atingido"],
    integrations: ["nuvemshop", "tray", "vtex", "yampi", "shopify", "csv"],
    type: "custom",
  },
  {
    id: "csv_custom",
    name: "Campanha via CSV",
    description: "Importe uma lista de contatos via CSV para disparar automações personalizadas",
    category: "engagement",
    icon: Upload,
    steps: 1,
    triggers: ["Upload de arquivo CSV"],
    integrations: ["csv"],
    type: "custom",
  },
];

interface Props {
  onClose: () => void;
  open: boolean;
}

export function AutomationTemplatesList({ open, onClose }: Props) {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const createFromTemplate = useMutation({
    mutationFn: async (template: AutomationTemplate) => {
      if (!currentTenant) throw new Error("No tenant");
      const { data, error } = await supabase.from("campaigns").insert({
        tenant_id: currentTenant.id,
        name: template.name,
        type: template.type,
        status: "draft",
        trigger_type: template.triggers[0],
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automação criada! Configurando fluxo...");
      onClose();
      navigate(`/automations/flow/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast.error("Selecione um arquivo CSV válido");
      return;
    }
    toast.success(`Arquivo "${file.name}" carregado! Criando automação...`);
    const csvTemplate = templates.find((t) => t.id === "csv_custom")!;
    createFromTemplate.mutate(csvTemplate);
  };

  const filtered = templates.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "all" || t.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Nova Automação
          </DialogTitle>
          <DialogDescription>
            Escolha uma régua de automação para configurar ou importe contatos via CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar automação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            className="hidden"
            onChange={handleCsvUpload}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Importar CSV
          </Button>
        </div>

        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="mt-2">
          <TabsList className="w-full justify-start overflow-x-auto">
            {categories.map((cat) => (
              <TabsTrigger key={cat.value} value={cat.value} className="text-xs">
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="overflow-y-auto flex-1 mt-3 space-y-2 pr-1">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nenhuma automação encontrada</p>
            </div>
          ) : (
            filtered.map((template) => {
              const Icon = template.icon;
              return (
                <Card
                  key={template.id}
                  className="border border-border hover:border-primary/40 transition-all cursor-pointer group"
                  onClick={() => createFromTemplate.mutate(template)}
                >
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-foreground">{template.name}</h3>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Clock className="h-3 w-3" />
                          {template.steps} {template.steps === 1 ? "etapa" : "etapas"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground font-medium mr-1">Integrações:</span>
                        {template.integrations.map((integ) => {
                          const info = integrationLogos[integ];
                          return info ? (
                            <Badge key={integ} variant="outline" className={`text-[10px] ${info.color}`}>
                              {integ === "csv" ? <Upload className="h-2.5 w-2.5 mr-0.5" /> : <Store className="h-2.5 w-2.5 mr-0.5" />}
                              {info.label}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-3" />
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
