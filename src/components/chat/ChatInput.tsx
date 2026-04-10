import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Send, Smile, Bold, Italic, Strikethrough } from "lucide-react";
import { cn } from "@/lib/utils";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!message.trim()) return;
    onSend(message.trim());
    setMessage("");
    // Reset textarea height
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
      // No selection — insert wrapper markers and place cursor between
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

  // Auto-resize textarea
  const handleInput = (value: string) => {
    setMessage(value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  };

  return (
    <div className="border-t border-border p-3 bg-card">
      <div className="max-w-2xl mx-auto space-y-2">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => wrapSelection("*")}
            title="Negrito"
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => wrapSelection("_")}
            title="Itálico"
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => wrapSelection("~")}
            title="Tachado"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </Button>
          <div className="flex-1" />
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
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!message.trim() || disabled}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
