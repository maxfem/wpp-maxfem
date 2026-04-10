import { useRef, useEffect, Fragment } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Message } from "./types";
import { Check, CheckCheck } from "lucide-react";

interface ChatMessageAreaProps {
  messages: Message[];
}

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const formatDateSeparator = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (d.toDateString() === now.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
};

/** Render WhatsApp-style formatting: *bold*, _italic_, ~strike~ */
function renderFormattedText(text: string) {
  // Simple regex-based formatting
  const parts = text.split(/(\*[^*]+\*|_[^_]+_|~[^~]+~)/g);
  return parts.map((part, i) => {
    if (part.startsWith("*") && part.endsWith("*"))
      return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (part.startsWith("_") && part.endsWith("_"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("~") && part.endsWith("~"))
      return <s key={i}>{part.slice(1, -1)}</s>;
    return part;
  });
}

function StatusIcon({ status }: { status: string }) {
  if (status === "read")
    return <CheckCheck className="h-3 w-3 text-blue-400" />;
  if (status === "delivered")
    return <CheckCheck className="h-3 w-3 text-primary-foreground/60" />;
  return <Check className="h-3 w-3 text-primary-foreground/60" />;
}

export function ChatMessageArea({ messages }: ChatMessageAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Group messages by date
  const groupedMessages: { date: string; msgs: Message[] }[] = [];
  let currentDate = "";

  for (const msg of messages) {
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msg.created_at, msgs: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].msgs.push(msg);
    }
  }

  return (
    <ScrollArea className="flex-1 p-4">
      <div className="space-y-1 max-w-2xl mx-auto">
        {groupedMessages.map((group, gi) => (
          <Fragment key={gi}>
            {/* Date separator */}
            <div className="flex items-center justify-center my-4">
              <span className="bg-muted text-muted-foreground text-[11px] px-3 py-1 rounded-full">
                {formatDateSeparator(group.date)}
              </span>
            </div>
            {group.msgs.map((msg) => {
              const isOutbound = msg.direction === "outbound";
              const isTemplate = msg.message_type === "template";
              const displayContent = isTemplate
                ? msg.content || `[Template: ${msg.template_name || msg.message_type}]`
                : msg.content || `[${msg.message_type}]`;

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex mb-1",
                    isOutbound ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                      isOutbound
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    {isTemplate && (
                      <span className={cn(
                        "text-[10px] font-medium block mb-0.5",
                        isOutbound ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}>
                        📋 Template
                      </span>
                    )}
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {renderFormattedText(displayContent)}
                    </p>
                    <div className={cn(
                      "flex items-center gap-1 mt-0.5",
                      isOutbound ? "justify-end" : "justify-start"
                    )}>
                      <span className={cn(
                        "text-[10px]",
                        isOutbound ? "text-primary-foreground/60" : "text-muted-foreground"
                      )}>
                        {formatTime(msg.created_at)}
                      </span>
                      {isOutbound && <StatusIcon status={msg.status} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </Fragment>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}
