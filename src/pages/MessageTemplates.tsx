import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  RefreshCw,
  Send,
  Copy,
  Mail,
  MoreVertical,
} from "lucide-react";
import { BulkSendDialog } from "@/components/templates/BulkSendDialog";
import { EmailBuilder } from "@/components/templates/EmailBuilder";
import { Checkbox } from "@/components/ui/checkbox";
import type { Json } from "@/integrations/supabase/types";
import { WhatsAppPhonePreview } from "@/components/WhatsAppPhonePreview";
import { validateTemplate, type TemplateValidationError } from "@/lib/templateValidation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


interface TemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
  example?: string;
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

const sanitizeHeaderForMeta = (input: string) =>
  input
    .replace(/[\n\r\f\v]/g, " ")
    .replace(/[*_~]/g, "")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\u200D\uFE0E\uFE0F\u20E3]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

export default function MessageTemplates() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [activeChannel, setActiveChannel] = useState<"whatsapp" | "email">("whatsapp");
  
  // WhatsApp States
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [sampleValues, setSampleValues] = useState<string[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateForm>(emptyForm);
  const [bulkSendTemplate, setBulkSendTemplate] = useState<{
    id: string; name: string; status: string; body: string; language: string;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formErrors, setFormErrors] = useState<TemplateValidationError[]>([]);

  // Email States
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [emailForm, setEmailForm] = useState({
    name: "",
    subject: "",
    body_html: "",
    category: "marketing"
  });

  const tenantId = currentTenant?.id;

  // WhatsApp Queries
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

  // Email Queries
  const { data: emailTemplates = [], isLoading: isLoadingEmail } = useQuery({
    queryKey: ["email-templates", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("email_templates")
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
        sample_values: sampleValues as unknown as Json,
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

  const saveEmailMutation = useMutation({
    mutationFn: async (values: typeof emailForm) => {
      if (!tenantId) throw new Error("Tenant não encontrado");
      const payload = {
        tenant_id: tenantId,
        name: values.name,
        subject: values.subject,
        body_html: values.body_html,
        category: values.category,
      };

      if (editingEmailId) {
        const { error } = await supabase
          .from("email_templates")
          .update(payload)
          .eq("id", editingEmailId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("email_templates")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success(editingEmailId ? "Template de e-mail atualizado!" : "Template de e-mail criado!");
      setEmailDialogOpen(false);
      setEditingEmailId(null);
      setEmailForm({ name: "", subject: "", body_html: "", category: "marketing" });
    },
    onError: (err: Error) => {
      toast.error("Erro ao salvar e-mail: " + err.message);
    },
  });

  const deleteEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("email_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success("Template de e-mail excluído!");
    },
    onError: (err: Error) => {
      toast.error("Erro ao excluir: " + err.message);
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

  const syncTemplatesMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant não encontrado");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-sync-templates`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tenant_id: tenantId }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.details?.error?.message || result.error || "Erro desconhecido");
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
      toast.success(`Sincronização concluída! ${result.updated} template(s) atualizado(s) de ${result.matched} encontrado(s) na Meta.`);
    },
    onError: (err: Error) => {
      toast.error("Erro ao sincronizar: " + err.message);
    },
  });

  const getTemplateBodyValidationError = (body: string) => {
    const trimmedBody = body.trim();

    if (/^\{\{\d+\}\}/.test(trimmedBody) || /\{\{\d+\}\}$/.test(trimmedBody)) {
      return "A Meta não permite variáveis no início ou no fim do corpo do template. Adicione texto antes e depois das variáveis.";
    }

    return null;
  };

  const getTemplateHeaderValidationError = (headerType: string | null, headerContent: string | null) => {
    if (headerType !== "text" || !headerContent?.trim()) return null;

    const sanitizedHeader = sanitizeHeaderForMeta(headerContent);

    if (!sanitizedHeader) {
      return "A Meta rejeita cabeçalhos vazios após remover emojis, asteriscos e formatação. Use apenas texto simples no título.";
    }

    if (sanitizedHeader !== headerContent.trim()) {
      return "A Meta rejeita emojis, asteriscos, quebras de linha e formatação no cabeçalho. Ajuste o título para texto simples.";
    }

    return null;
  };

  const getTemplateMetaErrorMessage = (result: unknown): { title: string; detail?: string } => {
    if (!result || typeof result !== "object") return { title: "Erro desconhecido" };

    const payload = result as {
      error?: string;
      details?: {
        error?: {
          message?: string;
          error_user_msg?: string;
          error_user_title?: string;
          code?: number;
          error_subcode?: number;
        };
      };
      field?: string;
      code?: string;
    };

    const metaError = payload.details?.error;
    const title = payload.error || metaError?.error_user_msg || metaError?.message || "Erro desconhecido";
    
    const detailParts: string[] = [];
    if (metaError?.error_user_title) detailParts.push(metaError.error_user_title);
    if (metaError?.error_user_msg && metaError.error_user_msg !== title) detailParts.push(metaError.error_user_msg);
    if (payload.field) detailParts.push(`Campo: ${payload.field}`);
    if (metaError?.error_subcode) detailParts.push(`Código Meta: ${metaError.error_subcode}`);

    return { title, detail: detailParts.length > 0 ? detailParts.join(" · ") : undefined };
  };

  const submitToMetaMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error("Tenant não encontrado");

      const template = templates.find((item) => item.id === id);
      if (!template) throw new Error("Template não encontrado");

      const tplButtons = (template.buttons as unknown as TemplateButton[]) || [];
      const errors = validateTemplate({
        name: template.name,
        category: template.category,
        language: template.language,
        header_type: template.header_type || "none",
        header_content: template.header_content || "",
        body: template.body,
        footer: template.footer || "",
        buttons: tplButtons,
        sample_values: (template.sample_values as string[]) || [],
      });
      const critical = errors.filter((e) => e.severity === "error");
      if (critical.length > 0) throw new Error(critical[0].message);

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
        const metaErr = getTemplateMetaErrorMessage(result);
        const err = new Error(metaErr.title);
        (err as any).detail = metaErr.detail;
        throw err;
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
      toast.success(`Template enviado à Meta! Status: ${result.status || "PENDING"}`);
    },
    onError: (err: Error) => {
      const detail = (err as any).detail;
      toast.error(err.message, { description: detail, duration: 10000 });
    },
  });

  const handleBulkSubmitToMeta = async () => {
    if (selectedIds.size === 0) return;
    setBulkSubmitting(true);
    const ids = Array.from(selectedIds);
    let success = 0;
    let failed = 0;
    const failedTemplates: string[] = [];

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Não autenticado");
      setBulkSubmitting(false);
      return;
    }

    for (const id of ids) {
      const tpl = templates.find((t) => t.id === id);

      if (!tpl) {
        failed++;
        continue;
      }

      const tplButtons = (tpl.buttons as unknown as TemplateButton[]) || [];
      const errors = validateTemplate({
        name: tpl.name, category: tpl.category, language: tpl.language,
        header_type: tpl.header_type || "none", header_content: tpl.header_content || "",
        body: tpl.body, footer: tpl.footer || "", buttons: tplButtons,
        sample_values: (tpl.sample_values as string[]) || [],
      });
      const critical = errors.filter((e) => e.severity === "error");
      if (critical.length > 0) {
        failed++;
        failedTemplates.push(`${tpl.name}: ${critical[0].message}`);
        continue;
      }

      try {
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
        if (response.ok) {
          success++;
        } else {
          failed++;
          const metaErr = getTemplateMetaErrorMessage(result);
          failedTemplates.push(`${tpl.name}: ${metaErr.title}`);
          console.error(`Failed ${tpl.name}:`, result);
        }
      } catch {
        failed++;
        failedTemplates.push(`${tpl.name}: erro inesperado ao enviar`);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    setSelectedIds(new Set());
    setBulkSubmitting(false);

    if (failed === 0) {
      toast.success(`${success} template(s) enviado(s) à Meta com sucesso!`);
    } else {
      const details = failedTemplates.slice(0, 2).join(" • ");
      toast.warning(`${success} enviado(s), ${failed} falha(s)${details ? `. ${details}` : ""}`);
    }
  };

  // Eligible templates for bulk Meta submission (not yet approved and valid)
  const filteredTemplates = useMemo(
    () => statusFilter === "all" ? templates : templates.filter((t) => t.status === statusFilter),
    [templates, statusFilter]
  );

  const templateHasErrors = (t: typeof templates[0]) => {
    const tplButtons = (t.buttons as unknown as TemplateButton[]) || [];
    const errors = validateTemplate({
      name: t.name, category: t.category, language: t.language,
      header_type: t.header_type || "none", header_content: t.header_content || "",
      body: t.body, footer: t.footer || "", buttons: tplButtons,
      sample_values: (t.sample_values as string[]) || [],
    });
    return errors.filter((e) => e.severity === "error").length > 0;
  };

  const eligibleForMeta = useMemo(
    () => filteredTemplates.filter((t) => t.status !== "approved" && !templateHasErrors(t)),
    [filteredTemplates]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === eligibleForMeta.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleForMeta.map((t) => t.id)));
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setSampleValues([]);
    setFormErrors([]);
  };

  const duplicateTemplate = (template: (typeof templates)[0]) => {
    setEditingId(null);
    setForm({
      name: template.name + "_copia",
      category: template.category,
      language: template.language,
      header_type: template.header_type || "none",
      header_content: template.header_content || "",
      body: template.body,
      footer: template.footer || "",
      buttons: (template.buttons as unknown as TemplateButton[]) || [],
    });
    setSampleValues((template.sample_values as string[]) || []);
    setDialogOpen(true);
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
    setSampleValues((template.sample_values as string[]) || []);
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

    const errors = validateTemplate({ ...form, sample_values: sampleValues });
    setFormErrors(errors);

    const criticalErrors = errors.filter((err) => err.severity === "error");
    if (criticalErrors.length > 0) {
      toast.error(criticalErrors[0].message);
      return;
    }

    saveMutation.mutate(form);
  };

  const getFieldErrors = (field: string) =>
    formErrors.filter((e) => e.field === field);

  // Count variables in body like {{1}}, {{2}}
  const detectedVars = form.body.match(/\{\{(\d+)\}\}/g) || [];
  const variableCount = detectedVars.length;
  const uniqueVarNums = [...new Set(detectedVars.map(v => parseInt(v.replace(/[{}]/g, ''), 10)))].sort((a, b) => a - b);

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
          <p className="text-muted-foreground">Gerencie seus modelos de mensagem para WhatsApp e E-mail.</p>
        </div>

        <Tabs value={activeChannel} onValueChange={(v) => setActiveChannel(v as any)} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="whatsapp" className="gap-2">
              <MessageSquare className="h-4 w-4" /> WhatsApp
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" /> E-mail
            </TabsTrigger>
          </TabsList>

          <TabsContent value="whatsapp" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Templates do WhatsApp</h2>
                <p className="text-sm text-muted-foreground">Modelos HSM aprovados pela Meta</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => syncTemplatesMutation.mutate()}
                  disabled={syncTemplatesMutation.isPending}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncTemplatesMutation.isPending ? "animate-spin" : ""}`} />
                  {syncTemplatesMutation.isPending ? "Sincronizando..." : "Sincronizar Meta"}
                </Button>

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
                        {form.name.length}/512 — Apenas letras minúsculas, números e _
                      </p>
                      {getFieldErrors("name").map((e, i) => (
                        <p key={i} className={`text-xs ${e.severity === "error" ? "text-destructive" : "text-yellow-600"}`}>{e.message}</p>
                      ))}
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
                      {getFieldErrors("header_content").map((e, i) => (
                        <p key={i} className={`text-xs ${e.severity === "error" ? "text-destructive" : "text-yellow-600"}`}>{e.message}</p>
                      ))}
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
                    {getFieldErrors("body").map((e, i) => (
                      <p key={i} className={`text-xs ${e.severity === "error" ? "text-destructive" : "text-yellow-600"}`}>{e.message}</p>
                    ))}
                  </div>

                  {/* Sample values for variables */}
                  {uniqueVarNums.length > 0 && (
                    <div className="space-y-2">
                      <Label>Valores de exemplo para variáveis</Label>
                      <p className="text-xs text-muted-foreground">
                        Preencha exemplos para cada variável. A Meta exige exemplos para aprovar o template.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {uniqueVarNums.map((num) => (
                          <div key={num} className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">{`{{${num}}}`}</span>
                            <Input
                              placeholder={`Exemplo para {{${num}}}`}
                              value={sampleValues[num - 1] || ""}
                              onChange={(e) => {
                                setSampleValues((prev) => {
                                  const next = [...prev];
                                  next[num - 1] = e.target.value;
                                  return next;
                                });
                              }}
                              className="h-8 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                      {getFieldErrors("sample_values").map((e, i) => (
                        <p key={i} className={`text-xs ${e.severity === "error" ? "text-destructive" : "text-yellow-600"}`}>{e.message}</p>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Rodapé (opcional)</Label>
                    <Input
                      placeholder="Martz CRM"
                      value={form.footer}
                      onChange={(e) => setForm((f) => ({ ...f, footer: e.target.value }))}
                      maxLength={60}
                    />
                    <p className="text-xs text-muted-foreground">{form.footer.length}/60 caracteres</p>
                    {getFieldErrors("footer").map((e, i) => (
                      <p key={i} className={`text-xs ${e.severity === "error" ? "text-destructive" : "text-yellow-600"}`}>{e.message}</p>
                    ))}
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
                            <SelectItem value="COPY_CODE">Copiar código</SelectItem>
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
                        {btn.type === "COPY_CODE" && (
                          <Input
                            placeholder="Exemplo: PIX123ABC"
                            value={btn.example || ""}
                            onChange={(e) => updateButton(i, "example", e.target.value)}
                            className="flex-1"
                          />
                        )}
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeButton(i)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        {getFieldErrors(`button_${i}`).map((e, ei) => (
                          <p key={ei} className={`text-xs w-full ${e.severity === "error" ? "text-destructive" : "text-yellow-600"}`}>{e.message}</p>
                        ))}
                      </div>
                    ))}
                    {getFieldErrors("buttons").map((e, i) => (
                      <p key={i} className={`text-xs ${e.severity === "error" ? "text-destructive" : "text-yellow-600"}`}>{e.message}</p>
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
                    sampleValues={sampleValues}
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>
          </div>
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
            {/* Status filter bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <span className="text-sm text-muted-foreground mr-1">Filtrar:</span>
              {[
                { value: "all", label: "Todos" },
                { value: "draft", label: "Rascunho" },
                { value: "pending", label: "Pendente" },
                { value: "approved", label: "Aprovado" },
                { value: "rejected", label: "Rejeitado" },
              ].map((opt) => (
                <Button
                  key={opt.value}
                  variant={statusFilter === opt.value ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => { setStatusFilter(opt.value); setSelectedIds(new Set()); }}
                >
                  {opt.label}
                  {opt.value !== "all" && (
                    <span className="ml-1 opacity-70">
                      ({templates.filter((t) => t.status === opt.value).length})
                    </span>
                  )}
                </Button>
              ))}
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-border">
                <span className="text-sm text-foreground">
                  <span className="font-medium">{selectedIds.size}</span> template(s) selecionado(s)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs"
                  >
                    Limpar seleção
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBulkSubmitToMeta}
                    disabled={bulkSubmitting}
                    className="text-xs"
                  >
                    {bulkSubmitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                        Enviar {selectedIds.size} à Meta
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          eligibleForMeta.length > 0 &&
                          selectedIds.size === eligibleForMeta.length
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Idioma</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.map((t) => {
                    const st = statusConfig[t.status] || statusConfig.draft;
                    const hasErrors = templateHasErrors(t);
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(t.id)}
                            onCheckedChange={() => toggleSelect(t.id)}
                            disabled={t.status === "approved" || hasErrors}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            {t.name}
                          </div>
                        </TableCell>
                        <TableCell>{categoryLabels[t.category] || t.category}</TableCell>
                        <TableCell>{languageLabels[t.language] || t.language}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-start gap-2">
                            <Badge variant={st.variant}>{st.label}</Badge>
                            {hasErrors && (
                              <Badge variant="outline" className="text-destructive border-destructive/50">Inválido</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openPreview(t)} title="Pré-visualizar">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setBulkSendTemplate({
                                id: t.id, name: t.name, status: t.status, body: t.body, language: t.language,
                              })}
                              disabled={t.status !== "approved"}
                              title="Envio em massa"
                            >
                              <Send className="h-4 w-4 text-primary" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => submitToMetaMutation.mutate(t.id)}
                              disabled={
                                submitToMetaMutation.isPending ||
                                t.status === "approved" ||
                                hasErrors
                              }
                              title={hasErrors ? "Template com erros de validação" : "Enviar à Meta para aprovação"}
                            >
                              {submitToMetaMutation.isPending && submitToMetaMutation.variables === t.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4 text-primary" />
                              )}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => duplicateTemplate(t)} title="Duplicar">
                              <Copy className="h-4 w-4" />
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

          </TabsContent>

          <TabsContent value="email" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Templates de E-mail</h2>
                <p className="text-sm text-muted-foreground">Modelos HTML para campanhas SES</p>
              </div>
              <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => { setEmailForm({ name: "", subject: "", body_html: "", category: "marketing" }); setEditingEmailId(null); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0">
                  <div className="p-6 pb-2">
                    <DialogHeader>
                      <DialogTitle>{editingEmailId ? "Editar Template" : "Criar Template de E-mail"}</DialogTitle>
                      <DialogDescription>Use o editor visual para criar seu modelo de e-mail profissional.</DialogDescription>
                    </DialogHeader>
                  </div>
                  
                  <div className="flex-1 overflow-hidden flex flex-col p-6 pt-2 gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nome Interno</Label>
                        <Input 
                          placeholder="Ex: boas_vindas_v1" 
                          value={emailForm.name} 
                          onChange={(e) => setEmailForm({...emailForm, name: e.target.value})}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Categoria</Label>
                        <Select value={emailForm.category} onValueChange={(v) => setEmailForm({...emailForm, category: v})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="marketing">Marketing</SelectItem>
                            <SelectItem value="transactional">Transacional</SelectItem>
                            <SelectItem value="utility">Utilidade</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Assunto do E-mail</Label>
                      <Input 
                        placeholder="Ex: Bem-vindo à nossa loja!" 
                        value={emailForm.subject} 
                        onChange={(e) => setEmailForm({...emailForm, subject: e.target.value})}
                        required
                      />
                    </div>
                    
                    <div className="flex-1 min-h-0">
                      <Label className="mb-2 block">Design do E-mail</Label>
                      <EmailBuilder 
                        initialHtml={emailForm.body_html}
                        isLoading={saveEmailMutation.isPending}
                        onSave={(html) => {
                          setEmailForm(prev => ({ ...prev, body_html: html }));
                          saveEmailMutation.mutate({ ...emailForm, body_html: html });
                        }}
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {isLoadingEmail ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : emailTemplates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                  <CardTitle className="text-lg mb-2">Nenhum template de e-mail</CardTitle>
                  <CardDescription>Crie modelos HTML para usar em suas automações e campanhas.</CardDescription>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {emailTemplates.map((t: any) => (
                  <Card key={t.id} className="overflow-hidden group">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base truncate max-w-[200px]">{t.name}</CardTitle>
                          <CardDescription className="text-xs truncate max-w-[200px]">{t.subject}</CardDescription>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">{t.category}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-2 flex flex-col gap-4">
                      <div className="bg-muted rounded h-40 overflow-hidden border relative flex items-center justify-center">
                         {/* Simple HTML Preview using iframe sandbox */}
                         <iframe 
                           srcDoc={`
                            <style>
                              body { margin: 0; padding: 0; transform: scale(0.4); transform-origin: top center; width: 250%; }
                              ::-webkit-scrollbar { display: none; }
                            </style>
                            ${t.body_html}
                           `} 
                           className="w-full h-full border-none pointer-events-none" 
                           title={t.name}
                         />
                         <div className="absolute inset-0 bg-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/5 cursor-pointer" onClick={() => {
                            setEmailForm({
                              name: t.name,
                              subject: t.subject || "",
                              body_html: t.body_html || "",
                              category: t.category || "marketing"
                            });
                            setEditingEmailId(t.id);
                            setEmailDialogOpen(true);
                         }}>
                            <Button variant="secondary" size="sm">
                              <Eye className="h-4 w-4 mr-2" /> Visualizar
                            </Button>
                         </div>
                      </div>
                      <div className="flex justify-between items-center mt-auto">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(t.created_at).toLocaleDateString()}
                        </span>
                        <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => {
                          setEmailForm({
                            name: t.name,
                            subject: t.subject || "",
                            body_html: t.body_html || "",
                            category: t.category || "marketing"
                          });
                          setEditingEmailId(t.id);
                          setEmailDialogOpen(true);
                        }}>
                          <Pencil className="h-3 w-3 mr-2" /> Editar
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-destructive" onClick={() => {
                              if (confirm("Excluir este template?")) deleteEmailMutation.mutate(t.id);
                            }}>
                              <Trash2 className="h-4 w-4 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <BulkSendDialog
          open={!!bulkSendTemplate}
          onOpenChange={(open) => { if (!open) setBulkSendTemplate(null); }}
          template={bulkSendTemplate}
        />
      </div>
    </AppLayout>
  );
}

