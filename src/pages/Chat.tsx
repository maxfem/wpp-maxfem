import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, Search, Phone, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  phone: string;
  direction: string;
  message_type: string;
  content: string | null;
  status: string;
  created_at: string;
  customer_id: string | null;
  tenant_id: string;
  wamid: string | null;
}

interface Conversation {
  phone: string;
  customerName: string;
  customerId: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
}

export default function Chat() {
  const { currentTenant, session } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const tenantId = currentTenant?.id;

  // Fetch all messages for conversations list
  const { data: allMessages = [] } = useQuery({
    queryKey: ["whatsapp-messages", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!tenantId,
  });

  // Fetch customers for name resolution
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-lookup", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("tenant_id", tenantId);
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Build conversations list
  const conversations: Conversation[] = (() => {
    const map = new Map<string, Conversation>();
    const customerMap = new Map<string, string>();
    customers.forEach((c) => {
      if (c.phone) customerMap.set(c.phone, c.name);
    });

    // Messages are already sorted desc
    for (const msg of allMessages) {
      if (!map.has(msg.phone)) {
        map.set(msg.phone, {
          phone: msg.phone,
          customerName: customerMap.get(msg.phone) || msg.phone,
          customerId: msg.customer_id,
          lastMessage: msg.content || `[${msg.message_type}]`,
          lastMessageAt: msg.created_at,
          unread: 0,
        });
      }
      if (msg.direction === "inbound" && msg.status === "received") {
        const conv = map.get(msg.phone)!;
        conv.unread++;
      }
    }

    let convs = Array.from(map.values());
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      convs = convs.filter(
        (c) =>
          c.customerName.toLowerCase().includes(term) ||
          c.phone.includes(term)
      );
    }
    return convs;
  })();

  // Messages for selected conversation
  const selectedMessages = allMessages
    .filter((m) => m.phone === selectedPhone)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel("whatsapp-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages", filter: `tenant_id=eq.${tenantId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", tenantId] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, queryClient]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedMessages.length]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!selectedPhone || !tenantId) throw new Error("No conversation selected");
      const selectedConv = conversations.find((c) => c.phone === selectedPhone);

      const { data, error } = await supabase.functions.invoke("whatsapp-send", {
        body: {
          phone: selectedPhone,
          message,
          tenant_id: tenantId,
          customer_id: selectedConv?.customerId || null,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", tenantId] });
    },
    onError: (err) => {
      toast.error("Erro ao enviar mensagem: " + (err as Error).message);
    },
  });

  const handleSend = () => {
    if (!newMessage.trim()) return;
    sendMutation.mutate(newMessage.trim());
  };

  const selectedConv = conversations.find((c) => c.phone === selectedPhone);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] animate-fade-in">
        {/* Conversations sidebar */}
        <div className="w-80 border-r border-border flex flex-col bg-card">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {conversations.length === 0 ? (
              <div className="p-6 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma conversa ainda</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.phone}
                  onClick={() => setSelectedPhone(conv.phone)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 hover:bg-accent/50 transition-colors text-left border-b border-border/50",
                    selectedPhone === conv.phone && "bg-accent"
                  )}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {conv.customerName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground truncate">
                        {conv.customerName}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.lastMessage}
                      </p>
                      {conv.unread > 0 && (
                        <Badge variant="default" className="h-5 w-5 flex items-center justify-center p-0 text-[10px] shrink-0">
                          {conv.unread}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-background">
          {!selectedPhone ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-lg font-medium text-foreground mb-1">WhatsApp Inbox</h2>
                <p className="text-sm text-muted-foreground">
                  Selecione uma conversa para começar
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="h-14 border-b border-border flex items-center px-4 gap-3 bg-card">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {(selectedConv?.customerName || "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {selectedConv?.customerName || selectedPhone}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {selectedPhone}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3 max-w-2xl mx-auto">
                  {selectedMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.direction === "outbound" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-2xl px-4 py-2 text-sm",
                          msg.direction === "outbound"
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted text-foreground rounded-bl-md"
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content || `[${msg.message_type}]`}</p>
                        <div className={cn(
                          "flex items-center gap-1 mt-1",
                          msg.direction === "outbound" ? "justify-end" : "justify-start"
                        )}>
                          <span className={cn(
                            "text-[10px]",
                            msg.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {formatTime(msg.created_at)}
                          </span>
                          {msg.direction === "outbound" && (
                            <span className="text-[10px] text-primary-foreground/70">
                              {msg.status === "read" ? "✓✓" : msg.status === "delivered" ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="border-t border-border p-3 bg-card">
                <div className="flex items-center gap-2 max-w-2xl mx-auto">
                  <Input
                    placeholder="Digite uma mensagem..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    className="flex-1"
                    disabled={sendMutation.isPending}
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!newMessage.trim() || sendMutation.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
