import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Conversation, Message } from "./types";
import { Phone, Mail, Tag, MessageSquare, ShoppingBag, Calendar, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  const mediaMessages = messages.filter((m) => m.media_url).length;
  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];

  return (
    <div className="w-[300px] border-l border-border bg-card flex flex-col">
      <ScrollArea className="flex-1">
        {/* Profile section */}
        <div className="p-6 text-center">
          <Avatar className="h-20 w-20 mx-auto mb-3">
            <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">
              {conversation.customerName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <h3 className="text-base font-semibold text-foreground">{conversation.customerName}</h3>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
            <Phone className="h-3 w-3" />
            {conversation.phone}
          </p>
          {customer?.email && (
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
              <Mail className="h-3 w-3" />
              {customer.email}
            </p>
          )}
          {customer?.id && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 text-xs"
              onClick={() => navigate("/customers")}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Ver perfil completo
            </Button>
          )}
        </div>

        <Separator />

        {/* Tags */}
        {customer?.tags && customer.tags.length > 0 && (
          <>
            <div className="p-4">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Tag className="h-3 w-3" />
                Tags
              </h4>
              <div className="flex flex-wrap gap-1">
                {customer.tags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">
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
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <MessageSquare className="h-3 w-3" />
            Estatísticas do chat
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-accent/50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-foreground">{totalMessages}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
            <div className="bg-accent/50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-foreground">{inboundCount}</p>
              <p className="text-[10px] text-muted-foreground">Recebidas</p>
            </div>
            <div className="bg-accent/50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-foreground">{outboundCount}</p>
              <p className="text-[10px] text-muted-foreground">Enviadas</p>
            </div>
            <div className="bg-accent/50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-foreground">{mediaMessages}</p>
              <p className="text-[10px] text-muted-foreground">Mídias</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Commerce info */}
        {customer && (customer.total_orders || customer.total_spent) && (
          <>
            <div className="p-4">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
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
                    <span className="font-medium text-foreground">
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

        {/* Timeline */}
        <div className="p-4">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            Timeline
          </h4>
          <div className="space-y-2">
            {firstMessage && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Primeira mensagem</span>
                <span className="font-medium text-foreground">
                  {new Date(firstMessage.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            )}
            {lastMessage && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Última mensagem</span>
                <span className="font-medium text-foreground">
                  {new Date(lastMessage.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            )}
            {customer?.created_at && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Cliente desde</span>
                <span className="font-medium text-foreground">
                  {new Date(customer.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
