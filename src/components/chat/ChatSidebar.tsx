import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MessageSquare, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Conversation, DateFilter, StatusFilter } from "./types";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
}

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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
}: ChatSidebarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilters = dateFilter !== "all" || statusFilter !== "all";

  return (
    <div className="w-80 border-r border-border flex flex-col bg-card">
      {/* Search */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversa..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Popover open={showFilters} onOpenChange={setShowFilters}>
            <PopoverTrigger asChild>
              <Button
                variant={hasActiveFilters ? "default" : "outline"}
                size="icon"
                className="h-9 w-9 shrink-0"
              >
                <Filter className="h-4 w-4" />
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
              <Badge variant="secondary" className="text-[10px] h-5">
                {dateFilter === "today" ? "Hoje" : dateFilter === "7days" ? "7 dias" : "30 dias"}
                <button onClick={() => onDateFilterChange("all")} className="ml-1">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            )}
            {statusFilter !== "all" && (
              <Badge variant="secondary" className="text-[10px] h-5">
                Não lidos
                <button onClick={() => onStatusFilterChange("all")} className="ml-1">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Conversations list */}
      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <div className="p-6 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.phoneKey}
              onClick={() => onSelectConversation(conv.phoneKey)}
              className={cn(
                "w-full flex items-center gap-3 p-3 hover:bg-accent/50 transition-colors text-left border-b border-border/50",
                selectedPhoneKey === conv.phoneKey && "bg-accent"
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
  );
}
