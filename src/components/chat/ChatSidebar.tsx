import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, MessageSquare, Filter, X, Inbox, CircleDot, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Conversation, DateFilter, StatusFilter, SidebarTab } from "./types";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  onNewChat?: () => void;
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
}: ChatSidebarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>("all");
  const hasActiveFilters = dateFilter !== "all" || statusFilter !== "all";

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  const filteredByTab = activeTab === "unread"
    ? conversations.filter((c) => c.unread > 0)
    : conversations;

  return (
    <div className="w-[340px] border-r border-border flex flex-col bg-card">
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Conversas</h2>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {conversations.length}
          </Badge>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNewChat}>
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Nova conversa</TooltipContent>
        </Tooltip>
      </div>

      {/* Tabs */}
      <div className="px-3 pt-3">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SidebarTab)}>
          <TabsList className="w-full h-8">
            <TabsTrigger value="all" className="flex-1 text-xs h-7">
              Todas
            </TabsTrigger>
            <TabsTrigger value="unread" className="flex-1 text-xs h-7 gap-1">
              Não lidas
              {totalUnread > 0 && (
                <Badge variant="destructive" className="h-4 px-1 text-[9px] leading-none">
                  {totalUnread}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Search + Filters */}
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
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
          <Popover open={showFilters} onOpenChange={setShowFilters}>
            <PopoverTrigger asChild>
              <Button
                variant={hasActiveFilters ? "default" : "outline"}
                size="icon"
                className="h-8 w-8 shrink-0"
              >
                <Filter className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 space-y-3" align="end">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Filtros</span>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      onDateFilterChange("all");
                      onStatusFilterChange("all");
                    }}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Limpar
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Período</label>
                <Select value={dateFilter} onValueChange={(v) => onDateFilterChange(v as DateFilter)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="7days">Últimos 7 dias</SelectItem>
                    <SelectItem value="30days">Últimos 30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="unread">Não lidos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1">
            {dateFilter !== "all" && (
              <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                {dateFilter === "today" ? "Hoje" : dateFilter === "7days" ? "7 dias" : "30 dias"}
                <button onClick={() => onDateFilterChange("all")}>
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            )}
            {statusFilter !== "all" && (
              <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                Não lidos
                <button onClick={() => onStatusFilterChange("all")}>
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Conversations list */}
      <ScrollArea className="flex-1">
        {filteredByTab.length === 0 ? (
          <div className="p-8 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {activeTab === "unread" ? "Nenhuma mensagem não lida" : "Nenhuma conversa"}
            </p>
            <p className="text-xs text-muted-foreground/70">
              {activeTab === "unread" ? "Todas as mensagens foram lidas" : "As conversas aparecerão aqui"}
            </p>
          </div>
        ) : (
          filteredByTab.map((conv) => (
            <button
              key={conv.phoneKey}
              onClick={() => onSelectConversation(conv.phoneKey)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-all text-left",
                selectedPhoneKey === conv.phoneKey && "bg-accent border-l-2 border-l-primary",
                selectedPhoneKey !== conv.phoneKey && "border-l-2 border-l-transparent"
              )}
            >
              <div className="relative">
                <Avatar className="h-11 w-11 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {conv.customerName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {conv.unread > 0 && (
                  <CircleDot className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 text-primary fill-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className={cn(
                    "text-sm truncate",
                    conv.unread > 0 ? "font-semibold text-foreground" : "font-medium text-foreground"
                  )}>
                    {conv.customerName}
                  </span>
                  <span className={cn(
                    "text-[10px] shrink-0 ml-2",
                    conv.unread > 0 ? "text-primary font-medium" : "text-muted-foreground"
                  )}>
                    {formatTime(conv.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className={cn(
                    "text-xs truncate pr-2",
                    conv.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                  )}>
                    {conv.lastDirection === "outbound" && (
                      <span className="text-muted-foreground">Você: </span>
                    )}
                    {conv.lastMessage}
                  </p>
                  {conv.unread > 0 && (
                    <Badge className="h-5 min-w-[20px] flex items-center justify-center px-1.5 text-[10px] shrink-0 bg-primary text-primary-foreground">
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
