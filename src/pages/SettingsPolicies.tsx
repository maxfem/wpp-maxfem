import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Trash2, Plus, Shield, Clock, Ban, Activity } from "lucide-react";
import { localeSP } from "@/lib/utils";

const useTenantId = () => {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    supabase.from("tenant_members").select("tenant_id").eq("user_id", user.id).limit(1).single()
      .then(({ data }) => setTenantId(data?.tenant_id || null));
  }, [user]);
  return tenantId;
};

export default function SettingsPolicies() {
  const tenantId = useTenantId();
  const qc = useQueryClient();

  const { data: policy } = useQuery({
    queryKey: ["messaging_policies", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("messaging_policies").select("*").eq("tenant_id", tenantId!).maybeSingle();
      if (!data) {
        const { data: created } = await supabase.from("messaging_policies").insert({ tenant_id: tenantId! }).select().single();
        return created;
      }
      return data;
    },
  });

  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (policy) setForm(policy); }, [policy]);

  const saveMutation = useMutation({
    mutationFn: async (updates: any) => {
      const { error } = await supabase.from("messaging_policies").update(updates).eq("tenant_id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Políticas salvas com sucesso" });
      qc.invalidateQueries({ queryKey: ["messaging_policies"] });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const { data: blocklist, refetch: refetchBlock } = useQuery({
    queryKey: ["blocklist", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("contact_blocklist").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false }).limit(200);
      return data || [];
    },
  });

  const { data: waAccount } = useQuery({
    queryKey: ["wa_quality", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_accounts").select("quality_rating, messaging_limit_tier, name_status, last_quality_check_at, display_phone_number")
        .eq("tenant_id", tenantId!).maybeSingle();
      return data;
    },
  });

  const [newBlock, setNewBlock] = useState({ channel: "whatsapp", identifier: "", reason: "manual" });

  const addBlock = async () => {
    if (!newBlock.identifier.trim()) return;
    const { error } = await supabase.from("contact_blocklist").insert({
      tenant_id: tenantId!, channel: newBlock.channel, identifier: newBlock.identifier.trim(), reason: newBlock.reason,
    });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Adicionado à blocklist" }); setNewBlock({ ...newBlock, identifier: "" }); refetchBlock(); }
  };

  const removeBlock = async (id: string) => {
    await supabase.from("contact_blocklist").delete().eq("id", id);
    refetchBlock();
  };

  if (!form) return <AppLayout><div className="p-8">Carregando...</div></AppLayout>;

  const ratingColor: Record<string, string> = {
    GREEN: "bg-green-500", YELLOW: "bg-yellow-500", RED: "bg-red-500", UNKNOWN: "bg-muted",
  };

  return (
    <AppLayout>
      <div className="container max-w-5xl py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" />
            Políticas de Envio
          </h1>
          <p className="text-muted-foreground">Proteja sua conta Meta e fique em conformidade com LGPD</p>
        </div>

        {/* Quality status card */}
        {waAccount && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Saúde da conta WhatsApp
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs">Quality Rating</Label>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-3 h-3 rounded-full ${ratingColor[waAccount.quality_rating || "UNKNOWN"]}`} />
                  <span className="font-semibold">{waAccount.quality_rating || "—"}</span>
                </div>
              </div>
              <div>
                <Label className="text-xs">Tier (limite)</Label>
                <div className="font-semibold mt-1">{waAccount.messaging_limit_tier?.replace("TIER_", "") || "—"}</div>
              </div>
              <div>
                <Label className="text-xs">Nome</Label>
                <div className="font-semibold mt-1">{waAccount.name_status || "—"}</div>
              </div>
              <div>
                <Label className="text-xs">Última checagem</Label>
                <div className="text-sm mt-1">{waAccount.last_quality_check_at ? localeSP(new Date(waAccount.last_quality_check_at)) : "Aguardando"}</div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="frequency">
          <TabsList>
            <TabsTrigger value="frequency"><Clock className="w-4 h-4 mr-2" />Frequência & Horário</TabsTrigger>
            <TabsTrigger value="blocklist"><Ban className="w-4 h-4 mr-2" />Lista de Bloqueio ({blocklist?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="frequency" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Limite de mensagens por contato</CardTitle>
                <CardDescription>Evita saturar clientes e protege seu quality rating</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <Label>WhatsApp / dia</Label>
                  <Input type="number" min={1} value={form.whatsapp_max_per_day} onChange={e => setForm({ ...form, whatsapp_max_per_day: +e.target.value })} />
                </div>
                <div>
                  <Label>WhatsApp / semana</Label>
                  <Input type="number" min={1} value={form.whatsapp_max_per_week} onChange={e => setForm({ ...form, whatsapp_max_per_week: +e.target.value })} />
                </div>
                <div>
                  <Label>E-mail / dia</Label>
                  <Input type="number" min={1} value={form.email_max_per_day} onChange={e => setForm({ ...form, email_max_per_day: +e.target.value })} />
                </div>
                <div>
                  <Label>E-mail / semana</Label>
                  <Input type="number" min={1} value={form.email_max_per_week} onChange={e => setForm({ ...form, email_max_per_week: +e.target.value })} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Horário de silêncio (Quiet Hours)</CardTitle>
                <CardDescription>Não enviar mensagens em horários inadequados</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Switch checked={form.quiet_hours_enabled} onCheckedChange={v => setForm({ ...form, quiet_hours_enabled: v })} />
                  <Label>Ativar horário de silêncio</Label>
                </div>
                {form.quiet_hours_enabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Início (não enviar a partir de)</Label>
                      <Input type="time" value={form.quiet_hours_start?.slice(0,5)} onChange={e => setForm({ ...form, quiet_hours_start: e.target.value + ":00" })} />
                    </div>
                    <div>
                      <Label>Fim (voltar a enviar)</Label>
                      <Input type="time" value={form.quiet_hours_end?.slice(0,5)} onChange={e => setForm({ ...form, quiet_hours_end: e.target.value + ":00" })} />
                    </div>
                  </div>
                )}
                <div className="text-sm text-muted-foreground">Fuso: {form.timezone}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pausa global & Auto-proteção</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Pausar WhatsApp</Label>
                    <p className="text-xs text-muted-foreground">Bloqueia todos os envios automatizados</p>
                  </div>
                  <Switch checked={form.whatsapp_paused} onCheckedChange={v => setForm({ ...form, whatsapp_paused: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Pausar E-mail</Label>
                  </div>
                  <Switch checked={form.email_paused} onCheckedChange={v => setForm({ ...form, email_paused: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-pausar se quality cair para RED</Label>
                    <p className="text-xs text-muted-foreground">Recomendado — protege contra ban da Meta</p>
                  </div>
                  <Switch checked={form.auto_pause_on_red} onCheckedChange={v => setForm({ ...form, auto_pause_on_red: v })} />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : "Salvar políticas"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="blocklist" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Adicionar bloqueio manual</CardTitle>
                <CardDescription>Bloqueia o envio para um contato específico</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2 items-end flex-wrap">
                <div>
                  <Label>Canal</Label>
                  <select className="block w-32 h-10 rounded-md border border-input bg-background px-3" value={newBlock.channel} onChange={e => setNewBlock({ ...newBlock, channel: e.target.value })}>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">E-mail</option>
                    <option value="all">Todos</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <Label>Telefone ou e-mail</Label>
                  <Input value={newBlock.identifier} onChange={e => setNewBlock({ ...newBlock, identifier: e.target.value })} placeholder="5511999999999 ou email@ex.com" />
                </div>
                <Button onClick={addBlock}><Plus className="w-4 h-4 mr-1" />Adicionar</Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Canal</TableHead>
                      <TableHead>Identificador</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Adicionado em</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(blocklist || []).map(b => (
                      <TableRow key={b.id}>
                        <TableCell><Badge variant="outline">{b.channel}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{b.identifier}</TableCell>
                        <TableCell><Badge variant="secondary">{b.reason}</Badge></TableCell>
                        <TableCell className="text-xs">{localeSP(new Date(b.created_at))}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeBlock(b.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(blocklist || []).length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum contato bloqueado</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
