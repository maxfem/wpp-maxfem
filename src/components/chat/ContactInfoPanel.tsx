import { useState, useEffect } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Conversation, Message } from "./types";
import {
  Phone, Mail, Tag, MessageSquare, ShoppingBag, Calendar,
  ExternalLink, Copy, Edit2, Bot, StickyNote, Save, Package,
  CheckCircle2, XCircle, Clock, CreditCard, Truck, RotateCcw
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Order {
  id: string;
  external_id: string | null;
  total: number;
  status: string;
  mapped_status: string | null;
  created_at: string;
}

interface ContactInfoPanelProps {
  conversation: Conversation | undefined;
  messages: Message[];
  customer?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    tags: string[] | null;
    total_orders: number | null;
    total_spent: number | null;
    last_order_at: string | null;
    created_at: string;
    custom_attributes?: any;
  } | null;
  orders?: Order[];
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  paid: { label: "Pago", color: "bg-green-500/10 text-green-600 border-green-200", icon: CheckCircle2 },
  delivered: { label: "Entregue", color: "bg-green-500/10 text-green-600 border-green-200", icon: CheckCircle2 },
  pending: { label: "Pendente", color: "bg-yellow-500/10 text-yellow-600 border-yellow-200", icon: Clock },
  waiting_payment: { label: "Aguardando", color: "bg-yellow-500/10 text-yellow-600 border-yellow-200", icon: Clock },
  pix_pending: { label: "Pix Pendente", color: "bg-orange-500/10 text-orange-600 border-orange-200", icon: CreditCard },
  invoiced: { label: "Faturado", color: "bg-blue-500/10 text-blue-600 border-blue-200", icon: Package },
  shipped: { label: "Enviado", color: "bg-blue-500/10 text-blue-600 border-blue-200", icon: Truck },
  cancelled: { label: "Cancelado", color: "bg-red-500/10 text-red-600 border-red-200", icon: XCircle },
  refunded: { label: "Reembolsado", color: "bg-red-500/10 text-red-600 border-red-200", icon: RotateCcw },
};

