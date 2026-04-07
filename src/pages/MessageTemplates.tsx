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
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Editar Template" : "Criar Template"}
                </DialogTitle>
                <DialogDescription>
                  Defina o conteúdo do seu modelo de mensagem. Use {"{{1}}"}, {"{{2}}"} etc. para variáveis no corpo.
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-6">
                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 space-y-4 min-w-0">
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

                {/* Live Preview */}
                <div className="hidden md:flex flex-col items-center pt-2">
                  <p className="text-xs text-muted-foreground mb-3 font-medium">Pré-visualização</p>
                  <WhatsAppPhonePreview
                    companyName={currentTenant?.name || "Empresa"}
                    headerType={form.header_type}
                    headerContent={form.header_content}
                    body={form.body}
                    footer={form.footer}
                    buttons={form.buttons}
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden bg-transparent border-none shadow-none">
            <DialogHeader className="sr-only">
              <DialogTitle>Pré-visualização</DialogTitle>
            </DialogHeader>
            <div className="flex justify-center py-4">
              <WhatsAppPhonePreview
                companyName={currentTenant?.name || "Empresa"}
                headerType={previewTemplate.header_type}
                headerContent={previewTemplate.header_content}
                body={previewTemplate.body}
                footer={previewTemplate.footer}
                buttons={previewTemplate.buttons}
              />
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
