import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus,
  FileText,
  Pencil,
  Trash2,
  Eye,
  MessageSquare,
  Upload,
  Loader2,
} from "lucide-react";
import type { Json } from "@/integrations/supabase/types";
import { WhatsAppPhonePreview } from "@/components/WhatsAppPhonePreview";

interface TemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

interface TemplateForm {
  name: string;
  category: string;
  language: string;
  header_type: string;
  header_content: string;
  body: string;
  footer: string;
  buttons: TemplateButton[];
}

const emptyForm: TemplateForm = {
  name: "",
  category: "marketing",
  language: "pt_BR",
  header_type: "none",
  header_content: "",
  body: "",
  footer: "",
  buttons: [],
};

const categoryLabels: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utilidade",
  authentication: "Autenticação",
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  pending: { label: "Pendente", variant: "outline" },
  approved: { label: "Aprovado", variant: "default" },
  rejected: { label: "Rejeitado", variant: "destructive" },
};

const languageLabels: Record<string, string> = {
  pt_BR: "Português (BR)",
  en_US: "Inglês (US)",
  es: "Espanhol",
};

export default function MessageTemplates() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateForm>(emptyForm);

  const tenantId = currentTenant?.id;

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["message-templates", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: TemplateForm) => {
      if (!tenantId) throw new Error("Tenant não encontrado");
      const payload = {
        tenant_id: tenantId,
        name: values.name,
        category: values.category,
        language: values.language,
        header_type: values.header_type,
        header_content: values.header_content || null,
        body: values.body,
        footer: values.footer || null,
        buttons: values.buttons as unknown as Json,
      };

      if (editingId) {
        const { error } = await supabase
          .from("message_templates")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("message_templates")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
      toast.success(editingId ? "Template atualizado!" : "Template criado!");
      closeDialog();
    },
    onError: (err: Error) => {
      toast.error("Erro ao salvar: " + err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("message_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
      toast.success("Template excluído!");
    },
    onError: (err: Error) => {
      toast.error("Erro ao excluir: " + err.message);
    },
  });

  const submitToMetaMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error("Tenant não encontrado");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-template`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ template_id: id, tenant_id: tenantId }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        const detail = result.details?.error?.message || result.error || "Erro desconhecido";
        throw new Error(detail);
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
      toast.success(`Template enviado à Meta! Status: ${result.status || "PENDING"}`);
    },
    onError: (err: Error) => {
      toast.error("Erro ao enviar à Meta: " + err.message);
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const openEdit = (template: (typeof templates)[0]) => {
    setEditingId(template.id);
    setForm({
      name: template.name,
      category: template.category,
      language: template.language,
      header_type: template.header_type || "none",
      header_content: template.header_content || "",
      body: template.body,
      footer: template.footer || "",
      buttons: (template.buttons as unknown as TemplateButton[]) || [],
    });
    setDialogOpen(true);
  };

  const openPreview = (template: (typeof templates)[0]) => {
    setPreviewTemplate({
      name: template.name,
      category: template.category,
      language: template.language,
      header_type: template.header_type || "none",
      header_content: template.header_content || "",
      body: template.body,
      footer: template.footer || "",
      buttons: (template.buttons as unknown as TemplateButton[]) || [],
    });
    setPreviewOpen(true);
  };

  const addButton = () => {
    if (form.buttons.length >= 3) return;
    setForm((f) => ({
      ...f,
      buttons: [...f.buttons, { type: "QUICK_REPLY", text: "" }],
    }));
  };

  const updateButton = (index: number, field: string, value: string) => {
    setForm((f) => {
      const buttons = [...f.buttons];
      buttons[index] = { ...buttons[index], [field]: value };
      return { ...f, buttons };
    });
  };

  const removeButton = (index: number) => {
    setForm((f) => ({
      ...f,
      buttons: f.buttons.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) {
      toast.error("Nome e corpo são obrigatórios");
      return;
    }
    saveMutation.mutate(form);
  };

  // Count variables in body like {{1}}, {{2}}
  const variableCount = (form.body.match(/\{\{\d+\}\}/g) || []).length;

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Templates de Mensagem
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Crie e gerencie modelos de mensagem (HSM) para envio via WhatsApp
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button onClick={() => { setForm(emptyForm); setEditingId(null); }}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Editar Template" : "Criar Template"}
                </DialogTitle>
                <DialogDescription>
                  Defina o conteúdo do seu modelo de mensagem. Use {"{{1}}"}, {"{{2}}"} etc. para variáveis no corpo.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome do template</Label>
                    <Input
                      placeholder="ex: boas_vindas_cliente"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Apenas letras minúsculas, números e _
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="utility">Utilidade</SelectItem>
                        <SelectItem value="authentication">Autenticação</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Idioma</Label>
                    <Select value={form.language} onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt_BR">Português (BR)</SelectItem>
                        <SelectItem value="en_US">Inglês (US)</SelectItem>
                        <SelectItem value="es">Espanhol</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Cabeçalho</Label>
                    <Select value={form.header_type} onValueChange={(v) => setForm((f) => ({ ...f, header_type: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        <SelectItem value="text">Texto</SelectItem>
                        <SelectItem value="image">Imagem</SelectItem>
                        <SelectItem value="video">Vídeo</SelectItem>
                        <SelectItem value="document">Documento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.header_type === "text" && (
                  <div className="space-y-2">
                    <Label>Texto do cabeçalho</Label>
                    <Input
                      placeholder="Título da mensagem"
                      value={form.header_content}
                      onChange={(e) => setForm((f) => ({ ...f, header_content: e.target.value }))}
                      maxLength={60}
                    />
                    <p className="text-xs text-muted-foreground">{form.header_content.length}/60 caracteres</p>
                  </div>
                )}

                {(form.header_type === "image" || form.header_type === "video" || form.header_type === "document") && (
                  <div className="space-y-2">
                    <Label>URL da mídia (exemplo)</Label>
                    <Input
                      placeholder="https://..."
                      value={form.header_content}
                      onChange={(e) => setForm((f) => ({ ...f, header_content: e.target.value }))}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Corpo da mensagem *</Label>
                  <Textarea
                    placeholder="Olá {{1}}, sua compra #{{2}} foi confirmada!"
                    value={form.body}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                    rows={5}
                    maxLength={1024}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{variableCount} variável(is) detectada(s)</span>
                    <span>{form.body.length}/1024</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Rodapé (opcional)</Label>
                  <Input
                    placeholder="Martz CRM"
                    value={form.footer}
                    onChange={(e) => setForm((f) => ({ ...f, footer: e.target.value }))}
                    maxLength={60}
                  />
                </div>

                {/* Buttons */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Botões (máx. 3)</Label>
                    {form.buttons.length < 3 && (
                      <Button type="button" variant="outline" size="sm" onClick={addButton}>
                        <Plus className="h-3 w-3 mr-1" /> Adicionar
                      </Button>
                    )}
                  </div>
                  {form.buttons.map((btn, i) => (
                    <div key={i} className="flex items-center gap-2 p-3 border border-border rounded-md bg-secondary/30">
                      <Select value={btn.type} onValueChange={(v) => updateButton(i, "type", v)}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="QUICK_REPLY">Resposta rápida</SelectItem>
                          <SelectItem value="URL">Link</SelectItem>
                          <SelectItem value="PHONE_NUMBER">Telefone</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Texto do botão"
                        value={btn.text}
                        onChange={(e) => updateButton(i, "text", e.target.value)}
                        maxLength={25}
                        className="flex-1"
                      />
                      {btn.type === "URL" && (
                        <Input
                          placeholder="https://..."
                          value={btn.url || ""}
                          onChange={(e) => updateButton(i, "url", e.target.value)}
                          className="flex-1"
                        />
                      )}
                      {btn.type === "PHONE_NUMBER" && (
                        <Input
                          placeholder="+5511999..."
                          value={btn.phone_number || ""}
                          onChange={(e) => updateButton(i, "phone_number", e.target.value)}
                          className="flex-1"
                        />
                      )}
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeButton(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Salvando..." : editingId ? "Atualizar" : "Criar Template"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden bg-transparent border-none shadow-none">
            <DialogHeader className="sr-only">
              <DialogTitle>Pré-visualização</DialogTitle>
            </DialogHeader>
            {/* Phone Frame */}
            <div className="mx-auto w-[320px]">
              <div className="rounded-[2.5rem] border-[6px] border-gray-800 bg-gray-800 shadow-2xl overflow-hidden">
                {/* Status bar */}
                <div className="bg-[#075e54] h-6 flex items-center justify-center">
                  <div className="w-16 h-3 bg-gray-900 rounded-full" />
                </div>
                {/* WhatsApp Header */}
                <div className="bg-[#075e54] px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#25d366]/30 flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm leading-tight">{currentTenant?.name || "Empresa"}</p>
                    <p className="text-green-200 text-xs">online</p>
                  </div>
                </div>
                {/* Chat Area */}
                <div
                  className="min-h-[380px] p-4 flex flex-col justify-end"
                  style={{
                    backgroundColor: "#e5ddd5",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8c3ba' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                  }}
                >
                  <div className="max-w-[240px]">
                    {/* Message Bubble */}
                    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                      {/* Header media */}
                      {previewTemplate.header_type === "text" && previewTemplate.header_content && (
                        <div className="px-3 pt-3">
                          <p className="font-semibold text-sm text-gray-900">{previewTemplate.header_content}</p>
                        </div>
                      )}
                      {previewTemplate.header_type === "image" && (
                        <div className="bg-gray-200 h-36 flex items-center justify-center">
                          <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
                        </div>
                      )}
                      {previewTemplate.header_type === "video" && (
                        <div className="bg-gray-200 h-36 flex items-center justify-center">
                          <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" /></svg>
                        </div>
                      )}
                      {previewTemplate.header_type === "document" && (
                        <div className="bg-gray-200 h-20 flex items-center justify-center gap-2">
                          <FileText className="h-8 w-8 text-gray-400" />
                          <span className="text-xs text-gray-500">Documento</span>
                        </div>
                      )}
                      {/* Body */}
                      <div className="px-3 py-2">
                        <p className="text-[13px] text-gray-900 whitespace-pre-wrap leading-relaxed">
                          {previewTemplate.body || "Corpo da mensagem..."}
                        </p>
                      </div>
                      {/* Footer */}
                      {previewTemplate.footer && (
                        <div className="px-3 pb-2">
                          <p className="text-[11px] text-gray-500 italic">{previewTemplate.footer}</p>
                        </div>
                      )}
                    </div>
                    {/* Buttons */}
                    {previewTemplate.buttons.length > 0 && (
                      <div className="mt-1 space-y-[2px]">
                        {previewTemplate.buttons.map((btn, i) => (
                          <div
                            key={i}
                            className="bg-white rounded-lg py-2 text-center text-[13px] text-[#00a5f4] font-medium shadow-sm flex items-center justify-center gap-1.5"
                          >
                            {btn.type === "URL" && (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6h6m0 0v6m0-6L9.75 14.25" /></svg>
                            )}
                            {btn.type === "PHONE_NUMBER" && (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                            )}
                            {btn.type === "QUICK_REPLY" && (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                            )}
                            {btn.text || "Botão"}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {/* Bottom bar */}
                <div className="bg-[#f0f0f0] px-3 py-2 flex items-center gap-2">
                  <div className="flex-1 bg-white rounded-full px-4 py-1.5 text-xs text-gray-400">
                    Mensagem
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#25d366] flex items-center justify-center">
                    <Send className="h-3.5 w-3.5 text-white" />
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Templates List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <CardTitle className="text-lg mb-2">Nenhum template criado</CardTitle>
              <CardDescription>
                Crie seu primeiro modelo de mensagem para começar a enviar mensagens via WhatsApp.
              </CardDescription>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Idioma</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => {
                    const st = statusConfig[t.status] || statusConfig.draft;
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            {t.name}
                          </div>
                        </TableCell>
                        <TableCell>{categoryLabels[t.category] || t.category}</TableCell>
                        <TableCell>{languageLabels[t.language] || t.language}</TableCell>
                        <TableCell>
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openPreview(t)} title="Pré-visualizar">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => submitToMetaMutation.mutate(t.id)}
                              disabled={submitToMetaMutation.isPending || t.status === "approved"}
                              title="Enviar à Meta para aprovação"
                            >
                              {submitToMetaMutation.isPending && submitToMetaMutation.variables === t.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4 text-primary" />
                              )}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(t)} title="Editar">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Tem certeza que deseja excluir este template?")) {
                                  deleteMutation.mutate(t.id);
                                }
                              }}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