function getStatusInfo(status: string, mappedStatus: string | null) {
  const key = mappedStatus || status;
  return statusConfig[key] || { label: key, color: "bg-muted text-muted-foreground border-border", icon: Package };
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function ContactInfoPanel({ conversation, messages, customer, orders = [] }: ContactInfoPanelProps) {
  const navigate = useNavigate();
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);

  useEffect(() => {
    const saved = customer?.custom_attributes?.internal_notes || "";
    setNotes(saved);
    setNotesDirty(false);
  }, [customer?.id]);

  if (!conversation) return null;

  const totalMessages = messages.length;
  const inboundCount = messages.filter((m) => m.direction === "inbound").length;
  const outboundCount = messages.filter((m) => m.direction === "outbound").length;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  const saveNotes = async () => {
    if (!customer?.id) return;
    setSavingNotes(true);
    try {
      const attrs = customer.custom_attributes || {};
      const { error } = await supabase
        .from("customers")
        .update({ custom_attributes: { ...attrs, internal_notes: notes } })
        .eq("id", customer.id);
      if (error) throw error;
      toast.success("Observações salvas!");
      setNotesDirty(false);
    } catch {
      toast.error("Erro ao salvar observações");
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className="w-[320px] border-l border-border bg-card flex flex-col">
      <Tabs defaultValue="contact" className="flex-1 flex flex-col">
        <TabsList className="w-full h-10 rounded-none bg-transparent border-b border-border p-0 shrink-0">
          <TabsTrigger
            value="contact"
            className="flex-1 text-xs h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Contato
          </TabsTrigger>
          <TabsTrigger
            value="copilot"
            className="flex-1 text-xs h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Bot className="h-3.5 w-3.5 mr-1" />
            Copilot
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contact" className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            {/* Profile */}
            <div className="p-5 text-center">
              <Avatar className="h-16 w-16 mx-auto mb-3">
                <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                  {conversation.customerName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <h3 className="text-sm font-semibold text-foreground flex items-center justify-center gap-1">
                {conversation.customerName}
                <button className="text-muted-foreground hover:text-foreground">
                  <Edit2 className="h-3 w-3" />
                </button>
              </h3>
            </div>

            <Separator />

            {/* Contact details */}
            <div className="p-4 space-y-3">
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Informações do contato
              </h4>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground flex-1">{conversation.phone}</span>
                  <button onClick={() => copyToClipboard(conversation.phone)} className="text-muted-foreground hover:text-foreground">
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                {customer?.email && (
                  <div className="flex items-center gap-2.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground flex-1 truncate">{customer.email}</span>
                    <button onClick={() => copyToClipboard(customer.email!)} className="text-muted-foreground hover:text-foreground">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {customer?.created_at && (
                  <div className="flex items-center gap-2.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">Cliente desde</span>
                    <span className="text-xs text-foreground ml-auto">
                      {new Date(customer.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                )}
              </div>
              {customer?.id && (
                <Button variant="outline" size="sm" className="w-full text-xs h-8 mt-2" onClick={() => navigate("/customers")}>
                  <ExternalLink className="h-3 w-3 mr-1.5" />
                  Ver perfil completo
                </Button>
              )}
            </div>

            <Separator />

            {/* Notes / Observations */}
            {customer?.id && (
              <>
                <div className="p-4 space-y-2">
                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <StickyNote className="h-3 w-3" />
                    Observações
                  </h4>
                  <Textarea
                    placeholder="Adicione observações sobre este contato..."
                    className="text-xs min-h-[70px] resize-none"
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                  />
                  {notesDirty && (
                    <Button size="sm" className="w-full text-xs h-7" onClick={saveNotes} disabled={savingNotes}>
                      <Save className="h-3 w-3 mr-1" />
                      {savingNotes ? "Salvando..." : "Salvar observações"}
                    </Button>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Tags */}
            {customer?.tags && customer.tags.length > 0 && (
              <>
                <div className="p-4">
                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Tag className="h-3 w-3" />
                    Labels
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {customer.tags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] rounded-sm">{tag}</Badge>
                    ))}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Chat stats */}
            <div className="p-4">
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Estatísticas da conversa
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-accent/50 rounded-md p-2.5 text-center">
                  <p className="text-base font-bold text-foreground">{totalMessages}</p>
                  <p className="text-[9px] text-muted-foreground">Total</p>
                </div>
                <div className="bg-accent/50 rounded-md p-2.5 text-center">
                  <p className="text-base font-bold text-foreground">{inboundCount}</p>
                  <p className="text-[9px] text-muted-foreground">Recebidas</p>
                </div>
                <div className="bg-accent/50 rounded-md p-2.5 text-center">
                  <p className="text-base font-bold text-foreground">{outboundCount}</p>
                  <p className="text-[9px] text-muted-foreground">Enviadas</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Commerce summary */}
            {customer && (customer.total_orders || customer.total_spent) && (
              <>
                <div className="p-4">
                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <ShoppingBag className="h-3 w-3" />
                    Dados comerciais
                  </h4>
                  <div className="space-y-2">
                    {customer.total_orders != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Pedidos</span>
                        <span className="font-medium text-foreground">{customer.total_orders}</span>
                      </div>
                    )}
                    {customer.total_spent != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Total gasto</span>
                        <span className="font-semibold text-foreground">{formatCurrency(customer.total_spent)}</span>
                      </div>
                    )}
                    {customer.last_order_at && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Último pedido</span>
                        <span className="font-medium text-foreground">
                          {new Date(customer.last_order_at).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Order history */}
            <div className="p-4">
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Package className="h-3 w-3" />
                Histórico de pedidos
              </h4>
              {orders.length === 0 ? (
                <div className="text-center py-4">
                  <ShoppingBag className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-[11px] text-muted-foreground">Nenhum pedido encontrado</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders.map((order) => {
                    const info = getStatusInfo(order.status, order.mapped_status);
                    const Icon = info.icon;
                    return (
                      <div key={order.id} className="rounded-lg border border-border p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-foreground">
                            #{order.external_id?.replace("yampi_", "") || order.id.slice(0, 8)}
                          </span>
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-5 gap-1 ${info.color}`}>
                            <Icon className="h-2.5 w-2.5" />
                            {info.label}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(order.created_at).toLocaleDateString("pt-BR")}
                          </span>
                          <span className="text-xs font-semibold text-foreground">
                            {formatCurrency(order.total)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator />

            {/* Previous conversations */}
            <div className="p-4">
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Conversas anteriores
              </h4>
              <div className="text-center py-4">
                <MessageSquare className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[11px] text-muted-foreground">Nenhuma conversa anterior</p>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="copilot" className="flex-1 mt-0 overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Copilot</h3>
              <p className="text-xs text-muted-foreground">
                Assistente de IA para ajudar nas respostas. Em breve.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
