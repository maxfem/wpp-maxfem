import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, Smile, Bold, Italic, Strikethrough, Paperclip, Mic, Zap, Image, FileText, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  onSendTemplate?: () => void;
}

const quickReplies = [
  "Olá! Como posso ajudar?",
  "Obrigado pelo contato!",
  "Vou verificar e retorno em breve.",
  "Seu pedido está sendo processado.",
  "Tem mais alguma dúvida?",
];

export function ChatInput({ onSend, disabled, onSendTemplate }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!message.trim()) return;
    onSend(message.trim());
    setMessage("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [message, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const wrapSelection = (wrapper: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = message;

    if (start === end) {
      const newText = text.slice(0, start) + wrapper + wrapper + text.slice(end);
      setMessage(newText);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + wrapper.length;
        textarea.focus();
      });
    } else {
      const selected = text.slice(start, end);
      const newText = text.slice(0, start) + wrapper + selected + wrapper + text.slice(end);
      setMessage(newText);
      requestAnimationFrame(() => {
        textarea.selectionStart = start;
        textarea.selectionEnd = end + wrapper.length * 2;
        textarea.focus();
      });
    }
  };

  const handleEmojiSelect = (emoji: { native: string }) => {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? message.length;
    const newMsg = message.slice(0, cursor) + emoji.native + message.slice(cursor);
    setMessage(newMsg);
    setShowEmoji(false);
    requestAnimationFrame(() => {
      if (textarea) {
        textarea.selectionStart = textarea.selectionEnd = cursor + emoji.native.length;
        textarea.focus();
      }
    });
  };

  const insertQuickReply = (text: string) => {
    setMessage(text);
    setShowQuickReplies(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleInput = (value: string) => {
    setMessage(value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  };

  return (
    <div className="border-t border-border bg-card">
      {/* Quick replies */}
      {showQuickReplies && (
        <div className="px-4 pt-3 pb-1 flex flex-wrap gap-1.5 animate-fade-in">
          {quickReplies.map((reply, i) => (
            <button
              key={i}
              onClick={() => insertQuickReply(reply)}
              className="text-xs px-3 py-1.5 rounded-full bg-accent text-accent-foreground hover:bg-accent/80 transition-colors border border-border"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 py-3">
        <div className="max-w-2xl mx-auto space-y-2">
          {/* Toolbar */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelection("*")} title="Negrito">
                  <Bold className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Negrito</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelection("_")}>
                  <Italic className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Itálico</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelection("~")}>
                  <Strikethrough className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tachado</TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-border mx-1" />

            {/* Attachment */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Paperclip className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem className="text-xs gap-2">
                  <Image className="h-3.5 w-3.5 text-primary" />
                  Imagem
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2">
                  <Video className="h-3.5 w-3.5 text-primary" />
                  Vídeo
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  Documento
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Quick replies toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showQuickReplies ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowQuickReplies(!showQuickReplies)}
                >
                  <Zap className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Respostas rápidas</TooltipContent>
            </Tooltip>

            <div className="flex-1" />

            {/* Emoji picker */}
            <Popover open={showEmoji} onOpenChange={setShowEmoji}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Smile className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0 border-0 shadow-xl"
                side="top"
                align="end"
              >
                <Picker
                  data={data}
                  onEmojiSelect={handleEmojiSelect}
                  theme="light"
                  locale="pt"
                  previewPosition="none"
                  skinTonePosition="none"
                  maxFrequentRows={2}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Input area */}
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              placeholder="Digite uma mensagem..."
              value={message}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 min-h-[40px] max-h-[120px] resize-none text-sm"
              rows={1}
              disabled={disabled}
            />
            {message.trim() ? (
              <Button
                size="icon"
                onClick={handleSend}
                disabled={disabled}
                className="shrink-0 h-10 w-10"
              >
                <Send className="h-4 w-4" />
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-10 w-10"
                    disabled={disabled}
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Áudio (em breve)</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
