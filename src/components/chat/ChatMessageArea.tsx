import { useRef, useEffect, Fragment, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Message } from "./types";
import { Check, CheckCheck, Image, FileText, Video, Search, X, ArrowDown, Play, Download, Volume2 } from "lucide-react";
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
    if (part.startsWith("*") && part.endsWith("*")) return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (part.startsWith("_") && part.endsWith("_")) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("~") && part.endsWith("~")) return <s key={i}>{part.slice(1, -1)}</s>;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (urlRegex.test(part)) {
      return part.split(urlRegex).map((seg, j) =>
        urlRegex.test(seg) ? (
          <a key={`${i}-${j}`} href={seg} target="_blank" rel="noopener noreferrer" className="underline text-inherit opacity-90 hover:opacity-100">{seg}</a>
        ) : seg
      );
    }
    return part;
  });
}

function StatusIcon({ status }: { status: string }) {
  if (status === "read") return <CheckCheck className="h-3 w-3 text-blue-400" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3 text-primary-foreground/60" />;
  if (status === "sent") return <Check className="h-3 w-3 text-primary-foreground/60" />;
  if (status === "failed") return <span className="text-[9px] text-destructive font-medium">Falhou</span>;
  return <Check className="h-3 w-3 text-primary-foreground/60" />;
}

function MediaPreview({ msg, isOutbound }: { msg: Message; isOutbound: boolean }) {
  if (!msg.media_url) return null;

  const type = msg.message_type;

  if (type === "image") {
    return (
      <div className="mb-1 rounded-lg overflow-hidden">
        <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
          <img
            src={msg.media_url}
            alt="Imagem"
            className="max-w-full max-h-[300px] rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
            loading="lazy"
          />
        </a>
      </div>
    );
  }

  if (type === "video") {
    return (
      <div className="mb-1 rounded-lg overflow-hidden">
        <video
          src={msg.media_url}
          controls
          preload="metadata"
          className="max-w-full max-h-[300px] rounded-lg"
        >
          Seu navegador não suporta vídeo.
        </video>
      </div>
    );
  }

  if (type === "audio") {
    return (
      <div className="mb-1 flex items-center gap-2">
        <Volume2 className={cn("h-4 w-4 shrink-0", isOutbound ? "text-primary-foreground/70" : "text-muted-foreground")} />
        <audio src={msg.media_url} controls preload="metadata" className="h-8 w-full min-w-[180px]">
          Seu navegador não suporta áudio.
        </audio>
      </div>
    );
  }

  if (type === "document") {
    const filename = msg.content && !msg.content.startsWith("[") ? msg.content : "Documento";
    return (
      <a
        href={msg.media_url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "mb-1 flex items-center gap-2.5 p-2.5 rounded-lg transition-colors",
          isOutbound ? "bg-primary-foreground/10 hover:bg-primary-foreground/20" : "bg-accent/50 hover:bg-accent"
        )}
      >
        <div className={cn("h-9 w-9 rounded-md flex items-center justify-center shrink-0",
          isOutbound ? "bg-primary-foreground/20" : "bg-muted")}>
          <FileText className={cn("h-4 w-4", isOutbound ? "text-primary-foreground" : "text-muted-foreground")} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-xs font-medium truncate", isOutbound ? "text-primary-foreground" : "text-foreground")}>{filename}</p>
          <p className={cn("text-[10px]", isOutbound ? "text-primary-foreground/60" : "text-muted-foreground")}>Documento</p>
        </div>
        <Download className={cn("h-4 w-4 shrink-0", isOutbound ? "text-primary-foreground/60" : "text-muted-foreground")} />
      </a>
    );
  }

  return null;
}

export function ChatMessageArea({ messages, searchInChat, onCloseSearch }: ChatMessageAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [chatSearch, setChatSearch] = useState("");
  const [showScrollDown, setShowScrollDown] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
        <mark key={i} className="bg-accent text-accent-foreground rounded-sm px-0.5">{part}</mark>
      ) : (
        <Fragment key={i}>{renderFormattedText(part)}</Fragment>
      )
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {searchInChat && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-card border-b border-border px-4 py-2 flex items-center gap-2 animate-fade-in shadow-sm">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input autoFocus value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Buscar nesta conversa..." className="h-8 text-sm border-0 shadow-none focus-visible:ring-0 bg-transparent" />
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setChatSearch(""); onCloseSearch?.(); }}>
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
              <div className="flex items-center justify-center my-4">
                <span className="bg-muted text-muted-foreground text-[11px] px-3 py-1 rounded-full shadow-sm font-medium">
                  {formatDateSeparator(group.date)}
                </span>
              </div>
              {group.msgs.map((msg, mi) => {
                const isOutbound = msg.direction === "outbound";
                const isTemplate = msg.message_type === "template";
                const isMedia = ["image", "video", "audio", "document"].includes(msg.message_type);
                const hasMedia = !!msg.media_url;

                // For media-only messages, don't show "[image]" text
                let displayContent = "";
                if (isTemplate) {
                  displayContent = msg.content || `[Template: ${msg.template_name || msg.message_type}]`;
                } else if (isMedia && hasMedia) {
                  // Show caption if it's actual text, not a placeholder
                  const c = msg.content || "";
                  if (c && !c.startsWith("[") && c !== "Sticker") {
                    displayContent = c;
                  }
                } else {
                  displayContent = msg.content || `[${msg.message_type}]`;
                }

                const nextMsg = group.msgs[mi + 1];
                const isLastInGroup = !nextMsg || nextMsg.direction !== msg.direction;

                return (
                  <div
                    key={msg.id}
                    className={cn("flex", isLastInGroup ? "mb-2" : "mb-0.5", isOutbound ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[70%] px-3 py-2 text-sm shadow-sm relative group",
                        isOutbound ? "bg-primary text-primary-foreground" : "bg-card text-foreground border border-border",
                        isOutbound
                          ? isLastInGroup ? "rounded-2xl rounded-br-md" : "rounded-2xl"
                          : isLastInGroup ? "rounded-2xl rounded-bl-md" : "rounded-2xl",
                        // Wider for media
                        hasMedia && (msg.message_type === "image" || msg.message_type === "video") && "max-w-[55%] p-1.5"
                      )}
                    >
                      {isTemplate && (
                        <span className={cn("text-[10px] font-medium block mb-0.5", isOutbound ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          📋 Template
                        </span>
                      )}
                      <MediaPreview msg={msg} isOutbound={isOutbound} />
                      {displayContent && (
                        <p className={cn(
                          "whitespace-pre-wrap break-words leading-relaxed",
                          hasMedia && (msg.message_type === "image" || msg.message_type === "video") && "px-1.5 pb-0.5"
                        )}>
                          {chatSearch ? highlightText(displayContent) : renderFormattedText(displayContent)}
                        </p>
                      )}
                      <div className={cn(
                        "flex items-center gap-1 mt-0.5",
                        isOutbound ? "justify-end" : "justify-start",
                        hasMedia && (msg.message_type === "image" || msg.message_type === "video") && "px-1.5"
                      )}>
                        <span className={cn("text-[10px]", isOutbound ? "text-primary-foreground/60" : "text-muted-foreground")}>
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

      {showScrollDown && (
        <Button size="icon" className="absolute bottom-4 right-6 h-9 w-9 rounded-full shadow-lg" onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}>
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
