import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, MessageSquare, X, Inbox, Plus, MessagesSquare,
  AtSign, UserX, FolderOpen, Users, ChevronDown, ChevronRight,
  SlidersHorizontal, Instagram
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Conversation, DateFilter, StatusFilter, SidebarTab, ChannelFilter } from "./types";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ChatSidebarProps {
  conversations: Conversation[];
  selectedPhoneKey: string | null;
  onSelectConversation: (phoneKey: string) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  dateFilter: DateFilter;
  onDateFilterChange: (value: DateFilter) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  channelFilter?: ChannelFilter;
  onChannelFilterChange?: (value: ChannelFilter) => void;
  channelCounts?: { all: number; whatsapp: number; instagram: number };
  onNewChat?: () => void;
  isMobile?: boolean;
}

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  if (d.toDateString() === yesterday.toDateString()) {
    return "Ontem";
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const navItems = [
  { id: "all", label: "Todas as conversas", icon: MessagesSquare },
  { id: "mentions", label: "Menções", icon: AtSign },
  { id: "unattended", label: "Não atendidas", icon: UserX },
];

const folderItems = [
  { id: "priority", label: "Prioritárias" },
  { id: "leads", label: "Leads Inbox" },
];

export function ChatSidebar({
  conversations,
  selectedPhoneKey,
  onSelectConversation,
  searchTerm,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  statusFilter,
  onStatusFilterChange,
  onNewChat,
  isMobile,
}: ChatSidebarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>("all");
  const [activeNav, setActiveNav] = useState("all");
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const hasActiveFilters = dateFilter !== "all" || statusFilter !== "all";

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);
  const unreadConvs = conversations.filter((c) => c.unread > 0);

  const filteredByTab = activeTab === "unread"
    ? unreadConvs
    : conversations;

  return (
    <div className={cn(
      "border-r border-border flex flex-col bg-card overflow-hidden",
      isMobile ? "w-full" : "w-[380px] min-w-[380px] shrink-0"
    )}>
      {/* Chatwoot-style header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Conversas</h2>
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
            Aberto
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowSearch(!showSearch)}
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Buscar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={hasActiveFilters ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filtros</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNewChat}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Nova conversa</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-3 pt-2 animate-fade-in">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 h-8 text-xs"
            />
            {searchTerm && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filters popover inline */}
      {showFilters && (
        <div className="px-3 pt-2 pb-1 space-y-2 animate-fade-in border-b border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Filtros</span>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] px-2"
                onClick={() => {
                  onDateFilterChange("all");
                  onStatusFilterChange("all");
                }}
              >
                Limpar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Select value={dateFilter} onValueChange={(v) => onDateFilterChange(v as DateFilter)}>
              <SelectTrigger className="h-7 text-[11px] flex-1">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7days">7 dias</SelectItem>
                <SelectItem value="30days">30 dias</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}>
              <SelectTrigger className="h-7 text-[11px] flex-1">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="unread">Não lidos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Chatwoot-style tabs: Mine / Unassigned / All */}
      <div className="border-b border-border">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SidebarTab)}>
          <TabsList className="w-full h-9 rounded-none bg-transparent border-0 p-0">
            <TabsTrigger
              value="all"
              className="flex-1 text-xs h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Minhas
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">
                {conversations.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="unread"
              className="flex-1 text-xs h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Não lidas
              {totalUnread > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 px-1 text-[9px]">
                  {totalUnread}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="all"
              className="flex-1 text-xs h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              disabled
            >
              Todas
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">
                {conversations.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Conversations list */}
      <ScrollArea className="flex-1">
        {filteredByTab.length === 0 ? (
          <div className="p-8 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {activeTab === "unread" ? "Nenhuma mensagem não lida" : "Nenhuma conversa"}
            </p>
            <p className="text-xs text-muted-foreground/60">
              {activeTab === "unread" ? "Todas as mensagens foram lidas" : "As conversas aparecerão aqui"}
            </p>
          </div>
        ) : (
          filteredByTab.map((conv) => (
            <button
              key={conv.phoneKey}
              onClick={() => onSelectConversation(conv.phoneKey)}
              className={cn(
                "w-full flex items-start gap-3 px-4 py-3 transition-all text-left border-b border-border/50",
                selectedPhoneKey === conv.phoneKey
                  ? "bg-primary/5 border-l-[3px] border-l-primary"
                  : "hover:bg-accent/50 border-l-[3px] border-l-transparent"
              )}
            >
              <div className="relative mt-0.5">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                    {conv.customerName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs text-muted-foreground">📱 WhatsApp</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap pl-1">
                    {formatTime(conv.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className={cn(
                    "text-sm truncate",
                    conv.unread > 0 ? "font-semibold text-foreground" : "font-medium text-foreground"
                  )}>
                    {conv.customerName}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className={cn(
                    "text-xs truncate pr-2",
                    conv.unread > 0 ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {conv.lastDirection === "outbound" && (
                      <span className="text-muted-foreground">↩ </span>
                    )}
                    {conv.lastMessage}
                  </p>
                  {conv.unread > 0 && (
                    <Badge className="h-4 min-w-[16px] flex items-center justify-center px-1 text-[9px] shrink-0 bg-primary text-primary-foreground rounded-full">
                      {conv.unread > 99 ? "99+" : conv.unread}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </ScrollArea>
    </div>
  );
}
