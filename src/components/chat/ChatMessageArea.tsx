import { useRef, useEffect, Fragment, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Message } from "./types";
import { Check, CheckCheck, Image, FileText, Video, Search, X, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ChatMessageAreaProps {
  messages: Message[];
  searchInChat?: boolean;
  onCloseSearch?: () => void;
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

function renderFormattedText(text: string) {
  const parts = text.split(/(\*[^*]+\*|_[^_]+_|~[^~]+~)/g);
  return parts.map((part, i) => {
    if (part.startsWith("*") && part.endsWith("*"))
      return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (part.startsWith("_") && part.endsWith("_"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("~") && part.endsWith("~"))
      return <s key={i}>{part.slice(1, -1)}</s>;
    // Auto-detect links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (urlRegex.test(part)) {
      return part.split(urlRegex).map((seg, j) =>
        urlRegex.test(seg) ? (
          <a
            key={`${i}-${j}`}
            href={seg}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-inherit opacity-90 hover:opacity-100"
          >
            {seg}
          </a>
        ) : (
          seg
        )
      );
    }
    return part;
  });
}

function StatusIcon({ status }: { status: string }) {
  if (status === "read")
    return <CheckCheck className="h-3 w-3 text-blue-400" />;
  if (status === "delivered")
    return <CheckCheck className="h-3 w-3 text-primary-foreground/60" />;
  if (status === "sent")
    return <Check className="h-3 w-3 text-primary-foreground/60" />;
  if (status === "failed")
    return <span className="text-[9px] text-destructive font-medium">Falhou</span>;
  return <Check className="h-3 w-3 text-primary-foreground/60" />;
}

function MediaPreview({ msg, isOutbound }: { msg: Message; isOutbound: boolean }) {
  if (!msg.media_url) return null;

  const type = msg.message_type;
  if (type === "image") {
    return (
      <div className="mb-1 rounded-lg overflow-hidden">
        <img src={msg.media_url} alt="Imagem" className="max-w-full rounded-lg" loading="lazy" />
      </div>
    );
  }
  if (type === "video") {
    return (
      <div className="mb-1 flex items-center gap-2 p-2 rounded-lg bg-black/10">
        <Video className="h-5 w-5" />
        <span className="text-xs">Vídeo</span>
      </div>
    );
  }
  if (type === "document") {
    return (
      <a
        href={msg.media_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-1 flex items-center gap-2 p-2 rounded-lg bg-black/5 hover:bg-black/10 transition-colors"
      >
        <FileText className="h-5 w-5" />
        <span className="text-xs underline">Documento</span>
      </a>
    );
  }
  return null;
}

export function ChatMessageArea({ messages, searchInChat, onCloseSearch }: ChatMessageAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [chatSearch, setChatSearch] = useState("");
  const [showScrollDown, setShowScrollDown] = useState(false);

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

  const highlightText = (text: string) => {
    if (!chatSearch) return renderFormattedText(text);
    const regex = new RegExp(`(${chatSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-accent text-accent-foreground rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        <Fragment key={i}>{renderFormattedText(part)}</Fragment>
      )
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* In-chat search bar */}
      {searchInChat && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-card border-b border-border px-4 py-2 flex items-center gap-2 animate-fade-in shadow-sm">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            placeholder="Buscar nesta conversa..."
            className="h-8 text-sm border-0 shadow-none focus-visible:ring-0 bg-transparent"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => {
            setChatSearch("");
            onCloseSearch?.();
          }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-1 max-w-2xl mx-auto">
          {messages.length === 0 && (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Image className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Nenhuma mensagem nesta conversa</p>
              </div>
            </div>
          )}
          {groupedMessages.map((group, gi) => (
            <Fragment key={gi}>
              {/* Date separator */}
              <div className="flex items-center justify-center my-4">
                <span className="bg-muted text-muted-foreground text-[11px] px-3 py-1 rounded-full shadow-sm font-medium">
                  {formatDateSeparator(group.date)}
                </span>
              </div>
              {group.msgs.map((msg, mi) => {
                const isOutbound = msg.direction === "outbound";
                const isTemplate = msg.message_type === "template";
                const displayContent = isTemplate
                  ? msg.content || `[Template: ${msg.template_name || msg.message_type}]`
                  : msg.content || `[${msg.message_type}]`;

                // Check if next message is same direction for grouping
                const nextMsg = group.msgs[mi + 1];
                const isLastInGroup = !nextMsg || nextMsg.direction !== msg.direction;

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      isLastInGroup ? "mb-2" : "mb-0.5",
                      isOutbound ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[70%] px-3 py-2 text-sm shadow-sm relative group",
                        isOutbound
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-foreground border border-border",
                        // Rounded corners based on grouping
                        isOutbound
                          ? isLastInGroup
                            ? "rounded-2xl rounded-br-md"
                            : "rounded-2xl"
                          : isLastInGroup
                            ? "rounded-2xl rounded-bl-md"
                            : "rounded-2xl"
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
                      <MediaPreview msg={msg} isOutbound={isOutbound} />
                      {displayContent && (
                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                          {chatSearch ? highlightText(displayContent) : renderFormattedText(displayContent)}
                        </p>
                      )}
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

      {/* Scroll to bottom button */}
      {showScrollDown && (
        <Button
          size="icon"
          className="absolute bottom-4 right-6 h-9 w-9 rounded-full shadow-lg"
          onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
