import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type TemplateVariable = { token: string; label: string; description: string };
type TemplateVariableGroup = { label: string; variables: TemplateVariable[] };

const TEMPLATE_VARIABLES: TemplateVariableGroup[] = [
  {
    label: "Cliente",
    variables: [
      { token: "customer.first_name", label: "Primeiro nome", description: 'Ex: "Maria"' },
      { token: "customer.name", label: "Nome completo", description: 'Ex: "Maria da Silva"' },
      { token: "customer.phone", label: "Telefone", description: "Telefone cadastrado" },
      { token: "customer.email", label: "E-mail", description: "E-mail cadastrado" },
      { token: "customer.city", label: "Cidade", description: "Cidade do cliente" },
      { token: "customer.state", label: "Estado", description: "UF do cliente" },
      { token: "customer.days_since_order", label: "Dias desde último pedido", description: 'Ex: "15"' },
      { token: "customer.last_product", label: "Último produto comprado", description: "Nome do produto" },
      { token: "customer.last_order_value", label: "Valor do último pedido", description: 'Ex: "147,90"' },
    ],
  },
  {
    label: "Pedido",
    variables: [
      { token: "order.number", label: "Número do pedido", description: 'Ex: "#242127"' },
      { token: "order.total", label: "Total do pedido", description: 'Ex: "147,90"' },
      { token: "order.status", label: "Status do pedido", description: 'Ex: "pago"' },
      { token: "order.tracking_code", label: "Código de rastreio", description: "Busca no Bling se vazio" },
      { token: "order.delivery_days", label: "Dias de entrega", description: 'Default: "5 a 8"' },
      { token: "order.pix_code", label: "PIX copia-e-cola", description: "Código PIX gerado" },
    ],
  },
  {
    label: "Carrinho abandonado",
    variables: [
      { token: "cart.recovery_url", label: "Link de recuperação", description: "URL pra retomar o carrinho" },
      { token: "cart.value", label: "Valor do carrinho", description: "Total dos itens" },
      { token: "cart.items_count", label: "Qtd. de itens", description: "Número de produtos" },
      { token: "cart.items_summary", label: "Resumo dos itens", description: "Lista resumida" },
    ],
  },
  {
    label: "Campanha",
    variables: [
      { token: "campaign.coupon", label: "Cupom", description: "Cupom da campanha" },
      { token: "campaign.discount", label: "Desconto", description: 'Ex: "20%"' },
      { token: "campaign.product_name", label: "Nome do produto", description: "Produto em destaque" },
      { token: "campaign.product_desc", label: "Descrição do produto", description: "Pitch curto" },
      { token: "campaign.return_days", label: "Prazo de retorno", description: 'Default: "5"' },
    ],
  },
  {
    label: "Sistema",
    variables: [
      { token: "unsubscribe_url", label: "Link de descadastro", description: "Opt-out automático" },
    ],
  },
];

