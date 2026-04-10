import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, User, Search, MoreVertical, Star, Archive, Volume2, VolumeX, PanelRightOpen, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
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
}

export function ChatHeader({ conversation, showContactPanel, onToggleContactPanel, onSearchInChat }: ChatHeaderProps) {
  const navigate = useNavigate();

  if (!conversation) return null;

  return (
    <div className="h-16 border-b border-border flex items-center justify-between px-4 bg-card">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {conversation.customerName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {conversation.customerName}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {conversation.phone}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSearchInChat}>
              <Search className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Buscar na conversa</TooltipContent>
        </Tooltip>

        {conversation.customerId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => navigate(`/customers`)}
              >
                <User className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ver perfil</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onToggleContactPanel}
            >
              {showContactPanel ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{showContactPanel ? "Fechar painel" : "Info do contato"}</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem className="text-xs">
              <Star className="h-3.5 w-3.5 mr-2" />
              Marcar como favorito
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs">
              <VolumeX className="h-3.5 w-3.5 mr-2" />
              Silenciar conversa
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs">
              <Archive className="h-3.5 w-3.5 mr-2" />
              Arquivar conversa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
