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
}

export type DateFilter = "all" | "today" | "7days" | "30days";
export type StatusFilter = "all" | "unread";
export type SidebarTab = "all" | "unread";
