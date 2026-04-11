import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Conversation, Message } from "./types";
import {
  Phone, Mail, Tag, MessageSquare, ShoppingBag, Calendar,
  ExternalLink, Copy, MapPin, Globe, Edit2, Bot
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

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
  } | null;
}

export function ContactInfoPanel({ conversation, messages, customer }: ContactInfoPanelProps) {
  const navigate = useNavigate();
  if (!conversation) return null;

  const totalMessages = messages.length;
  const inboundCount = messages.filter((m) => m.direction === "inbound").length;
  const outboundCount = messages.filter((m) => m.direction === "outbound").length;
  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  return (
    <div className="w-[320px] border-l border-border bg-card flex flex-col">
      {/* Chatwoot-style tabs */}
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
            {/* Profile section */}
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

            {/* Contact details - Chatwoot style */}
            <div className="p-4 space-y-3">
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Informações do contato
              </h4>

              <div className="space-y-2.5">
                {/* Phone */}
                <div className="flex items-center gap-2.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground flex-1">{conversation.phone}</span>
                  <button
                    onClick={() => copyToClipboard(conversation.phone)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>

                {/* Email */}
                {customer?.email && (
                  <div className="flex items-center gap-2.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground flex-1 truncate">{customer.email}</span>
                    <button
                      onClick={() => copyToClipboard(customer.email!)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Customer since */}
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
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-8 mt-2"
                  onClick={() => navigate("/customers")}
                >
                  <ExternalLink className="h-3 w-3 mr-1.5" />
                  Ver perfil completo
                </Button>
              )}
            </div>

            <Separator />

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
                      <Badge key={i} variant="secondary" className="text-[10px] rounded-sm">
                        {tag}
                      </Badge>
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

            {/* Commerce info */}
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
                        <span className="font-semibold text-foreground">
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(customer.total_spent)}
                        </span>
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
