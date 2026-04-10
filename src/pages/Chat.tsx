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
import { Message, Conversation, DateFilter, StatusFilter } from "@/components/chat/types";

const normalizePhone = (phone: string) => phone.replace(/\D/g, "");

export default function Chat() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPhoneKey, setSelectedPhoneKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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
        .select("id, name, phone")
        .eq("tenant_id", tenantId);
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Build conversations
  const conversations = useMemo(() => {
    const map = new Map<string, Conversation>();
    const customerMap = new Map<string, string>();

    customers.forEach((c) => {
      if (c.phone) customerMap.set(normalizePhone(c.phone), c.name);
    });

    for (const msg of allMessages) {
      const phoneKey = normalizePhone(msg.phone);
      const existing = map.get(phoneKey);

      if (!existing) {
        map.set(phoneKey, {
          phone: msg.phone,
          phoneKey,
          customerName: customerMap.get(phoneKey) || msg.phone,
          customerId: msg.customer_id,
          lastMessage: msg.content || `[${msg.message_type}]`,
          lastMessageAt: msg.created_at,
          unread: msg.direction === "inbound" && msg.status === "received" ? 1 : 0,
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
      }
      if (msg.direction === "inbound" && msg.status === "received") {
        existing.unread++;
      }
    }

    let convs = Array.from(map.values()).sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );

    // Apply date filter
    if (dateFilter !== "all") {
      const now = new Date();
      const cutoff = new Date();
      if (dateFilter === "today") cutoff.setHours(0, 0, 0, 0);
      else if (dateFilter === "7days") cutoff.setDate(now.getDate() - 7);
      else if (dateFilter === "30days") cutoff.setDate(now.getDate() - 30);
      convs = convs.filter((c) => new Date(c.lastMessageAt) >= cutoff);
    }

    // Apply status filter
    if (statusFilter === "unread") {
      convs = convs.filter((c) => c.unread > 0);
    }

    // Apply search
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

  // Send message
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

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] animate-fade-in">
        <ChatSidebar
          conversations={conversations}
          selectedPhoneKey={selectedPhoneKey}
          onSelectConversation={setSelectedPhoneKey}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />

        <div className="flex-1 flex flex-col bg-background">
          {!selectedPhoneKey ? (
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
              <ChatHeader conversation={selectedConv} />
              <ChatMessageArea messages={selectedMessages} />
              <ChatInput
                onSend={(msg) => sendMutation.mutate(msg)}
                disabled={sendMutation.isPending}
              />
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