// Variáveis dos templates de e-mail Maxfem (formato simples, sem prefixo customer./order.).
// O campaign-executor (resolveVariable) reconhece esses aliases.
type EmailTemplateVariableGroup = { label: string; variables: { token: string; label: string; description: string }[] };
const EMAIL_TEMPLATE_VARIABLES: EmailTemplateVariableGroup[] = [
  {
    label: "Cliente",
    variables: [
      { token: "nome", label: "Nome completo", description: 'Ex: "Maria da Silva"' },
      { token: "primeiro_nome", label: "Primeiro nome", description: 'Ex: "Maria"' },
      { token: "email", label: "E-mail", description: "E-mail cadastrado" },
      { token: "telefone", label: "Telefone", description: "Telefone cadastrado" },
    ],
  },
  {
    label: "Pedido",
    variables: [
      { token: "numero_pedido", label: "Número do pedido", description: 'Ex: "242127"' },
      { token: "valor_pedido", label: "Valor do pedido", description: 'Ex: "147,90"' },
      { token: "itens_pedido", label: "Itens do pedido", description: "Resumo dos produtos" },
      { token: "status_pedido", label: "Status do pedido", description: 'Ex: "pago", "enviado"' },
      { token: "link_pedido", label: "Link do pedido", description: "URL do pedido na loja" },
      { token: "link_pagamento", label: "Link de pagamento", description: "URL pra pagar Pix/boleto" },
      { token: "codigo_pix", label: "Código PIX copia-e-cola", description: "PIX QR Code" },
    ],
  },
  {
    label: "Rastreio & Logística",
    variables: [
      { token: "codigo_rastreio", label: "Código de rastreio", description: 'Ex: "BLI_16063981436"' },
      { token: "link_rastreio", label: "Link de rastreio", description: "Rastreio.maxfem.com.br/{código}" },
      { token: "previsao_entrega", label: "Previsão de entrega", description: 'Ex: "19/05/2026"' },
      { token: "transportadora", label: "Transportadora", description: 'Ex: "Loggi", "Correios"' },
    ],
  },
  {
    label: "Nota Fiscal (Bling)",
    variables: [
      { token: "link_nf", label: "Link da NF (DANFE HTML)", description: "Visualização da NF no Bling" },
      { token: "link_nf_pdf", label: "Link da NF em PDF", description: "PDF da DANFE para download" },
      { token: "numero_nf", label: "Número da NF", description: 'Ex: "164463"' },
      { token: "chave_nf", label: "Chave de acesso da NF", description: "44 dígitos (SEFAZ)" },
    ],
  },
  {
    label: "Carrinho",
    variables: [
      { token: "link_carrinho", label: "Link recuperar carrinho", description: "URL pra finalizar compra" },
    ],
  },
  {
    label: "Campanha & Cashback",
    variables: [
      { token: "cupom", label: "Cupom de desconto", description: "Cupom da campanha" },
      { token: "valor_cashback", label: "Valor de cashback", description: 'Saldo Yampi do cliente. Ex: "45,30"' },
      { token: "validade_cashback", label: "Validade do cashback", description: 'Data de expiração. Ex: "31/08/2026"' },
      { token: "dias_cashback", label: "Dias até expirar", description: 'Urgência. Ex: "7" (= 7 dias)' },
      { token: "link_cashback", label: "Link do cashback", description: "URL pra usar cashback" },
    ],
  },
  {
    label: "Sistema & Loja",
    variables: [
      { token: "link_loja", label: "Link da loja", description: "maxfem.com.br" },
      { token: "link_pesquisa", label: "Link pesquisa pós-venda", description: "URL formulário NPS" },
      { token: "link_whatsapp", label: "Link WhatsApp", description: "wa.me/55..." },
      { token: "link_descadastro", label: "Link de descadastro", description: "Opt-out automático (LGPD)" },
    ],
  },
];


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

