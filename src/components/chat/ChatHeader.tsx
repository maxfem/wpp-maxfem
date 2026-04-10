import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Conversation } from "./types";
import { useNavigate } from "react-router-dom";

interface ChatHeaderProps {
  conversation: Conversation | undefined;
}

export function ChatHeader({ conversation }: ChatHeaderProps) {
  const navigate = useNavigate();

  if (!conversation) return null;

  return (
    <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-card">
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {conversation.customerName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium text-foreground">
            {conversation.customerName}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {conversation.phone}
          </p>
        </div>
      </div>
      {conversation.customerId && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/customers`)}
          className="text-xs"
        >
          <User className="h-3.5 w-3.5 mr-1" />
          Ver perfil
        </Button>
      )}
    </div>
  );
}
