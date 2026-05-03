import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, Smile, Bold, Italic, Strikethrough, Paperclip, Mic, Zap, Image, FileText, Video, X, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ChatInputProps {
  onSend: (message: string) => void;
  onSendMedia?: (mediaType: string, mediaUrl: string, caption: string, filename?: string) => void;
  disabled?: boolean;
  onSendTemplate?: () => void;
  tenantId?: string;
  channel?: "whatsapp" | "instagram";
  pendingPixCodes?: { orderNumber?: string; code: string }[];
}

const quickReplies = [
  "Olá! Como posso ajudar?",
  "Obrigado pelo contato!",
  "Vou verificar e retorno em breve.",
  "Seu pedido está sendo processado.",
  "Tem mais alguma dúvida?",
];

const ACCEPTED_IMAGE = "image/jpeg,image/png,image/webp";
const ACCEPTED_VIDEO = "video/mp4,video/3gpp";
const ACCEPTED_DOC = "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

export function ChatInput({ onSend, onSendMedia, disabled, onSendTemplate, tenantId, channel = "whatsapp" }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ file: File; type: string; preview?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [suggesting, setSuggesting] = useState(false);

  const handleSend = useCallback(() => {
    if (pendingFile) {
      handleSendMedia();
      return;
    }
    if (!message.trim()) return;
    onSend(message.trim());
    setMessage("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [message, onSend, pendingFile]);

  const handleSendMedia = async () => {
    if (!pendingFile || !onSendMedia || !tenantId) return;
    setUploading(true);
    try {
      const ext = pendingFile.file.name.split(".").pop() || "bin";
      const filePath = `${tenantId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("whatsapp-media")
        .upload(filePath, pendingFile.file, { contentType: pendingFile.file.type, upsert: true });

      if (uploadError) throw uploadError;

      // Store the path — media will be served via signed URLs
      onSendMedia(
        pendingFile.type,
        filePath,
        message.trim(),
        pendingFile.type === "document" ? pendingFile.file.name : undefined
      );

      setPendingFile(null);
      setMessage("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Erro ao enviar arquivo");
    } finally {
      setUploading(false);
    }
  };

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
      requestAnimationFrame(() => { textarea.selectionStart = textarea.selectionEnd = start + wrapper.length; textarea.focus(); });
    } else {
      const selected = text.slice(start, end);
      const newText = text.slice(0, start) + wrapper + selected + wrapper + text.slice(end);
      setMessage(newText);
      requestAnimationFrame(() => { textarea.selectionStart = start; textarea.selectionEnd = end + wrapper.length * 2; textarea.focus(); });
    }
  };

  const handleEmojiSelect = (emoji: { native: string }) => {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? message.length;
    const newMsg = message.slice(0, cursor) + emoji.native + message.slice(cursor);
    setMessage(newMsg);
    setShowEmoji(false);
    requestAnimationFrame(() => { if (textarea) { textarea.selectionStart = textarea.selectionEnd = cursor + emoji.native.length; textarea.focus(); } });
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

  const handleFileSelect = (accept: string, mediaType: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.dataset.mediaType = mediaType;
      fileInputRef.current.click();
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mediaType = e.target.dataset.mediaType || "document";

    // Max 16MB for WhatsApp
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 16MB.");
      return;
    }

    let preview: string | undefined;
    if (mediaType === "image") {
      preview = URL.createObjectURL(file);
    }

    setPendingFile({ file, type: mediaType, preview });
    e.target.value = "";
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const removePendingFile = () => {
    if (pendingFile?.preview) URL.revokeObjectURL(pendingFile.preview);
    setPendingFile(null);
  };

  return (
    <div className="border-t border-border bg-card">
      {/* Quick replies */}
      {showQuickReplies && (
        <div className="px-4 pt-3 pb-1 flex flex-wrap gap-1.5 animate-fade-in">
          {quickReplies.map((reply, i) => (
            <button key={i} onClick={() => insertQuickReply(reply)}
              className="text-xs px-3 py-1.5 rounded-full bg-accent text-accent-foreground hover:bg-accent/80 transition-colors border border-border">
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* Pending file preview */}
      {pendingFile && (
        <div className="px-4 pt-3 animate-fade-in">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50 border border-border">
              {pendingFile.preview ? (
                <img src={pendingFile.preview} alt="Preview" className="h-16 w-16 object-cover rounded-md" />
              ) : pendingFile.type === "video" ? (
                <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center">
                  <Video className="h-6 w-6 text-muted-foreground" />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{pendingFile.file.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {(pendingFile.file.size / 1024).toFixed(0)} KB • {pendingFile.type === "image" ? "Imagem" : pendingFile.type === "video" ? "Vídeo" : "Documento"}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={removePendingFile}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChange} />

      <div className="px-4 py-3">
        <div className="max-w-2xl mx-auto space-y-2">
          {/* Toolbar */}
          <div className="flex items-center gap-0.5">
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelection("*")}><Bold className="h-3.5 w-3.5" /></Button>
            </TooltipTrigger><TooltipContent>Negrito</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelection("_")}><Italic className="h-3.5 w-3.5" /></Button>
            </TooltipTrigger><TooltipContent>Itálico</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => wrapSelection("~")}><Strikethrough className="h-3.5 w-3.5" /></Button>
            </TooltipTrigger><TooltipContent>Tachado</TooltipContent></Tooltip>

            <div className="w-px h-4 bg-border mx-1" />

            {/* Attachment */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7"><Paperclip className="h-3.5 w-3.5" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem className="text-xs gap-2" onClick={() => handleFileSelect(ACCEPTED_IMAGE, "image")}>
                  <Image className="h-3.5 w-3.5 text-primary" /> Imagem
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2" onClick={() => handleFileSelect(ACCEPTED_VIDEO, "video")}>
                  <Video className="h-3.5 w-3.5 text-primary" /> Vídeo
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2" onClick={() => handleFileSelect(ACCEPTED_DOC, "document")}>
                  <FileText className="h-3.5 w-3.5 text-primary" /> Documento
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip><TooltipTrigger asChild>
              <Button variant={showQuickReplies ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => setShowQuickReplies(!showQuickReplies)}>
                <Zap className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger><TooltipContent>Respostas rápidas</TooltipContent></Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn("h-7 w-7", suggesting && "animate-pulse text-primary")}
                  onClick={async () => {
                    if (!tenantId || suggesting) return;
                    setSuggesting(true);
                    try {
                      // Simular chamada para obter sugestão baseada no prompt específico
                      const { data, error } = await supabase.functions.invoke('ai-assistant', {
                        body: { 
                          action: 'suggest',
                          tenant_id: tenantId,
                          channel: channel,
                          // Passar contexto simplificado se necessário
                        }
                      });
                      if (error) throw error;
                      if (data?.suggestion) setMessage(data.suggestion);
                    } catch (err) {
                      console.error("AI Error:", err);
                      toast.error("Erro ao gerar sugestão");
                    } finally {
                      setSuggesting(false);
                    }
                  }}
                  disabled={disabled || suggesting}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sugerir resposta com IA ({channel === 'whatsapp' ? 'WhatsApp' : 'Instagram'})</TooltipContent>
            </Tooltip>

            <div className="flex-1" />

            <Popover open={showEmoji} onOpenChange={setShowEmoji}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7"><Smile className="h-4 w-4" /></Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-0 shadow-xl" side="top" align="end">
                <Picker data={data} onEmojiSelect={handleEmojiSelect} theme="light" locale="pt" previewPosition="none" skinTonePosition="none" maxFrequentRows={2} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Input area */}
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              placeholder={pendingFile ? "Adicione uma legenda (opcional)..." : "Digite uma mensagem..."}
              value={message}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 min-h-[40px] max-h-[120px] resize-none text-sm"
              rows={1}
              disabled={disabled || uploading}
            />
            {message.trim() || pendingFile ? (
              <Button size="icon" onClick={handleSend} disabled={disabled || uploading} className="shrink-0 h-10 w-10">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            ) : (
              <Tooltip><TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0 h-10 w-10" disabled={disabled}>
                  <Mic className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent>Áudio (em breve)</TooltipContent></Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
