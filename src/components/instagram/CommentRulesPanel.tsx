import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil, Sparkles, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

interface Rule {
  id: string;
  tenant_id: string;
  ig_account_id: string;
  name: string;
  is_active: boolean;
  scope: "all" | "posts" | "lives" | "specific";
  post_ids: string[];
  keywords: string[];
  match_mode: "contains" | "exact";
  use_ai_intent: boolean;
  public_reply_text: string;
  dm_text: string;
  dm_link_url: string | null;
  cooldown_seconds: number;
  daily_limit_per_user: number;
  stats_sent: number;
  stats_dm_sent: number;
  stats_clicks: number;
}

interface IgAccountOption {
  id: string;
  username: string;
}

interface Props {
  tenantId: string;
  accounts: IgAccountOption[];
}

const emptyForm = (tenantId: string, igAccountId: string): Partial<Rule> => ({
  tenant_id: tenantId,
  ig_account_id: igAccountId,
  name: "",
  is_active: true,
  scope: "all",
  post_ids: [],
  keywords: [],
  match_mode: "contains",
  use_ai_intent: false,
  public_reply_text: "Oba @{{username}}! Te mandei o link no Direct agora 💖✨",
  dm_text: "Oi @{{username}}! 💖 Aqui está o link pra você: {{link}}\n\nQualquer dúvida é só me chamar! ✨",
  dm_link_url: "",
  cooldown_seconds: 60,
  daily_limit_per_user: 3,
});

