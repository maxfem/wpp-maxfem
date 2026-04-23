export type Channel = "whatsapp" | "instagram";

export interface Message {
  id: string;
  phone: string;
  direction: string;
  message_type: string;
  content: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  customer_id: string | null;
  tenant_id: string;
  wamid: string | null;
  template_name: string | null;
  media_url: string | null;
  metadata: any;
  channel?: Channel;
  ig_account_id?: string | null;
  ig_user_id?: string | null;
  username?: string | null;
}

export interface Conversation {
  phone: string;
  phoneKey: string;
  customerName: string;
  customerId: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
  lastDirection?: string;
  isFavorite?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  conversationStatus?: "open" | "resolved" | "pending";
  channel: Channel;
  igAccountId?: string | null;
  igUserId?: string | null;
  username?: string | null;
}

export type DateFilter = "all" | "today" | "7days" | "30days";
export type StatusFilter = "all" | "unread";
export type ChannelFilter = "all" | "whatsapp" | "instagram";
export type SidebarTab = "all" | "unread";
