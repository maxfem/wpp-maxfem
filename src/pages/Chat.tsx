import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatMessageArea } from "@/components/chat/ChatMessageArea";
import { ChatInput } from "@/components/chat/ChatInput";
import { ContactInfoPanel } from "@/components/chat/ContactInfoPanel";
import { Message, Conversation, DateFilter, StatusFilter } from "@/components/chat/types";

const normalizePhone = (phone: string) => phone.replace(/\D/g, "");

export default function Chat() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPhoneKey, setSelectedPhoneKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [searchInChat, setSearchInChat] = useState(false);

  const tenantId = currentTenant?.id;

  // Fetch messages
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
    refetchInterval: 5000,
  });

  // Fetch customers
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-lookup", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, email, tags, total_orders, total_spent, last_order_at, created_at, custom_attributes")
        .eq("tenant_id", tenantId);
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Fetch orders for selected customer
  const selectedCustomerId = useMemo(() => {
    if (!selectedPhoneKey) return null;
    const conv = allMessages.find((m) => normalizePhone(m.phone) === selectedPhoneKey);
    return conv?.customer_id || null;
  }, [selectedPhoneKey, allMessages]);

  const { data: customerOrders = [] } = useQuery({
    queryKey: ["customer-orders", selectedCustomerId],
    queryFn: async () => {
      if (!selectedCustomerId || !tenantId) return [];
      const { data } = await supabase
        .from("orders")
        .select("id, external_id, total, status, mapped_status, created_at")
        .eq("tenant_id", tenantId)
        .eq("customer_id", selectedCustomerId)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!selectedCustomerId && !!tenantId,
  });

  // Build conversations
  // Build a map of customer attributes by phone
  const customerAttrMap = useMemo(() => {
    const map = new Map<string, any>();
    customers.forEach((c) => {
      if (c.phone) map.set(normalizePhone(c.phone), c.custom_attributes || {});
    });
    return map;
  }, [customers]);

  const conversations = useMemo(() => {
    const map = new Map<string, Conversation>();
    const customerMap = new Map<string, string>();

    customers.forEach((c) => {
      if (c.phone) customerMap.set(normalizePhone(c.phone), c.name);
    });

    for (const msg of allMessages) {
      const phoneKey = normalizePhone(msg.phone);
      const existing = map.get(phoneKey);
      const attrs = customerAttrMap.get(phoneKey) || {};

      if (!existing) {
        map.set(phoneKey, {
          phone: msg.phone,
          phoneKey,
          customerName: customerMap.get(phoneKey) || msg.phone,
          customerId: msg.customer_id,
          lastMessage: msg.content || `[${msg.message_type}]`,
          lastMessageAt: msg.created_at,
          unread: msg.direction === "inbound" && msg.status === "received" ? 1 : 0,
          lastDirection: msg.direction,
          isFavorite: !!attrs.is_favorite,
          isMuted: !!attrs.is_muted,
          isArchived: !!attrs.is_archived,
          conversationStatus: attrs.conversation_status || "open",
        });
        continue;
      }

      if (!existing.customerId && msg.customer_id) existing.customerId = msg.customer_id;
      if (existing.customerName === existing.phone && customerMap.get(phoneKey)) {
        existing.customerName = customerMap.get(phoneKey)!;
      }
      if (new Date(msg.created_at).getTime() > new Date(existing.lastMessageAt).getTime()) {
        existing.phone = msg.phone;
        existing.lastMessage = msg.content || `[${msg.message_type}]`;
        existing.lastMessageAt = msg.created_at;
        existing.lastDirection = msg.direction;
      }
      if (msg.direction === "inbound" && msg.status === "received") {
        existing.unread++;
      }
    }

    let convs = Array.from(map.values()).sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );

    if (dateFilter !== "all") {
      const now = new Date();
      const cutoff = new Date();
      if (dateFilter === "today") cutoff.setHours(0, 0, 0, 0);
      else if (dateFilter === "7days") cutoff.setDate(now.getDate() - 7);
      else if (dateFilter === "30days") cutoff.setDate(now.getDate() - 30);
      convs = convs.filter((c) => new Date(c.lastMessageAt) >= cutoff);
    }

    if (statusFilter === "unread") {
      convs = convs.filter((c) => c.unread > 0);
    }

    if (searchTerm) {
      const term = normalizePhone(searchTerm) || searchTerm.toLowerCase();
      convs = convs.filter((c) =>
        c.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        normalizePhone(c.phone).includes(term)
      );
    }

    return convs;
  }, [allMessages, customers, searchTerm, dateFilter, statusFilter]);

  const selectedMessages = useMemo(
    () =>
      allMessages
        .filter((m) => normalizePhone(m.phone) === selectedPhoneKey)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [allMessages, selectedPhoneKey]
  );

  const selectedConv = conversations.find((c) => c.phoneKey === selectedPhoneKey);

  // Get selected customer details for the contact panel
  const selectedCustomer = useMemo(() => {
    if (!selectedConv?.customerId) return null;
    return customers.find((c) => c.id === selectedConv.customerId) || null;
  }, [selectedConv, customers]);

  // Realtime
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

  // Send text message
  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!selectedPhoneKey || !tenantId) throw new Error("No conversation selected");
      const conv = conversations.find((c) => c.phoneKey === selectedPhoneKey);
      const { data, error } = await supabase.functions.invoke("whatsapp-send", {
        body: {
          phone: conv?.phone || "",
          message,
          tenant_id: tenantId,
          customer_id: conv?.customerId || null,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", tenantId] });
    },
    onError: (err) => {
      toast.error("Erro ao enviar mensagem: " + (err as Error).message);
    },
  });

  // Send media message
  const sendMediaMutation = useMutation({
    mutationFn: async ({ mediaType, mediaUrl, caption, filename }: { mediaType: string; mediaUrl: string; caption: string; filename?: string }) => {
      if (!selectedPhoneKey || !tenantId) throw new Error("No conversation selected");
      const conv = conversations.find((c) => c.phoneKey === selectedPhoneKey);
      const { data, error } = await supabase.functions.invoke("whatsapp-send", {
        body: {
          phone: conv?.phone || "",
          message: caption || undefined,
          tenant_id: tenantId,
          customer_id: conv?.customerId || null,
          media_type: mediaType,
          media_url: mediaUrl,
          filename,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", tenantId] });
      toast.success("Mídia enviada!");
    },
    onError: (err) => {
      toast.error("Erro ao enviar mídia: " + (err as Error).message);
    },
  });

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] animate-fade-in">
        <ChatSidebar
          conversations={conversations}
          selectedPhoneKey={selectedPhoneKey}
          onSelectConversation={(key) => {
            setSelectedPhoneKey(key);
            setSearchInChat(false);
          }}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />

        <div className="flex-1 flex flex-col bg-background min-w-0">
          {!selectedPhoneKey ? (
            <div className="flex-1 flex items-center justify-center bg-accent/20">
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Atendimento</h2>
                <p className="text-sm text-muted-foreground">
                  Selecione uma conversa para começar
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {conversations.length} conversas ativas
                </p>
              </div>
            </div>
          ) : (
            <>
              <ChatHeader
                conversation={selectedConv}
                showContactPanel={showContactPanel}
                onToggleContactPanel={() => setShowContactPanel(!showContactPanel)}
                onSearchInChat={() => setSearchInChat(!searchInChat)}
              />
              <ChatMessageArea
                messages={selectedMessages}
                searchInChat={searchInChat}
                onCloseSearch={() => setSearchInChat(false)}
              />
              <ChatInput
                onSend={(msg) => sendMutation.mutate(msg)}
                onSendMedia={(mediaType, mediaUrl, caption, filename) =>
                  sendMediaMutation.mutate({ mediaType, mediaUrl, caption, filename })
                }
                disabled={sendMutation.isPending || sendMediaMutation.isPending}
                tenantId={tenantId}
              />
            </>
          )}
        </div>

        {/* Contact Info Panel */}
        {showContactPanel && selectedPhoneKey && (
          <ContactInfoPanel
            conversation={selectedConv}
            messages={selectedMessages}
            customer={selectedCustomer}
            orders={customerOrders}
          />
        )}
      </div>
    </AppLayout>
  );
}
