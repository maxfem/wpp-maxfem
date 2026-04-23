import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radio, Bot, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatSP } from "@/lib/utils";

interface Props {
  tenantId: string;
}

export function InstagramLiveView({ tenantId }: Props) {
  const qc = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["ig-accounts-live", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("instagram_accounts")
        .select("id, username, live_active_id, auto_reply_lives, profile_picture_url")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      return data || [];
    },
    refetchInterval: 15000,
  });

  const liveAccounts = accounts.filter((a: any) => a.live_active_id);

  useEffect(() => {
    if (!selectedAccountId && liveAccounts.length > 0) {
      setSelectedAccountId(liveAccounts[0].id);
    }
  }, [liveAccounts, selectedAccountId]);

  const activeAccount = accounts.find((a: any) => a.id === selectedAccountId);

  const { data: comments = [] } = useQuery({
    queryKey: ["ig-live-comments", selectedAccountId, activeAccount?.live_active_id],
    queryFn: async () => {
      if (!selectedAccountId || !activeAccount?.live_active_id) return [];
      const { data } = await supabase
        .from("instagram_live_comments")
        .select("*")
        .eq("ig_account_id", selectedAccountId)
        .eq("live_id", activeAccount.live_active_id)
        .order("created_at", { ascending: false })
        .limit(200);
      return data || [];
    },
    enabled: !!selectedAccountId && !!activeAccount?.live_active_id,
    refetchInterval: 5000,
  });

  const toggleAutoReply = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!selectedAccountId) return;
      const { error } = await supabase
        .from("instagram_accounts")
        .update({ auto_reply_lives: enabled })
        .eq("id", selectedAccountId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ig-accounts-live", tenantId] });
      toast.success("Configuração atualizada");
    },
  });

  if (accounts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-accent/20">
        <div className="text-center max-w-sm px-6">
          <Radio className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="font-semibold mb-1">Nenhuma conta Instagram conectada</h3>
          <p className="text-sm text-muted-foreground">
            Conecte uma conta em Configurações → Instagram para começar a monitorar Lives.
          </p>
        </div>
      </div>
    );
  }

  if (liveAccounts.length === 0) {
    return (
      <div className="flex-1 flex flex-col bg-background">
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Radio className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Lives ao vivo</h2>
              <p className="text-xs text-muted-foreground">Nenhuma transmissão ativa no momento</p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm px-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
              Aguardando início de Live
            </div>
            <p className="text-sm text-muted-foreground">
              Quando você iniciar uma Live, os comentários aparecerão aqui em tempo real
              e o auto-piloto poderá responder automaticamente.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-destructive flex items-center justify-center animate-pulse">
            <Radio className="h-4 w-4 text-destructive-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Live ao vivo</h2>
              <Badge variant="destructive" className="text-xs animate-pulse">AO VIVO</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{comments.length} comentários</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {liveAccounts.length > 1 && (
            <Select value={selectedAccountId || ""} onValueChange={setSelectedAccountId}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {liveAccounts.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border">
            <Bot className="h-4 w-4 text-primary" />
            <Label className="text-sm cursor-pointer" htmlFor="autopilot">Auto-piloto</Label>
            <Switch
              id="autopilot"
              checked={!!activeAccount?.auto_reply_lives}
              onCheckedChange={(v) => toggleAutoReply.mutate(v)}
            />
          </div>
        </div>
      </div>

      {activeAccount?.auto_reply_lives && (
        <div className="bg-primary/5 border-b border-primary/20 px-6 py-2 text-xs text-primary flex items-center gap-2">
          <AlertCircle className="h-3 w-3" />
          Auto-piloto ATIVO — Copilot responde automaticamente com filtros de segurança (anti-spam, rate-limit).
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2 max-w-3xl mx-auto">
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aguardando comentários...
            </p>
          )}
          {comments.map((c: any) => (
            <Card key={c.id} className="p-3">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">@{c.from_username || "anon"}</span>
                  {c.auto_replied && (
                    <Badge variant="secondary" className="text-xs">
                      <Bot className="h-3 w-3 mr-1" /> Respondido auto
                    </Badge>
                  )}
                  {c.reply_status === "skipped" && (
                    <Badge variant="outline" className="text-xs">Filtrado</Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{formatSP(c.created_at, "HH:mm:ss")}</span>
              </div>
              <p className="text-sm">{c.content}</p>
              {c.reply_content && (
                <div className="mt-2 pl-3 border-l-2 border-primary/40">
                  <p className="text-xs text-muted-foreground mb-1">Resposta enviada:</p>
                  <p className="text-sm">{c.reply_content}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