export function CommentRulesPanel({ tenantId, accounts }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [keywordsInput, setKeywordsInput] = useState("");
  const [postIdsInput, setPostIdsInput] = useState("");

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["ig-comment-rules", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_comment_rules" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Rule[];
    },
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async (rule: Partial<Rule>) => {
      const payload = {
        ...rule,
        keywords: keywordsInput
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        post_ids:
          rule.scope === "specific"
            ? postIdsInput
                .split(/[,\n]/)
                .map((p) => p.trim())
                .filter(Boolean)
            : [],
      };
      if (rule.id) {
        const { error } = await supabase
          .from("instagram_comment_rules" as any)
          .update(payload as any)
          .eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("instagram_comment_rules" as any).insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Regra salva");
      setOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["ig-comment-rules"] });
    },
    onError: (e: any) => toast.error("Erro ao salvar", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("instagram_comment_rules" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra removida");
      queryClient.invalidateQueries({ queryKey: ["ig-comment-rules"] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from("instagram_comment_rules" as any)
        .update({ is_active: value } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ig-comment-rules"] }),
  });

  const openNew = () => {
    if (accounts.length === 0) {
      toast.error("Conecte uma conta do Instagram primeiro");
      return;
    }
    setEditing(emptyForm(tenantId, accounts[0].id));
    setKeywordsInput("");
    setPostIdsInput("");
    setOpen(true);
  };

  const openEdit = (rule: Rule) => {
    setEditing(rule);
    setKeywordsInput((rule.keywords || []).join(", "));
    setPostIdsInput((rule.post_ids || []).join("\n"));
    setOpen(true);
  };

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Conecte uma conta do Instagram para criar regras de comentário → Direct.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Regras Comentário → Direct</h3>
          <p className="text-sm text-muted-foreground">
            Quando alguém comentar uma palavra-chave, o sistema responde no comentário e envia uma mensagem no Direct com o link rastreado.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova regra
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">Carregando…</CardContent>
        </Card>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Nenhuma regra ainda. Clique em <strong>Nova regra</strong> para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const acc = accounts.find((a) => a.id === rule.ig_account_id);
            return (
              <Card key={rule.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{rule.name}</span>
                        {rule.is_active ? (
                          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                            Ativa
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pausada</Badge>
                        )}
                        {acc && <Badge variant="outline">@{acc.username}</Badge>}
                        <Badge variant="outline" className="capitalize">
                          {rule.scope === "all"
                            ? "Todos"
                            : rule.scope === "posts"
                            ? "Posts/Reels"
                            : rule.scope === "lives"
                            ? "Lives"
                            : "Posts específicos"}
                        </Badge>
                        {rule.use_ai_intent && (
                          <Badge variant="outline" className="gap-1">
                            <Sparkles className="h-3 w-3" /> IA
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        Palavras: {(rule.keywords || []).join(", ") || "—"}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" /> {rule.stats_sent} respostas
                        </span>
                        <span className="flex items-center gap-1">
                          <Send className="h-3 w-3" /> {rule.stats_dm_sent} DMs
                        </span>
                        <span>{rule.stats_clicks} cliques</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(v) => toggleActive.mutate({ id: rule.id, value: v })}
                      />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Remover regra "${rule.name}"?`)) deleteMutation.mutate(rule.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar regra" : "Nova regra Comentário → Direct"}</DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={editing.name || ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Ex: Imunofem - link de compra"
                  />
                </div>
                <div>
                  <Label>Conta Instagram</Label>
                  <Select
                    value={editing.ig_account_id}
                    onValueChange={(v) => setEditing({ ...editing, ig_account_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          @{a.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Aplicar em</Label>
                  <Select
                    value={editing.scope}
                    onValueChange={(v) => setEditing({ ...editing, scope: v as Rule["scope"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tudo (posts + lives)</SelectItem>
                      <SelectItem value="posts">Apenas posts/Reels</SelectItem>
                      <SelectItem value="lives">Apenas Lives</SelectItem>
                      <SelectItem value="specific">Posts específicos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Modo de match</Label>
                  <Select
                    value={editing.match_mode}
                    onValueChange={(v) => setEditing({ ...editing, match_mode: v as Rule["match_mode"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contém a palavra</SelectItem>
                      <SelectItem value="exact">Palavra exata</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editing.scope === "specific" && (
                <div>
                  <Label>IDs ou permalinks dos posts</Label>
                  <Textarea
                    rows={3}
                    value={postIdsInput}
                    onChange={(e) => setPostIdsInput(e.target.value)}
                    placeholder="Um por linha (ID do media do Instagram)"
                  />
                </div>
              )}

              <div>
                <Label>Palavras-chave (separadas por vírgula)</Label>
                <Input
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                  placeholder="quero, link, valor, preço, comprar"
                />
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" /> Modo IA (opcional)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Também dispara quando a IA detectar a mesma intenção, mesmo sem casar palavra exata.
                  </p>
                </div>
                <Switch
                  checked={!!editing.use_ai_intent}
                  onCheckedChange={(v) => setEditing({ ...editing, use_ai_intent: v })}
                />
              </div>

              <div>
                <Label>Resposta pública no comentário</Label>
                <Textarea
                  rows={2}
                  value={editing.public_reply_text || ""}
                  onChange={(e) => setEditing({ ...editing, public_reply_text: e.target.value })}
                  placeholder="Use {{username}} para mencionar"
                />
              </div>

              <div>
                <Label>Mensagem no Direct (DM)</Label>
                <Textarea
                  rows={4}
                  value={editing.dm_text || ""}
                  onChange={(e) => setEditing({ ...editing, dm_text: e.target.value })}
                  placeholder="Use {{username}} e {{link}}"
                />
              </div>

              <div>
                <Label>Link de destino (com UTMs adicionadas automaticamente)</Label>
                <Input
                  type="url"
                  value={editing.dm_link_url || ""}
                  onChange={(e) => setEditing({ ...editing, dm_link_url: e.target.value })}
                  placeholder="https://maxfem.com.br/products/imunofem-para-candidiase"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  O link é encurtado e rastreado em <code>wpp.maxapps.com.br/r/...</code> com UTMs <code>utm_source=instagram</code>, <code>utm_medium=comment_to_dm</code>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cooldown por usuário (segundos)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.cooldown_seconds ?? 60}
                    onChange={(e) =>
                      setEditing({ ...editing, cooldown_seconds: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <Label>Limite diário por usuário</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editing.daily_limit_per_user ?? 3}
                    onChange={(e) =>
                      setEditing({ ...editing, daily_limit_per_user: Number(e.target.value) || 1 })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <p className="text-sm font-medium">Regra ativa</p>
                <Switch
                  checked={!!editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => editing && saveMutation.mutate(editing)}
              disabled={saveMutation.isPending || !editing?.name || !editing?.public_reply_text || !editing?.dm_text}
            >
              {saveMutation.isPending ? "Salvando…" : "Salvar regra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
