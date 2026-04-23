import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Reply, Send, Sparkles, ExternalLink, Instagram } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatSP } from "@/lib/utils";

interface Props {
  tenantId: string;
}

type ReplyMode = "public" | "private";

export function InstagramCommentsView({ tenantId }: Props) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [activeComment, setActiveComment] = useState<any | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyMode, setReplyMode] = useState<ReplyMode>("public");
  const [aiLoading, setAiLoading] = useState(false);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["instagram-comments", tenantId, filter],
    queryFn: async () => {
      let q = supabase
        .from("instagram_comments")
        .select("*, instagram_accounts(username, profile_picture_url)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter === "pending") q = q.eq("replied", false);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!activeComment) throw new Error("nada selecionado");
      const { data, error } = await supabase.functions.invoke("instagram-send", {
        body: {
          mode: "manual",
          tenant_id: tenantId,
          ig_account_id: activeComment.ig_account_id,
          channel: replyMode === "private" ? "private_reply" : "comment",
          comment_id: activeComment.comment_id,
          message: replyText,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(replyMode === "private" ? "Resposta enviada por DM" : "Resposta publicada");
      setActiveComment(null);
      setReplyText("");
      qc.invalidateQueries({ queryKey: ["instagram-comments", tenantId] });
    },
    onError: (err: any) => {
      toast.error("Erro ao enviar", { description: err?.message });
    },
  });

  const suggestWithAI = async () => {
    if (!activeComment) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-copilot", {
        body: {
          tenant_id: tenantId,
          mode: "suggest_comment_reply",
          context: {
            channel: "instagram",
            comment: activeComment.content,
            from: activeComment.from_username,
          },
        },
      });
      if (error) throw error;
      setReplyText(data?.suggestion || data?.reply || "");
    } catch (err: any) {
      toast.error("Copilot indisponível", { description: err?.message });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
            <MessageCircle className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Comentários do Instagram</h2>
            <p className="text-xs text-muted-foreground">Posts, Reels e mídias</p>
          </div>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="all">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3 max-w-3xl mx-auto">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
          )}
          {!isLoading && comments.length === 0 && (
            <div className="text-center py-12">
              <Instagram className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhum comentário {filter === "pending" ? "pendente" : ""} no momento.
              </p>
            </div>
          )}
          {comments.map((c: any) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    @{c.from_username || "anon"}
                  </Badge>
                  {c.replied && <Badge variant="secondary" className="text-xs">Respondido</Badge>}
                  {c.parent_comment_id && (
                    <Badge variant="outline" className="text-xs">Resposta</Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{formatSP(c.created_at)}</span>
              </div>
              <p className="text-sm mb-3">{c.content || <span className="text-muted-foreground italic">[sem texto]</span>}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {c.permalink && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={c.permalink} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" /> Ver post
                    </a>
                  </Button>
                )}
                {!c.replied && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => {
                      setActiveComment(c); setReplyMode("public"); setReplyText("");
                    }}>
                      <Reply className="h-3 w-3 mr-1" /> Responder
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      setActiveComment(c); setReplyMode("private"); setReplyText("");
                    }}>
                      <Send className="h-3 w-3 mr-1" /> Responder por DM
                    </Button>
                  </>
                )}
              </div>
              {c.replied && c.reply_content && (
                <div className="mt-3 pl-3 border-l-2 border-primary/40">
                  <p className="text-xs text-muted-foreground mb-1">Sua resposta:</p>
                  <p className="text-sm">{c.reply_content}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>

      <Dialog open={!!activeComment} onOpenChange={(o) => !o && setActiveComment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {replyMode === "private" ? "Responder por DM (Send Private Reply)" : "Responder publicamente"}
            </DialogTitle>
          </DialogHeader>
          {activeComment && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Comentário de <strong>@{activeComment.from_username}</strong>:
              </div>
              <p className="text-sm bg-muted p-2 rounded">{activeComment.content}</p>
              <Textarea
                placeholder="Sua resposta..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={4}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={suggestWithAI}
                disabled={aiLoading}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                {aiLoading ? "Gerando..." : "Sugerir com Copilot"}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActiveComment(null)}>Cancelar</Button>
            <Button
              onClick={() => replyMutation.mutate()}
              disabled={!replyText.trim() || replyMutation.isPending}
            >
              {replyMutation.isPending ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
