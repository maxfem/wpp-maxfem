import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo, useCallback } from "react";
import { MessageSquare, MessageCircle, Radio } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatMessageArea } from "@/components/chat/ChatMessageArea";
import { ChatInput } from "@/components/chat/ChatInput";
import { ContactInfoPanel } from "@/components/chat/ContactInfoPanel";
import { InstagramCommentsView } from "@/components/chat/InstagramCommentsView";
import { InstagramLiveView } from "@/components/chat/InstagramLiveView";
import { Message, Conversation, DateFilter, StatusFilter, ChannelFilter } from "@/components/chat/types";
import { cn } from "@/lib/utils";

type ChatView = "conversations" | "comments" | "live";

const normalizePhone = (phone: string) => phone.replace(/\D/g, "");

export default function Chat() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPhoneKey, setSelectedPhoneKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [searchInChat, setSearchInChat] = useState(false);
  const [view, setView] = useState<ChatView>("conversations");

  const isMobile = useIsMobile();
  const tenantId = currentTenant?.id;

  // Detect any active Instagram Live for this tenant (drives the "Live" tab badge)
  const { data: liveActiveCount = 0 } = useQuery({
    queryKey: ["ig-live-active-count", tenantId],
    queryFn: async () => {
      if (!tenantId) return 0;
      const { count } = await supabase
        .from("instagram_accounts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .not("live_active_id", "is", null);
      return count || 0;
    },
    enabled: !!tenantId,
    refetchInterval: 20000,
  });

  // Pending IG comments count
  const { data: pendingCommentsCount = 0 } = useQuery({
    queryKey: ["ig-pending-comments-count", tenantId],
    queryFn: async () => {
      if (!tenantId) return 0;
      const { count } = await supabase
        .from("instagram_comments")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("replied", false);
      return count || 0;
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  // Fetch WhatsApp messages
  const { data: waMessages = [] } = useQuery({
    queryKey: ["whatsapp-messages", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []).map((m: any) => ({ ...m, channel: "whatsapp" as const })) as Message[];
    },
    enabled: !!tenantId,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  // Fetch Instagram DMs
  const { data: igMessages = [] } = useQuery({
    queryKey: ["instagram-messages", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("instagram_messages")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) {
        console.error("ig messages fetch:", error);
        return [];
      }
      // adapt IG msg shape to Message interface (use ig_user_id as phone-equivalent key)
      return (data || []).map((m: any) => ({
        id: m.id,
        phone: m.ig_user_id, // used as conversation key
        direction: m.direction,
        message_type: m.message_type,
        content: m.content,
        status: m.status,
        created_at: m.created_at,
        updated_at: m.updated_at,
        customer_id: m.customer_id,
        tenant_id: m.tenant_id,
        wamid: m.message_id,
        template_name: null,
        media_url: m.media_url,
        metadata: m.metadata,
        channel: "instagram" as const,
        ig_account_id: m.ig_account_id,
        ig_user_id: m.ig_user_id,
        username: m.username,
      })) as Message[];
    },
    enabled: !!tenantId,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const allMessages = useMemo(() => [...waMessages, ...igMessages], [waMessages, igMessages]);

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

  // Compute conversation key (phone for WA, ig_user_id for IG, prefixed)
  const conversationKey = (m: Message) =>
    m.channel === "instagram" ? `ig:${m.ig_user_id}` : `wa:${normalizePhone(m.phone)}`;

  // Fetch orders for selected customer
  const selectedCustomerId = useMemo(() => {
    if (!selectedPhoneKey) return null;
    const conv = allMessages.find((m) => conversationKey(m) === selectedPhoneKey);
    if (conv?.customer_id) return conv.customer_id;
    if (selectedPhoneKey.startsWith("wa:")) {
      const phoneKey = selectedPhoneKey.slice(3);
      const matched = customers.find((c) => c.phone && normalizePhone(c.phone) === phoneKey);
      return matched?.id || null;
    }
    return null;
  }, [selectedPhoneKey, allMessages, customers]);

  const { data: customerOrders = [] } = useQuery({
    queryKey: ["customer-orders", selectedCustomerId],
    queryFn: async () => {
      if (!selectedCustomerId || !tenantId) return [];
      const { data } = await supabase
        .from("orders")
        .select("id, external_id, order_number, total, status, mapped_status, status_alias, tracking_code, tracking_url, carrier, payment_summary, items_summary, created_at")
        .eq("tenant_id", tenantId)
        .eq("customer_id", selectedCustomerId)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!selectedCustomerId && !!tenantId,
  });

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
    const customerMap = new Map<string, { id: string; name: string }>();

    customers.forEach((c) => {
      if (c.phone) {
        customerMap.set(normalizePhone(c.phone), {
          id: c.id,
          name: c.name,
        });
      }
    });

    for (const msg of allMessages) {
      const key = conversationKey(msg);
      const existing = map.get(key);

      const isIG = msg.channel === "instagram";
      const phoneKeyClean = isIG ? msg.ig_user_id! : normalizePhone(msg.phone);
      const attrs = isIG ? {} : customerAttrMap.get(phoneKeyClean) || {};
      const matchedCustomer = isIG ? null : customerMap.get(phoneKeyClean);

      const displayName = isIG
        ? (msg.username ? `@${msg.username}` : `IG ${msg.ig_user_id?.slice(-6)}`)
        : (matchedCustomer?.name || msg.phone);

      if (!existing) {
        map.set(key, {
          phone: msg.phone,
          phoneKey: key,
          customerName: displayName,
          customerId: msg.customer_id || matchedCustomer?.id || null,
          lastMessage: msg.content || `[${msg.message_type}]`,
          lastMessageAt: msg.created_at,
          unread: msg.direction === "inbound" && msg.status === "received" ? 1 : 0,
          lastDirection: msg.direction,
          isFavorite: !!attrs.is_favorite,
          isMuted: !!attrs.is_muted,
          isArchived: !!attrs.is_archived,
          conversationStatus: attrs.conversation_status || "open",
          channel: isIG ? "instagram" : "whatsapp",
          igAccountId: msg.ig_account_id || null,
          igUserId: msg.ig_user_id || null,
          username: msg.username || null,
        });
        continue;
      }

      if (!existing.customerId) {
        existing.customerId = msg.customer_id || matchedCustomer?.id || null;
      }
      if (existing.customerName === existing.phone && matchedCustomer?.name) {
        existing.customerName = matchedCustomer.name;
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

    let convs = Array.from(map.values())
      .filter((c) => !c.isArchived)
      .sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );

    if (channelFilter !== "all") {
      convs = convs.filter((c) => c.channel === channelFilter);
    }

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
  }, [allMessages, customers, customerAttrMap, searchTerm, dateFilter, statusFilter, channelFilter]);

  // Channel counts for tabs
  const channelCounts = useMemo(() => {
    const all = Array.from(
      new Map(
        allMessages.map((m) => [conversationKey(m), m])
      ).values()
    );
    return {
      all: all.length,
      whatsapp: all.filter((m) => m.channel !== "instagram").length,
      instagram: all.filter((m) => m.channel === "instagram").length,
    };
  }, [allMessages]);

  const selectedMessages = useMemo(
    () =>
      allMessages
        .filter((m) => conversationKey(m) === selectedPhoneKey)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [allMessages, selectedPhoneKey]
  );

  const selectedConv = conversations.find((c) => c.phoneKey === selectedPhoneKey);

  // Get selected customer details for the contact panel
  const selectedCustomer = useMemo(() => {
    if (selectedConv?.customerId) {
      return customers.find((c) => c.id === selectedConv.customerId) || null;
    }
    if (!selectedConv) return null;
    if (selectedConv.channel === "whatsapp") {
      const phoneKey = selectedConv.phoneKey.slice(3);
      return customers.find((c) => c.phone && normalizePhone(c.phone) === phoneKey) || null;
    }
    return null;
  }, [selectedConv, customers]);

  // Realtime: WhatsApp + Instagram
  useEffect(() => {
    if (!tenantId) return;
    const waChan = supabase
      .channel("whatsapp-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages", filter: `tenant_id=eq.${tenantId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", tenantId] });
        }
      )
      .subscribe();
    const igChan = supabase
      .channel("instagram-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "instagram_messages", filter: `tenant_id=eq.${tenantId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["instagram-messages", tenantId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(waChan);
      supabase.removeChannel(igChan);
    };
  }, [tenantId, queryClient]);

  // Helper to extract structured error from edge function FunctionsHttpError
  const extractFnError = async (err: any): Promise<{ code?: string; message?: string }> => {
    try {
      const ctx = err?.context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        return { code: body?.error_code || body?.error, message: body?.message };
      }
      if (ctx && typeof ctx.text === "function") {
        const txt = await ctx.text();
        try {
          const body = JSON.parse(txt);
          return { code: body?.error_code || body?.error, message: body?.message };
        } catch {
          return { message: txt };
        }
      }
    } catch {
      // ignore
    }
    return { message: (err as Error)?.message };
  };

  const handleSendError = async (err: any) => {
    const { code, message } = await extractFnError(err);
    if (code === "WHATSAPP_24H_WINDOW_EXPIRED" || code === "window_expired") {
      toast.error("Janela de 24h expirada", {
        description:
          "Não é possível enviar mensagens livres após 24h sem resposta. Envie um template HSM aprovado para reengajar este contato.",
        duration: 8000,
        action: {
          label: "Ver templates",
          onClick: () => window.open("/templates", "_blank"),
        },
      });
      return;
    }
    toast.error("Erro ao enviar mensagem", {
      description: message || "Tente novamente em instantes.",
    });
  };

  // Send text message — routes by channel
  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!selectedPhoneKey || !tenantId || !selectedConv) throw new Error("No conversation selected");

      if (selectedConv.channel === "instagram") {
        const { data, error } = await supabase.functions.invoke("instagram-send", {
          body: {
            mode: "manual",
            tenant_id: tenantId,
            ig_account_id: selectedConv.igAccountId,
            ig_user_id: selectedConv.igUserId,
            username: selectedConv.username,
            channel: "dm",
            message,
          },
        });
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase.functions.invoke("whatsapp-send", {
        body: {
          phone: selectedConv.phone || "",
          message,
          tenant_id: tenantId,
          customer_id: selectedConv.customerId || null,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["instagram-messages", tenantId] });
    },
    onError: handleSendError,
  });

  // Send media message (WhatsApp only for now)
  const sendMediaMutation = useMutation({
    mutationFn: async ({ mediaType, mediaUrl, caption, filename }: { mediaType: string; mediaUrl: string; caption: string; filename?: string }) => {
      if (!selectedPhoneKey || !tenantId || !selectedConv) throw new Error("No conversation selected");
      if (selectedConv.channel === "instagram") {
        throw new Error("Envio de mídia em Instagram DM ainda não disponível");
      }
      const { data, error } = await supabase.functions.invoke("whatsapp-send", {
        body: {
          phone: selectedConv.phone || "",
          message: caption || undefined,
          tenant_id: tenantId,
          customer_id: selectedConv.customerId || null,
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
    onError: handleSendError,
  });

  // Update customer attributes helper
  const updateCustomerAttr = useCallback(async (customerId: string, updates: Record<string, any>) => {
    const customer = customers.find((c) => c.id === customerId);
    const attrs = (customer?.custom_attributes as Record<string, any>) || {};
    await supabase
      .from("customers")
      .update({ custom_attributes: { ...attrs, ...updates } })
      .eq("id", customerId);
    queryClient.invalidateQueries({ queryKey: ["customers-lookup", tenantId] });
  }, [customers, tenantId, queryClient]);

  const handleToggleFavorite = useCallback(() => {
    if (!selectedConv?.customerId) return;
    updateCustomerAttr(selectedConv.customerId, { is_favorite: !selectedConv.isFavorite });
    toast.success(selectedConv.isFavorite ? "Removido dos favoritos" : "Marcado como favorito");
  }, [selectedConv, updateCustomerAttr]);

  const handleToggleMute = useCallback(() => {
    if (!selectedConv?.customerId) return;
    updateCustomerAttr(selectedConv.customerId, { is_muted: !selectedConv.isMuted });
    toast.success(selectedConv.isMuted ? "Notificações reativadas" : "Conversa silenciada");
  }, [selectedConv, updateCustomerAttr]);

  const handleArchive = useCallback(() => {
    if (!selectedConv?.customerId) return;
    updateCustomerAttr(selectedConv.customerId, { is_archived: true });
    setSelectedPhoneKey(null);
    toast.success("Conversa arquivada");
  }, [selectedConv, updateCustomerAttr]);

  const handleSetStatus = useCallback((status: "open" | "resolved" | "pending") => {
    if (!selectedConv?.customerId) return;
    updateCustomerAttr(selectedConv.customerId, { conversation_status: status });
    const labels = { open: "Reaberta", resolved: "Resolvida", pending: "Marcada como pendente" };
    toast.success(`Conversa ${labels[status].toLowerCase()}`);
  }, [selectedConv, updateCustomerAttr]);

  const viewTabs: { id: ChatView; label: string; icon: typeof MessageSquare; badge?: number; live?: boolean }[] = [
    { id: "conversations", label: "Conversas", icon: MessageSquare },
    { id: "comments", label: "Comentários", icon: MessageCircle, badge: pendingCommentsCount },
    { id: "live", label: "Live", icon: Radio, badge: liveActiveCount, live: liveActiveCount > 0 },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] animate-fade-in">
        {/* View tabs (Conversas / Comentários / Live) */}
        <div className="border-b border-border bg-card px-2 flex items-center gap-1 shrink-0">
          {viewTabs.map((t) => {
            const Icon = t.icon;
            const isActive = view === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4", t.live && "text-destructive animate-pulse")} />
                {t.label}
                {t.badge && t.badge > 0 ? (
                  <span className={cn(
                    "ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold",
                    t.live ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
                  )}>
                    {t.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex flex-1 min-h-0">
          {view === "conversations" && (
            <>
              {/* Sidebar: hide on mobile when a conversation is selected */}
              {(!isMobile || !selectedPhoneKey) && (
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
                  channelFilter={channelFilter}
                  onChannelFilterChange={setChannelFilter}
                  channelCounts={channelCounts}
                  isMobile={isMobile}
                />
              )}

              {/* Chat area: on mobile only show when conversation selected */}
              {(!isMobile || selectedPhoneKey) && (
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
                      onToggleFavorite={handleToggleFavorite}
                      onToggleMute={handleToggleMute}
                      onArchive={handleArchive}
                      onSetStatus={handleSetStatus}
                      onBack={isMobile ? () => setSelectedPhoneKey(null) : undefined}
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
              )}

              {/* Contact Info Panel */}
              {showContactPanel && selectedPhoneKey && (
                <ContactInfoPanel
                  conversation={selectedConv}
                  messages={selectedMessages}
                  customer={selectedCustomer}
                  orders={customerOrders}
                />
              )}
            </>
          )}

          {view === "comments" && tenantId && (
            <InstagramCommentsView tenantId={tenantId} />
          )}

          {view === "live" && tenantId && (
            <InstagramLiveView tenantId={tenantId} />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
