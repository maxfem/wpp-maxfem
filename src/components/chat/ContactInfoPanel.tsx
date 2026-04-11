import { useState, useEffect } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Conversation, Message } from "./types";
import {
  Phone, Mail, Tag, MessageSquare, ShoppingBag, Calendar,
  ExternalLink, Copy, Edit2, Bot, StickyNote, Save, Package,
  CheckCircle2, XCircle, Clock, CreditCard, Truck, RotateCcw,
  Sparkles, Loader2, AlertCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

function CopilotTab({
  conversation,
  messages,
  customer,
}: {
  conversation: Conversation | undefined;
  messages: Message[];
  customer: ContactInfoPanelProps["customer"];
}) {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [aiEnabled, setAiEnabled] = useState(true);
  const [toneOverride, setToneOverride] = useState("default");
  const [extraContext, setExtraContext] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAiEnabled, setSavedAiEnabled] = useState(true);
  const [savedTone, setSavedTone] = useState("default");
  const [savedContext, setSavedContext] = useState("");

  const { data: openaiIntegration } = useQuery({
    queryKey: ["integration-openai", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("provider", "openai")
        .eq("is_active", true)
        .maybeSingle();
      return data;
    },
    enabled: !!currentTenant,
  });

  // Load per-conversation settings from customer attributes
  useEffect(() => {
    const attrs = customer?.custom_attributes || {};
    const enabled = attrs.ai_enabled !== false;
    const tone = attrs.ai_tone || "default";
    const context = attrs.ai_context || "";
    setAiEnabled(enabled);
    setToneOverride(tone);
    setExtraContext(context);
    setSavedAiEnabled(enabled);
    setSavedTone(tone);
    setSavedContext(context);
  }, [customer?.id, customer?.custom_attributes]);

  const isDirty = aiEnabled !== savedAiEnabled || toneOverride !== savedTone || extraContext !== savedContext;

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await savePerConversationSettings({
        ai_enabled: aiEnabled,
        ai_tone: toneOverride,
        ai_context: extraContext,
      });
      setSavedAiEnabled(aiEnabled);
      setSavedTone(toneOverride);
      setSavedContext(extraContext);
      toast.success("Configurações salvas!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  const savePerConversationSettings = async (updates: Record<string, any>) => {
    if (!currentTenant?.id || !conversation?.phone) {
      throw new Error("Não foi possível identificar o contato desta conversa.");
    }

    let targetCustomerId = customer?.id || null;
    let currentAttrs = (customer?.custom_attributes as Record<string, any>) || {};

    if (!targetCustomerId) {
      const normalizedPhone = conversation.phone.replace(/\D/g, "");
      const phoneVariants = Array.from(
        new Set(
          normalizedPhone.startsWith("55") && normalizedPhone.length >= 12
            ? [normalizedPhone, `+${normalizedPhone}`, normalizedPhone.slice(2), `+${normalizedPhone.slice(2)}`]
            : [normalizedPhone, `+${normalizedPhone}`, `55${normalizedPhone}`, `+55${normalizedPhone}`]
        )
      );

      const { data: matchedCustomer, error: lookupError } = await supabase
        .from("customers")
        .select("id, custom_attributes")
        .eq("tenant_id", currentTenant.id)
        .or(phoneVariants.map((phone) => `phone.eq.${phone}`).join(","))
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!matchedCustomer?.id) {
        throw new Error("Esse contato ainda não está vinculado a um cliente para salvar a configuração.");
      }

      targetCustomerId = matchedCustomer.id;
      currentAttrs = (matchedCustomer.custom_attributes as Record<string, any>) || {};
    }

    const { error } = await supabase
      .from("customers")
      .update({ custom_attributes: { ...currentAttrs, ...updates } })
      .eq("id", targetCustomerId);

    if (error) throw error;

    await queryClient.invalidateQueries({ queryKey: ["customers-lookup", currentTenant.id] });
  };

  const handleSuggest = async () => {
    if (!currentTenant || !messages.length) return;
    setLoading(true);
    setSuggestion("");
    try {
      const { data, error } = await supabase.functions.invoke("ai-copilot", {
        body: {
          tenant_id: currentTenant.id,
          messages: messages.slice(-20).map((m) => ({
            direction: m.direction,
            content: m.content,
            message_type: m.message_type,
          })),
          conversation_context: extraContext || undefined,
          tone_override: toneOverride !== "default" ? toneOverride : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSuggestion(data.suggestion || "Sem sugestão disponível.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar sugestão");
    } finally {
      setLoading(false);
    }
  };

  const isConfigured = !!openaiIntegration;

  if (!isConfigured) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1">OpenAI não configurada</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Configure a integração OpenAI para usar o assistente de IA.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => window.location.href = "/settings/integrations/openai"}
          >
            Configurar OpenAI
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Toggle AI for this conversation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground">IA nesta conversa</span>
          </div>
          <Switch
            checked={aiEnabled}
            onCheckedChange={(v) => setAiEnabled(v)}
          />
        </div>

        <Separator />

        {aiEnabled && (
          <>
            {/* Tone override */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Tom nesta conversa
              </label>
              <Select
                value={toneOverride}
                onValueChange={(v) => setToneOverride(v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Padrão (configuração global)</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="friendly">Amigável</SelectItem>
                  <SelectItem value="informal">Informal</SelectItem>
                  <SelectItem value="technical">Técnico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Extra context */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Contexto da conversa
              </label>
              <Textarea
                value={extraContext}
                onChange={(e) => setExtraContext(e.target.value)}
                placeholder="Ex: Cliente VIP, priorizar atendimento..."
                className="text-xs min-h-[60px] resize-none"
              />
            </div>

            {/* Save button */}
            <Button
              variant={isDirty ? "default" : "outline"}
              className="w-full text-xs"
              onClick={handleSaveSettings}
              disabled={!isDirty || saving}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1.5" />
              )}
              {saving ? "Salvando..." : isDirty ? "Salvar configurações" : "Configurações salvas"}
            </Button>

            <Separator />

            {/* Suggest button */}
            <Button
              className="w-full text-xs"
              onClick={handleSuggest}
              disabled={loading || !messages.length}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              {loading ? "Gerando sugestão..." : "Sugerir resposta"}
            </Button>

            {/* Suggestion result */}
            {suggestion && (
              <div className="space-y-2">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-xs text-foreground whitespace-pre-wrap">{suggestion}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-7"
                  onClick={() => {
                    navigator.clipboard.writeText(suggestion);
                    toast.success("Sugestão copiada!");
                  }}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copiar sugestão
                </Button>
              </div>
            )}
          </>
        )}

        {!aiEnabled && (
          <div className="text-center py-4">
            <Bot className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[11px] text-muted-foreground">IA desativada nesta conversa</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

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
          <CopilotTab conversation={conversation} messages={messages} customer={customer} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