type UnifiedEmailTemplate = {
  id: string;
  name: string;
  subject: string | null;
  body_html: string | null;
  category: string | null;
  design: Json | null;
  created_at: string;
  source: "message_templates" | "email_templates";
};

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
  const { currentTenant, user } = useAuth();
  const queryClient = useQueryClient();
  const [activeChannel, setActiveChannel] = useState<"whatsapp" | "email">("whatsapp");
  
  // WhatsApp States
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [sampleValues, setSampleValues] = useState<string[]>([]);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [variablePickerOpen, setVariablePickerOpen] = useState(false);

  const insertVariable = (token: string) => {
    const textarea = bodyTextareaRef.current;
    const current = form.body;
    const usedNums = Array.from(current.matchAll(/{{(\d+)}}/g)).map((m) => parseInt(m[1], 10));
    const nextNum = (usedNums.length ? Math.max(...usedNums) : 0) + 1;
    const placeholder = `{{${nextNum}}}`;

    let start = current.length;
    let end = current.length;
    if (textarea) {
      start = textarea.selectionStart ?? current.length;
      end = textarea.selectionEnd ?? current.length;
    }
    const nextBody = current.slice(0, start) + placeholder + current.slice(end);
    setForm((f) => ({ ...f, body: nextBody }));
    setSampleValues((prev) => {
      const next = [...prev];
      next[nextNum - 1] = token;
      return next;
    });

    setTimeout(() => {
      if (textarea) {
        const cursor = start + placeholder.length;
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
      }
    }, 0);
    setVariablePickerOpen(false);
  };
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
  const [editingEmailSource, setEditingEmailSource] = useState<"message_templates" | "email_templates">("message_templates");
  const [emailPreview, setEmailPreview] = useState<any | null>(null);
  const [emailPreviewMode, setEmailPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [emailEditorMode, setEmailEditorMode] = useState<"builder" | "html" | "preview">("builder");

  // Envio de teste — dispara o template pra um e-mail qualquer com vars
  // preenchidas por valores de exemplo, pra revisar antes de subir campanha.
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  // Variable picker for email — separate refs for subject and HTML body
  const emailSubjectRef = useRef<HTMLInputElement | null>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [emailVarPickerTarget, setEmailVarPickerTarget] = useState<"subject" | "body" | null>(null);

  // Insere {{token}} direto (sem auto-numbering — HTML usa {{var}} literal, não {{1}})
  const insertEmailVariable = (token: string) => {
    const placeholder = `{{${token}}}`;
    if (emailVarPickerTarget === "subject") {
      const el = emailSubjectRef.current;
      const current = emailForm.subject || "";
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const next = current.slice(0, start) + placeholder + current.slice(end);
      setEmailForm((f) => ({ ...f, subject: next }));
      setTimeout(() => {
        if (el) {
          const cursor = start + placeholder.length;
          el.focus();
          el.setSelectionRange(cursor, cursor);
        }
      }, 0);
    } else if (emailVarPickerTarget === "body") {
      const el = emailBodyRef.current;
      const current = emailForm.body_html || "";
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const next = current.slice(0, start) + placeholder + current.slice(end);
      setEmailForm((f) => ({ ...f, body_html: next, design: null }));
      setTimeout(() => {
        if (el) {
          const cursor = start + placeholder.length;
          el.focus();
          el.setSelectionRange(cursor, cursor);
        }
      }, 0);
    }
    setEmailVarPickerTarget(null);
  };

  // Envia o template como teste para o e-mail informado, com merge vars
  // substituídas por valores de exemplo. Útil pra validar visual e copy
  // antes de subir campanha.
  const SAMPLE_VARS: Record<string, string> = {
    nome: "Thiago",
    cupom: "TESTE10",
    numero_pedido: "#12345",
    valor_pedido: "R$ 199,90",
    itens_pedido: "Imunofem Gummy x1",
    codigo_rastreio: "BR123456789BR",
    link_pedido: "https://maxfem.com.br/pedido",
    link_pagamento: "https://maxfem.com.br/pagamento",
    link_carrinho: "https://maxfem.com.br/carrinho",
    link_rastreio: "https://maxfem.com.br/rastreio",
    link_loja: "https://maxfem.com.br",
    link_whatsapp: "https://wa.me/552130000000",
    link_descadastro: "https://maxfem.com.br/descadastro",
    link_cashback: "https://maxfem.com.br/cashback",
    link_pesquisa: "https://maxfem.com.br/pesquisa",
    previsao_entrega: "5 a 7 dias úteis",
    codigo_pix: "00020126360014BR.GOV.BCB.PIX...",
    valor_cashback: "R$ 19,00",
    validade_cashback: "30 dias",
  };
  const sendTestEmail = async () => {
    const recipient = (testEmail.trim() || user?.email || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
      toast.error("Informe um e-mail válido para o teste.");
      return;
    }
    if (!emailForm.subject?.trim() || !emailForm.body_html?.trim()) {
      toast.error("Preencha assunto e conteúdo antes de enviar o teste.");
      return;
    }
    if (!tenantId) {
      toast.error("Tenant não encontrado.");
      return;
    }
    const substitute = (s: string) =>
      s.replace(/\{\{(\w+)\}\}/g, (_, k) => SAMPLE_VARS[k] ?? `[${k}]`);
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email-ses", {
        body: {
          to: recipient,
          subject: `[TESTE] ${substitute(emailForm.subject)}`,
          html: substitute(emailForm.body_html),
          tenantId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Teste enviado para ${recipient}`);
    } catch (err: any) {
      toast.error(`Falha ao enviar teste: ${err?.message || "erro desconhecido"}`);
    } finally {
      setSendingTest(false);
    }
  };

  const [emailForm, setEmailForm] = useState<{
    name: string;
    subject: string;
    body_html: string;
    category: string;
    design: any | null;
  }>({
    name: "",
    subject: "",
    body_html: "",
    category: "marketing",
    design: null,
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
        .or("channel.is.null,channel.eq.,channel.eq.whatsapp")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  // Email Queries (new MCP templates live in message_templates; legacy UI templates live in email_templates)
  const { data: emailTemplates = [], isLoading: isLoadingEmail } = useQuery<UnifiedEmailTemplate[]>({
    queryKey: ["email-templates", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      const [messageTemplatesRes, legacyEmailTemplatesRes] = await Promise.all([
        supabase
          .from("message_templates")
          .select("id, name, subject, body_html, category, design, created_at")
          .eq("tenant_id", tenantId)
          .eq("channel", "email")
          .order("created_at", { ascending: false }),
        supabase
          .from("email_templates")
          .select("id, name, subject, body_html, category, design, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false }),
      ]);

      if (messageTemplatesRes.error) throw messageTemplatesRes.error;
      if (legacyEmailTemplatesRes.error) throw legacyEmailTemplatesRes.error;

      return [
        ...(messageTemplatesRes.data || []).map((template) => ({ ...template, source: "message_templates" as const })),
        ...(legacyEmailTemplatesRes.data || []).map((template) => ({ ...template, source: "email_templates" as const })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
        design: values.design ?? null,
        channel: 'email',
        status: 'active'
      };

      if (editingEmailId) {
        const { error } = editingEmailSource === "email_templates"
          ? await supabase
              .from("email_templates")
              .update({
                tenant_id: payload.tenant_id,
                name: payload.name,
                subject: payload.subject,
                body_html: payload.body_html,
                category: payload.category,
                design: payload.design,
              })
              .eq("id", editingEmailId)
          : await supabase
              .from("message_templates")
              .update(payload)
              .eq("id", editingEmailId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("message_templates")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success(editingEmailId ? "Template de e-mail atualizado!" : "Template de e-mail criado!");
      setEmailDialogOpen(false);
      setEditingEmailId(null);
      setEditingEmailSource("message_templates");
      setEmailForm({ name: "", subject: "", body_html: "", category: "marketing", design: null });
    },
    onError: (err: Error) => {
      toast.error("Erro ao salvar e-mail: " + err.message);
    },
  });

  const deleteEmailMutation = useMutation({
    mutationFn: async ({ id, source }: Pick<UnifiedEmailTemplate, "id" | "source">) => {
      const { error } = source === "email_templates"
        ? await supabase
            .from("email_templates")
            .delete()
            .eq("id", id)
        : await supabase
            .from("message_templates")
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
                      <Label>Mídia do cabeçalho</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Cole URL pública OU clique em Upload"
                          value={form.header_content}
                          onChange={(e) => setForm((f) => ({ ...f, header_content: e.target.value }))}
                          className="font-mono text-xs"
                        />
                        <input
                          type="file"
                          accept={
                            form.header_type === "image" ? "image/png,image/jpeg" :
                            form.header_type === "video" ? "video/mp4,video/3gpp" :
                            "application/pdf"
                          }
                          id={`media-upload-${form.header_type}`}
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = async () => {
                              const base64 = reader.result as string;
                              try {
                                toast.loading("Enviando ao Meta...");
                                const { data: { session } } = await supabase.auth.getSession();
                                const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-media-handle`, {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${session?.access_token || ""}`,
                                  },
                                  body: JSON.stringify({
                                    file_base64: base64,
                                    file_type: file.type,
                                    file_name: file.name,
                                  }),
                                });
                                const data = await res.json();
                                toast.dismiss();
                                if (!res.ok || !data.ok) {
                                  toast.error(data?.user_message || data?.error || "Falha no upload", { duration: 8000 });
                                  return;
                                }
                                setForm((f) => ({ ...f, header_content: data.handle }));
                                toast.success(`Upload OK · handle ${data.handle.slice(0, 12)}...`, { duration: 5000 });
                              } catch (err: any) {
                                toast.dismiss();
                                toast.error(err.message);
                              }
                            };
                            reader.readAsDataURL(file);
                            // reset input
                            e.target.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => document.getElementById(`media-upload-${form.header_type}`)?.click()}
                        >
                          Upload
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!form.header_content.startsWith("http")}
                          onClick={async () => {
                            try {
                              toast.loading("Convertendo URL em handle Meta...");
                              const { data: { session } } = await supabase.auth.getSession();
                              const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-media-handle`, {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  Authorization: `Bearer ${session?.access_token || ""}`,
                                },
                                body: JSON.stringify({
                                  source_url: form.header_content,
                                  file_type: form.header_type === "image" ? "image/png" : form.header_type === "video" ? "video/mp4" : "application/pdf",
                                  file_name: "upload",
                                }),
                              });
                              const data = await res.json();
                              toast.dismiss();
                              if (!res.ok || !data.ok) {
                                toast.error(data?.user_message || data?.error || "Falha no upload", { duration: 8000 });
                                return;
                              }
                              setForm((f) => ({ ...f, header_content: data.handle }));
                              toast.success(`Handle gerado: ${data.handle.slice(0, 12)}...`, { duration: 5000 });
                            } catch (err: any) {
                              toast.dismiss();
                              toast.error(err.message);
                            }
                          }}
                        >
                          URL → Handle
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Pra criar template no Meta, o campo precisa ser <strong>handle</strong> (não URL). Use o botão <strong>Upload</strong> pra subir arquivo direto, ou <strong>URL → Handle</strong> se já tem hospedado. Imagens até 5 MB.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Corpo da mensagem *</Label>
                      <Popover open={variablePickerOpen} onOpenChange={setVariablePickerOpen}>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="h-7 gap-1">
                            <Plus className="h-3.5 w-3.5" />
                            <span className="text-xs">Inserir variável</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-80 p-0">
                          <div className="p-3 border-b">
                            <p className="text-sm font-semibold">Variáveis dinâmicas</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Insere <code className="text-[10px]">{`{{N}}`}</code> e mapeia automaticamente.
                            </p>
                          </div>
                          <ScrollArea className="h-[380px]">
                            <div className="p-2 space-y-3">
                              {TEMPLATE_VARIABLES.map((group) => (
                                <div key={group.label}>
                                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {group.label}
                                  </p>
                                  <div className="space-y-0.5">
                                    {group.variables.map((v) => (
                                      <button
                                        key={v.token}
                                        type="button"
                                        onClick={() => insertVariable(v.token)}
                                        className="w-full text-left rounded-md px-2 py-1.5 hover:bg-accent transition-colors group"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-sm font-medium">{v.label}</span>
                                          <code className="text-[10px] text-muted-foreground group-hover:text-foreground font-mono whitespace-nowrap">
                                            {v.token}
                                          </code>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">{v.description}</p>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <Textarea
                      ref={bodyTextareaRef}
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
                  <Button onClick={() => { setEmailForm({ name: "", subject: "", body_html: "", category: "marketing", design: null }); setEditingEmailId(null); setEditingEmailSource("message_templates"); }}>
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
                  
                  <div className="flex-1 overflow-y-auto flex flex-col p-6 pt-2 gap-4">
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
                      <div className="flex items-center justify-between">
                        <Label>Assunto do E-mail</Label>
                        <EmailVariablePicker
                          target="subject"
                          open={emailVarPickerTarget === "subject"}
                          onOpenChange={(o) => setEmailVarPickerTarget(o ? "subject" : null)}
                          onSelect={insertEmailVariable}
                        />
                      </div>
                      <Input
                        ref={emailSubjectRef}
                        placeholder="Ex: Bem-vindo à nossa loja!"
                        value={emailForm.subject}
                        onChange={(e) => setEmailForm({...emailForm, subject: e.target.value})}
                        required
                      />
                    </div>

                    {/* Enviar teste — dispara o template pra um e-mail
                        qualquer com vars de exemplo. Útil pra revisar visual
                        e copy antes de subir campanha. */}
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <Label className="text-sm font-medium">Enviar teste</Label>
                        <span className="text-xs text-muted-foreground">— vars são preenchidas com valores de exemplo; o assunto recebe prefixo [TESTE]</span>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder={user?.email || "voce@exemplo.com"}
                          value={testEmail}
                          onChange={(e) => setTestEmail(e.target.value)}
                          disabled={sendingTest}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={sendTestEmail}
                          disabled={sendingTest || !emailForm.subject || !emailForm.body_html}
                        >
                          {sendingTest ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Enviar teste
                        </Button>
                      </div>
                    </div>

                    <div className="min-h-[600px]">
                      <Label className="mb-2 block">Design do E-mail</Label>
                      <Tabs value={emailEditorMode} onValueChange={(v) => setEmailEditorMode(v as any)} className="w-full">
                        <div className="flex items-center justify-between mb-3">
                          <TabsList>
                            <TabsTrigger value="builder">🎨 Drag & Drop</TabsTrigger>
                            <TabsTrigger value="html">{"</>"} HTML</TabsTrigger>
                            <TabsTrigger value="preview"><Eye className="h-3.5 w-3.5 mr-1.5" /> Preview</TabsTrigger>
                          </TabsList>
                          {emailEditorMode !== "builder" && (
                            <div className="flex items-center gap-2">
                              {emailEditorMode === "preview" && (
                                <div className="flex gap-1 p-1 bg-muted rounded-md">
                                  <Button type="button" size="sm" variant={emailPreviewMode === "desktop" ? "default" : "ghost"} className="h-7 px-2" onClick={() => setEmailPreviewMode("desktop")}>Desktop</Button>
                                  <Button type="button" size="sm" variant={emailPreviewMode === "mobile" ? "default" : "ghost"} className="h-7 px-2" onClick={() => setEmailPreviewMode("mobile")}>Mobile</Button>
                                </div>
                              )}
                              <Button
                                type="button"
                                onClick={() => saveEmailMutation.mutate(emailForm)}
                                disabled={saveEmailMutation.isPending}
                              >
                                {saveEmailMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                Salvar Template
                              </Button>
                            </div>
                          )}
                        </div>

                        <TabsContent value="builder" className="mt-0">
                          <EmailBuilder 
                            initialHtml={emailForm.body_html}
                            initialDesign={emailForm.design}
                            isLoading={saveEmailMutation.isPending}
                            onSave={({ html, design }) => {
                              setEmailForm(prev => ({ ...prev, body_html: html, design }));
                              saveEmailMutation.mutate({ ...emailForm, body_html: html, design });
                            }}
                          />
                        </TabsContent>

                        <TabsContent value="html" className="mt-0">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-[600px]">
                            <div className="flex flex-col border rounded-md overflow-hidden">
                              <div className="px-3 py-2 text-xs font-medium bg-muted border-b flex items-center justify-between">
                                <span>Código HTML</span>
                                <EmailVariablePicker
                                  target="body"
                                  open={emailVarPickerTarget === "body"}
                                  onOpenChange={(o) => setEmailVarPickerTarget(o ? "body" : null)}
                                  onSelect={insertEmailVariable}
                                />
                              </div>
                              <Textarea
                                ref={emailBodyRef}
                                value={emailForm.body_html}
                                onChange={(e) => setEmailForm({ ...emailForm, body_html: e.target.value, design: null })}
                                placeholder="<html>...</html> — cole seu HTML aqui. Use {{nome}}, {{codigo_rastreio}}, {{link_rastreio}}, etc."
                                className="flex-1 font-mono text-xs resize-none border-0 focus-visible:ring-0 rounded-none"
                              />
                            </div>
                            <div className="flex flex-col border rounded-md overflow-hidden bg-white">
                              <div className="px-3 py-2 text-xs font-medium bg-muted border-b text-foreground">Pré-visualização ao vivo</div>
                              <iframe
                                srcDoc={emailForm.body_html || "<p style='padding:24px;font-family:sans-serif;color:#888'>Cole HTML para visualizar</p>"}
                                className="flex-1 w-full border-none"
                                sandbox=""
                                title="HTML preview"
                              />
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="preview" className="mt-0">
                          <div className="h-[600px] bg-muted/30 rounded-md p-4 overflow-auto flex justify-center">
                            <div
                              className="bg-white rounded-md shadow-sm overflow-hidden transition-all"
                              style={{
                                width: emailPreviewMode === "mobile" ? 390 : "100%",
                                maxWidth: emailPreviewMode === "mobile" ? 390 : 800,
                                height: "100%",
                              }}
                            >
                              <iframe
                                srcDoc={emailForm.body_html || "<p style='padding:24px;font-family:sans-serif;color:#888'>Sem conteúdo. Use o editor Drag & Drop ou cole um HTML.</p>"}
                                className="w-full h-full border-none"
                                sandbox=""
                                title="Email preview"
                              />
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {emailTemplates.map((t) => {
                  const openEditor = () => {
                    setEmailForm({
                      name: t.name,
                      subject: t.subject || "",
                      body_html: t.body_html || "",
                      category: t.category || "marketing",
                      design: t.design || null,
                    });
                    setEditingEmailId(t.id);
                    setEditingEmailSource(t.source);
                    setEmailDialogOpen(true);
                  };
                  return (
                    <Card key={`${t.source}:${t.id}`} className="overflow-hidden group hover:shadow-md transition-shadow flex flex-col">
                      <button
                        type="button"
                        onClick={() => setEmailPreview(t)}
                        className="relative bg-white h-56 overflow-hidden border-b block w-full text-left"
                        title="Visualizar"
                      >
                        {t.body_html ? (
                          <iframe
                            srcDoc={`<style>html,body{margin:0;padding:0;background:#fff;}body{transform:scale(0.5);transform-origin:top left;width:200%;height:200%;}::-webkit-scrollbar{display:none;}</style>${t.body_html}`}
                            className="w-full h-full border-none pointer-events-none"
                            title={t.name}
                            sandbox=""
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <Mail className="h-10 w-10 opacity-30" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-black/60 backdrop-blur px-2.5 py-1 rounded-md">
                            <Eye className="h-3.5 w-3.5" /> Visualizar
                          </span>
                        </div>
                      </button>

                      <CardHeader className="p-4 pb-2">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-sm font-semibold truncate">{t.name}</CardTitle>
                            <CardDescription className="text-xs truncate mt-0.5">{t.subject || "Sem assunto"}</CardDescription>
                          </div>
                          <Badge variant="outline" className="text-[10px] capitalize shrink-0">{t.category}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-2 mt-auto">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(t.created_at).toLocaleDateString("pt-BR")}
                          </span>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setEmailPreview(t)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" className="h-8" onClick={openEditor}>
                              <Pencil className="h-3 w-3 mr-1.5" /> Editar
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEmailPreview(t)}>
                                  <Eye className="h-4 w-4 mr-2" /> Visualizar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={openEditor}>
                                  <Pencil className="h-4 w-4 mr-2" /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => {
                                  if (confirm("Excluir este template?")) deleteEmailMutation.mutate({ id: t.id, source: t.source });
                                }}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <Dialog open={!!emailPreview} onOpenChange={(o) => { if (!o) setEmailPreview(null); }}>
              <DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 pb-3 border-b">
                  <div className="flex items-center justify-between gap-4 pr-8">
                    <div className="min-w-0 flex-1">
                      <DialogTitle className="text-base truncate">{emailPreview?.name}</DialogTitle>
                      <DialogDescription className="text-xs truncate mt-0.5">
                        Assunto: {emailPreview?.subject || "—"}
                      </DialogDescription>
                    </div>
                    <div className="flex items-center gap-1 bg-muted rounded-md p-0.5 shrink-0">
                      <Button
                        variant={emailPreviewMode === "desktop" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-3 text-xs"
                        onClick={() => setEmailPreviewMode("desktop")}
                      >
                        Desktop
                      </Button>
                      <Button
                        variant={emailPreviewMode === "mobile" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-3 text-xs"
                        onClick={() => setEmailPreviewMode("mobile")}
                      >
                        Mobile
                      </Button>
                    </div>
                  </div>
                </DialogHeader>
                <div className="flex-1 overflow-auto bg-muted/40 p-6 flex justify-center">
                  <div
                    className="bg-white shadow-lg rounded-md overflow-hidden transition-all"
                    style={{
                      width: emailPreviewMode === "mobile" ? 390 : "100%",
                      maxWidth: emailPreviewMode === "mobile" ? 390 : 800,
                      height: "100%",
                    }}
                  >
                    <iframe
                      srcDoc={emailPreview?.body_html || "<p style='padding:24px;font-family:sans-serif;color:#888'>Sem conteúdo</p>"}
                      className="w-full h-full border-none"
                      title={emailPreview?.name}
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
                {emailPreview && (
                  <div className="p-3 border-t flex justify-end gap-2 bg-background">
                    <Button variant="outline" size="sm" onClick={() => setEmailPreview(null)}>Fechar</Button>
                    <Button size="sm" onClick={() => {
                      const t = emailPreview;
                      setEmailForm({
                        name: t.name,
                        subject: t.subject || "",
                        body_html: t.body_html || "",
                        category: t.category || "marketing",
                        design: t.design || null,
                      });
                      setEditingEmailId(t.id);
                      setEditingEmailSource(t.source || "message_templates");
                      setEmailPreview(null);
                      setEmailDialogOpen(true);
                    }}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar template
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
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

// ===== Botão de inserir variável usado no editor de E-mail =====
function EmailVariablePicker({
  target,
  open,
  onOpenChange,
  onSelect,
}: {
  target: "subject" | "body";
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSelect: (token: string) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1">
          <Plus className="h-3.5 w-3.5" />
          <span className="text-xs">Inserir variável</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="p-3 border-b">
          <p className="text-sm font-semibold">Variáveis disponíveis no e-mail</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Insere <code className="text-[10px]">{`{{token}}`}</code> no {target === "subject" ? "assunto" : "corpo HTML"}. O motor de envio substitui pelos dados reais do cliente/pedido.
          </p>
        </div>
        <ScrollArea className="h-[420px]">
          <div className="p-2 space-y-3">
            {EMAIL_TEMPLATE_VARIABLES.map((group) => (
              <div key={group.label}>
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.variables.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => onSelect(v.token)}
                      className="w-full text-left rounded-md px-2 py-1.5 hover:bg-accent transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{v.label}</span>
                        <code className="text-[10px] text-muted-foreground group-hover:text-foreground font-mono whitespace-nowrap">
                          {`{{${v.token}}}`}
                        </code>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{v.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

