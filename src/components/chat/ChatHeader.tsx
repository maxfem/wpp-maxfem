import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, User, Search, MoreVertical, Star, Archive, VolumeX, PanelRightOpen, PanelRightClose, CheckCircle2, ChevronDown, RotateCcw, Clock, Ban, Volume2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Conversation } from "./types";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatHeaderProps {
  conversation: Conversation | undefined;
  showContactPanel?: boolean;
  onToggleContactPanel?: () => void;
  onSearchInChat?: () => void;
  onToggleFavorite?: () => void;
  onToggleMute?: () => void;
  onArchive?: () => void;
  onSetStatus?: (status: "open" | "resolved" | "pending") => void;
  onBack?: () => void;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  open: { label: "Aberta", color: "bg-blue-600 hover:bg-blue-700" },
  resolved: { label: "Resolvida", color: "bg-green-600 hover:bg-green-700" },
  pending: { label: "Pendente", color: "bg-amber-500 hover:bg-amber-600" },
};

export function ChatHeader({ conversation, showContactPanel, onToggleContactPanel, onSearchInChat, onToggleFavorite, onToggleMute, onArchive, onSetStatus, onBack }: ChatHeaderProps) {
  const navigate = useNavigate();

  if (!conversation) return null;

  const currentStatus = conversation.conversationStatus || "open";
  const statusInfo = statusLabels[currentStatus] || statusLabels.open;

  const resolveLabel = currentStatus === "resolved" ? "Reabrir" : "Resolver";

  return (
    <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-card">
      <div className="flex items-center gap-3 min-w-0">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
            {conversation.customerName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">
              {conversation.customerName}
            </p>
            {conversation.isFavorite && (
              <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
            )}
            {conversation.isMuted && (
              <VolumeX className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">
              📱 WhatsApp
            </Badge>
            <button
              onClick={onToggleContactPanel}
              className="text-xs text-primary hover:underline shrink-0"
            >
              {showContactPanel ? "Fechar detalhes" : "Ver detalhes"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSearchInChat}>
              <Search className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Buscar na conversa</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem className="text-xs gap-2" onClick={onToggleFavorite}>
              <Star className={`h-3.5 w-3.5 ${conversation.isFavorite ? "text-yellow-500 fill-yellow-500" : ""}`} />
              {conversation.isFavorite ? "Remover favorito" : "Marcar como favorito"}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2" onClick={onToggleMute}>
              {conversation.isMuted ? (
                <>
                  <Volume2 className="h-3.5 w-3.5" />
                  Reativar notificações
                </>
              ) : (
                <>
                  <VolumeX className="h-3.5 w-3.5" />
                  Silenciar conversa
                </>
              )}
            </DropdownMenuItem>
            {conversation.customerId && (
              <DropdownMenuItem className="text-xs gap-2" onClick={() => navigate("/customers")}>
                <User className="h-3.5 w-3.5" />
                Ver perfil do cliente
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs gap-2" onClick={onArchive}>
              <Archive className="h-3.5 w-3.5" />
              Arquivar conversa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className={`h-8 text-xs gap-1.5 text-white ${statusInfo.color}`}>
              {currentStatus === "resolved" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : currentStatus === "pending" ? (
                <Clock className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {currentStatus === "resolved" ? "Resolvida" : currentStatus === "pending" ? "Pendente" : "Resolver"}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {currentStatus !== "resolved" && (
              <DropdownMenuItem className="text-xs gap-2" onClick={() => onSetStatus?.("resolved")}>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                Resolver
              </DropdownMenuItem>
            )}
            {currentStatus !== "pending" && (
              <DropdownMenuItem className="text-xs gap-2" onClick={() => onSetStatus?.("pending")}>
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                Pendente
              </DropdownMenuItem>
            )}
            {currentStatus !== "open" && (
              <DropdownMenuItem className="text-xs gap-2" onClick={() => onSetStatus?.("open")}>
                <RotateCcw className="h-3.5 w-3.5 text-blue-500" />
                Reabrir
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
