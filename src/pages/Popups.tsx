import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, Search, Edit, Trash2, Layout, List, Save, ArrowLeft, Phone, Mail, 
  CheckCircle2, XCircle, Code, Copy, Info, Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { PopupBuilder } from "@/components/templates/PopupBuilder";
import { POPUP_TEMPLATES, DEFAULT_POPUP_HTML } from "@/components/templates/popup-templates";

export default function Popups() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingPopup, setEditingPopup] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newPopupName, setNewPopupName] = useState("");
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [createNewList, setCreateNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [selectedPopupForSnippet, setSelectedPopupForSnippet] = useState<any>(null);
  const [showSnippet, setShowSnippet] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  const copySnippet = (id: string) => {
    const script = `<script src="https://poukhwsbskcvwroeqoct.supabase.co/functions/v1/popup-manager/script?id=${id}"></script>`;
    navigator.clipboard.writeText(script);
    toast.success("Script copiado para a área de transferência!");
  };

  const { data: popups = [], isLoading } = useQuery({
    queryKey: ["popups", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("popups")
        .select(`
          *,
          contact_lists (
            id,
            name
          )
        `)
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const { data: lists = [] } = useQuery({
    queryKey: ["contact_lists", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("contact_lists")
        .select("id, name")
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const createPopupMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("No tenant");
      
      let listId = selectedListId;
      
      if (createNewList && newListName) {
        const { data: list, error: listError } = await supabase
          .from("contact_lists")
          .insert({
            tenant_id: currentTenant.id,
            name: newListName,
            type: "manual"
          })
          .select("id")
          .single();
        
        if (listError) throw listError;
        listId = list.id;
      }

      const design = selectedTemplate ? selectedTemplate.design : {};
      const html = selectedTemplate ? selectedTemplate.html : DEFAULT_POPUP_HTML;

      const { data, error } = await supabase.from("popups").insert({
        tenant_id: currentTenant.id,
        name: newPopupName,
        contact_list_id: listId || null,
        is_active: true,
        settings: { delay: 2000, trigger: "timer", position: "center", showCloseButton: true, overlayClose: true },
        design: design,
        html: html,
      }).select().single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["popups"] });
      setEditingPopup(data);
      setSelectedTemplate(null);
      setIsCreating(false);
      setNewPopupName("");
      setNewListName("");
      setCreateNewList(false);
      toast.success("Pop-up criado! Agora vamos desenhá-lo.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updatePopupMutation = useMutation({
    mutationFn: async ({ id, design, html, settings, is_active }: { id: string, design?: any, html?: string, settings?: any, is_active?: boolean }) => {
      const update: any = {};
      if (design !== undefined) update.design = design;
      if (html !== undefined) update.html = html;
      if (settings !== undefined) update.settings = settings;
      if (is_active !== undefined) update.is_active = is_active;

      const { data, error } = await supabase
        .from("popups")
        .update(update)
        .eq("id", id)
        .select(`
          *,
          contact_lists (
            id,
            name
          )
        `)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      setEditingPopup(data);
      queryClient.invalidateQueries({ queryKey: ["popups"] });
      if (variables.is_active === true && variables.html !== undefined) {
        toast.success("Pop-up publicado e ativo!");
      } else if (variables.is_active !== undefined && variables.html === undefined) {
        toast.success(variables.is_active ? "Pop-up ativado!" : "Pop-up desativado!");
      } else {
        toast.success("Alterações salvas!");
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deletePopupMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("popups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["popups"] });
      toast.success("Pop-up removido!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string, is_active: boolean }) => {
      const { error } = await supabase
        .from("popups")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["popups"] });
    },
  });

  const filtered = popups.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (editingPopup) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setEditingPopup(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{editingPopup.name}</h1>
                <p className="text-sm text-muted-foreground">Editando design e gatilhos do pop-up</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={editingPopup.is_active ? "default" : "secondary"}>
                {editingPopup.is_active ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <PopupBuilder
                initialDesign={editingPopup.design}
                initialHtml={editingPopup.html}
                initialSettings={editingPopup.settings}
                isLoading={updatePopupMutation.isPending}
                onSave={({ design, html, settings }) => {
                  updatePopupMutation.mutate({ id: editingPopup.id, design, html, settings });
                }}
              />
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <List className="h-5 w-5" /> Lista de Destino
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Os leads captados por este pop-up serão adicionados à lista:
                </p>
                <div className="flex items-center gap-2 font-medium bg-muted p-3 rounded-md">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  {editingPopup.contact_lists?.name || "Nenhuma lista vinculada"}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layout className="h-5 w-5" /> Automação de Campos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">E-mail</p>
                    <p className="text-xs text-muted-foreground">Validação automática de formato</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Telefone</p>
                    <p className="text-xs text-muted-foreground">Máscara inteligente aplicada automaticamente</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gerador de Pop-ups</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Crie pop-ups para capturar leads no seu site
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={showSnippet} onOpenChange={setShowSnippet}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Instalação: {selectedPopupForSnippet?.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="bg-muted p-4 rounded-lg flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-semibold mb-1">Passo Único:</p>
                      <p>Cole o código abaixo antes do fechamento da tag <code>&lt;/body&gt;</code> das páginas onde deseja que este pop-up apareça.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Script do Pop-up</Label>
                    <div className="relative">
                      <pre className="bg-slate-950 text-slate-50 p-4 rounded-md overflow-x-auto text-xs font-mono pr-12">
                        {`<script src="https://poukhwsbskcvwroeqoct.supabase.co/functions/v1/popup-manager/script?id=${selectedPopupForSnippet?.id}"></script>`}
                      </pre>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="absolute right-2 top-2 text-slate-400 hover:text-white"
                        onClick={() => copySnippet(selectedPopupForSnippet?.id || "")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isCreating} onOpenChange={setIsCreating}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Pop-up
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar novo pop-up</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome do Pop-up</Label>
                    <Input 
                      placeholder="Ex: Pop-up de Desconto 10%" 
                      value={newPopupName}
                      onChange={(e) => setNewPopupName(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Template Base (Opcional)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {POPUP_TEMPLATES.map((tmpl) => (
                        <Button
                          key={tmpl.name}
                          type="button"
                          variant={selectedTemplate?.name === tmpl.name ? "default" : "outline"}
                          size="sm"
                          className="text-xs h-auto py-2"
                          onClick={() => setSelectedTemplate(tmpl)}
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          {tmpl.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Onde salvar os leads?</Label>
                    {!createNewList ? (
                      <div className="space-y-3">
                        <Select value={selectedListId} onValueChange={setSelectedListId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma lista existente" />
                          </SelectTrigger>
                          <SelectContent>
                            {lists.map((list: any) => (
                              <SelectItem key={list.id} value={list.id}>
                                {list.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="link" size="sm" className="px-0" onClick={() => setCreateNewList(true)}>
                          Ou criar uma nova lista
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Input placeholder="Nome da nova lista" value={newListName} onChange={(e) => setNewListName(e.target.value)} />
                        <Button variant="link" size="sm" className="px-0" onClick={() => setCreateNewList(false)}>
                          Voltar
                        </Button>
                      </div>
                    )}
                  </div>

                  <Button className="w-full" onClick={() => createPopupMutation.mutate()} disabled={createPopupMutation.isPending || !newPopupName}>
                    {createPopupMutation.isPending ? "Criando..." : "Criar e Abrir Editor"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar pop-ups..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Lista de Destino</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum pop-up encontrado</TableCell></TableRow>
                ) : (
                  filtered.map((popup: any) => (
                    <TableRow key={popup.id}>
                      <TableCell className="font-medium">{popup.name}</TableCell>
                      <TableCell>{popup.contact_lists?.name || "Nenhuma"}</TableCell>
                      <TableCell>
                        <Badge 
                          className="cursor-pointer"
                          variant={popup.is_active ? "default" : "secondary"}
                          onClick={() => toggleActiveMutation.mutate({ id: popup.id, is_active: !popup.is_active })}
                        >
                          {popup.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{new Date(popup.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="ghost" onClick={() => { setSelectedPopupForSnippet(popup); setShowSnippet(true); }}>
                            <Code className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setEditingPopup(popup)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deletePopupMutation.mutate(popup.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
