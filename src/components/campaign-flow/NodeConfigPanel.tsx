import { useState, useEffect, useMemo } from "react";
import { X, AlertTriangle, Settings2, MessageSquare, Mail, Variable, Eye, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Node } from "@xyflow/react";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppPhonePreview } from "@/components/WhatsAppPhonePreview";
import { useAuth } from "@/contexts/AuthContext";
import { ALL_TEMPLATE_VARIABLES, EMAIL_TEMPLATE_VARIABLES } from "@/lib/templateVariables";

interface NodeConfigPanelProps {
  node: Node;
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
}

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "toggle";
  placeholder?: string;
  options?: { value: string; label: string }[];
  hint?: string;
  showWhen?: (data: Record<string, unknown>) => boolean;
}

type TemplateOpt = { value: string; label: string };
type WhatsAppTpl = {
  id: string;
  name: string;
  header_type: string | null;
  header_content: string | null;
  body: string;
  footer: string | null;
  buttons: unknown;
  sample_values: unknown;
};
type EmailTpl = { id: string; name: string; subject: string | null; body_html: string | null };

const getNodeConfigs = (
  whatsappOpts: TemplateOpt[],
  emailOpts: TemplateOpt[],
  automationOpts: TemplateOpt[],
): Record<string, { title: string; fields: FieldDef[] }> => ({
  sendWhatsApp: {
    title: "Enviar WhatsApp",
    fields: [
      {
        key: "messageMode", label: "Tipo de mensagem", type: "select",
        options: [
          { value: "template", label: "Template HSM (aprovado pela Meta)" },
          { value: "text", label: "Texto livre (dentro da janela 24h)" },
        ],
        hint: "Texto livre só funciona após o cliente responder",
      },
      {
        key: "template", label: "Template", type: "select", options: whatsappOpts,
        hint: "Modelo HSM aprovado pela Meta",
        showWhen: (d) => (d.messageMode as string) !== "text",
      },
      {
        key: "messageText", label: "Mensagem (texto livre)", type: "textarea",
        placeholder: "Ex: order.pix_code",
        hint: "Use variáveis como order.pix_code",
        showWhen: (d) => (d.messageMode as string) === "text",
      },
      {
        key: "replyWaitWindow", label: "Janela de espera por resposta", type: "select",
        options: ["30 minutos", "1 hora", "3 horas", "6 horas", "12 horas", "24 horas"].map(o => ({ value: o, label: o })),
        hint: "Tempo até cair no \"Se não responder\"",
      },
      { key: "delay", label: "Atraso antes de enviar", type: "select", options: ["Sem atraso", "5 minutos", "15 minutos", "1 hora", "1 dia"].map(o => ({ value: o, label: o })) },
      { key: "trackClicks", label: "Rastrear cliques", type: "toggle", hint: "Cria shortlinks rastreados com UTMs do WhatsApp" },
      { key: "fallbackEnabled", label: "Fallback por e-mail", type: "toggle", hint: "Dispara e-mail se WhatsApp falhar" },
      { key: "fallbackEmailTemplate", label: "Template fallback", type: "select", options: emailOpts },
    ],
  },
  sendEmail: {
    title: "Enviar E-mail",
    fields: [
      { key: "emailTemplate", label: "Template", type: "select", options: emailOpts },
      { key: "fromName", label: "Nome do remetente", type: "text", placeholder: "Ex: Maxfem" },
      { key: "subject", label: "Assunto (sobrescreve)", type: "text", placeholder: "Vazio = usa do template" },
      { key: "configurationSet", label: "Configuration Set (SES)", type: "text", placeholder: "Opcional" },
    ],
  },
  sendSms: {
    title: "Enviar SMS",
    fields: [
      { key: "message", label: "Mensagem", type: "textarea", placeholder: "Conteúdo do SMS (160 chars)" },
      { key: "delay", label: "Atraso", type: "select", options: ["Sem atraso", "5 minutos", "15 minutos", "1 hora"].map(o => ({ value: o, label: o })) },
    ],
  },
  sendCall: {
    title: "Ligação telefônica",
    fields: [
      { key: "script", label: "Roteiro", type: "textarea", placeholder: "Roteiro da ligação..." },
      { key: "maxAttempts", label: "Tentativas", type: "select", options: ["1","2","3"].map(o => ({ value: o, label: o })) },
    ],
  },
  sendWebhook: {
    title: "Enviar Webhook",
    fields: [
      { key: "url", label: "URL", type: "text", placeholder: "https://..." },
      { key: "method", label: "Método", type: "select", options: ["POST","GET","PUT"].map(o => ({ value: o, label: o })) },
      { key: "headers", label: "Headers (JSON)", type: "textarea", placeholder: '{"Authorization": "Bearer ..."}' },
      { key: "body", label: "Body (JSON)", type: "textarea", placeholder: '{"key": "value"}' },
    ],
  },
  condition: {
    title: "Condição",
    fields: [
      { key: "field", label: "Campo", type: "select", options: ["Tag","E-mail aberto","Clicou no link","Respondeu","Comprou","Atributo personalizado", "Estado", "Produto"].map(o => ({ value: o, label: o })) },
      { key: "operator", label: "Operador", type: "select", options: ["é igual a","não é igual a","contém","não contém","existe","não existe"].map(o => ({ value: o, label: o })) },
      { key: "value", label: "Valor", type: "text", placeholder: "Valor da condição" },
    ],
  },
  multiCondition: {
    title: "Condição múltipla",
    fields: [
      { key: "logic", label: "Lógica", type: "select", options: ["Todas (AND)","Qualquer (OR)"].map(o => ({ value: o, label: o })) },
      { key: "condition1Field", label: "Condição 1 — Campo", type: "select", options: ["Tag","E-mail aberto","Clicou no link","Respondeu","Comprou"].map(o => ({ value: o, label: o })) },
      { key: "condition1Value", label: "Condição 1 — Valor", type: "text", placeholder: "Valor" },
      { key: "condition2Field", label: "Condição 2 — Campo", type: "select", options: ["Tag","E-mail aberto","Clicou no link","Respondeu","Comprou"].map(o => ({ value: o, label: o })) },
      { key: "condition2Value", label: "Condição 2 — Valor", type: "text", placeholder: "Valor" },
    ],
  },
  randomizer: {
    title: "Randomizador",
    fields: [
      { key: "variant", label: "Variantes", type: "select", options: ["2 (50/50)","3 (33/33/33)","4 (25/25/25/25)"].map(o => ({ value: o, label: o })) },
      { key: "description", label: "Descrição", type: "text", placeholder: "Ex: Teste A/B mensagem" },
    ],
  },
  wait: {
    title: "Aguardar",
    fields: [
      { key: "duration", label: "Duração", type: "text", placeholder: "Ex: 2" },
      { key: "unit", label: "Unidade", type: "select", options: ["Minutos","Horas","Dias"].map(o => ({ value: o, label: o })) },
    ],
  },
  waitCondition: {
    title: "Aguardar condição",
    fields: [
      { key: "conditionField", label: "Aguardar até", type: "select", options: ["Responder mensagem","Clicar no link","Abrir e-mail","Comprar"].map(o => ({ value: o, label: o })) },
      { key: "timeout", label: "Timeout", type: "text", placeholder: "Ex: 24" },
      { key: "timeoutUnit", label: "Unidade do timeout", type: "select", options: ["Horas","Dias"].map(o => ({ value: o, label: o })) },
    ],
  },
  waitDate: {
    title: "Aguardar data e hora",
    fields: [
      { key: "date", label: "Data", type: "text", placeholder: "DD/MM/AAAA" },
      { key: "time", label: "Hora", type: "text", placeholder: "HH:MM" },
    ],
  },
  archiveChat: {
    title: "Arquivar conversa",
    fields: [
      { key: "reason", label: "Motivo", type: "select", options: ["Concluída","Sem resposta","Outro"].map(o => ({ value: o, label: o })) },
      { key: "note", label: "Nota interna", type: "textarea", placeholder: "Nota opcional..." },
    ],
  },
  transferChat: {
    title: "Transferir conversa",
    fields: [
      { key: "department", label: "Departamento", type: "select", options: ["Vendas","Suporte","Financeiro","Outro"].map(o => ({ value: o, label: o })) },
      { key: "agent", label: "Agente (opcional)", type: "text", placeholder: "Nome do agente" },
      { key: "note", label: "Nota para o agente", type: "textarea", placeholder: "Contexto da transferência..." },
    ],
  },
  addTag: {
    title: "Adicionar etiqueta",
    fields: [
      { key: "tagName", label: "Nome da etiqueta", type: "text", placeholder: "Ex: cliente-vip" },
      { key: "tagColor", label: "Cor", type: "select", options: ["Verde","Azul","Amarelo","Vermelho","Roxo"].map(o => ({ value: o, label: o })) },
    ],
  },
  triggerAutomation: {
    title: "Disparar automação",
    fields: [
      {
        key: "targetAutomationId",
        label: "Automação alvo",
        type: "select",
        options: automationOpts,
        hint: "Quando o contato passar por este nó, será enfileirado também nesta automação.",
      },
      {
        key: "mode",
        label: "Modo",
        type: "select",
        options: [
          { value: "parallel", label: "Em paralelo (continuar esta + nova)" },
          { value: "exclusive", label: "Substituir (encerrar esta, iniciar nova)" },
        ],
        hint: "Em paralelo: o fluxo atual segue normalmente. Substituir: este fluxo termina aqui.",
      },
      {
        key: "delayMinutes",
        label: "Atraso (minutos)",
        type: "select",
        options: ["0", "5", "15", "60", "1440"].map((v) => ({
          value: v,
          label: v === "0" ? "Disparar imediatamente" : v === "1440" ? "Depois de 1 dia" : `Depois de ${v} min`,
        })),
      },
      {
        key: "deduplicate",
        label: "Não disparar se contato já está na automação alvo",
        type: "toggle",
        hint: "Evita o mesmo contato entrar 2x no mesmo fluxo.",
      },
    ],
  },
  removeTag: {
    title: "Remover etiqueta",
    fields: [
      { key: "tagName", label: "Nome da etiqueta", type: "text", placeholder: "Ex: lead-frio" },
    ],
  },
  exit: {
    title: "Sair",
    fields: [
      { key: "reason", label: "Motivo de saída", type: "select", options: ["Fluxo concluído","Não qualificado","Solicitou remoção","Outro"].map(o => ({ value: o, label: o })) },
    ],
  },
  note: {
    title: "Nota",
    fields: [
      { key: "content", label: "Conteúdo da nota", type: "textarea", placeholder: "Anotação sobre esta etapa..." },
    ],
  },
  startNode: {
    title: "Gatilho",
    fields: [
      { key: "filterProducts", label: "Filtrar por produtos (SKU/nome)", type: "text", placeholder: "Ex: SKU1, SKU2" },
      { key: "filterStates", label: "Filtrar por estados", type: "text", placeholder: "Ex: SP, RJ, MG" },
      { key: "filterDays", label: "Dias da semana permitidos", type: "text", placeholder: "Ex: Seg, Ter, Qua" },
    ],
  },
});

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </Label>
      {hint && <span className="text-[10px] text-muted-foreground/60 italic">{hint}</span>}
    </div>
  );
}

function ConfigField({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.type) {
    case "text":
      return (
        <div>
          <FieldLabel hint={field.hint}>{field.label}</FieldLabel>
          <Input
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="h-9 text-sm"
          />
        </div>
      );
    case "textarea":
      return (
        <div>
          <FieldLabel hint={field.hint}>{field.label}</FieldLabel>
          <Textarea
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="text-sm min-h-[90px] resize-none leading-relaxed"
          />
        </div>
      );
    case "select":
      return (
        <div>
          <FieldLabel hint={field.hint}>{field.label}</FieldLabel>
          <Select value={(value as string) || ""} onValueChange={onChange}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              {field.options?.length
                ? field.options.map((opt) => <SelectItem key={opt.value} value={opt.value} className="text-sm">{opt.label}</SelectItem>)
                : <SelectItem value="__none" disabled className="text-sm">Nenhum item</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      );
    case "toggle":
      return (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
          <div className="space-y-0.5 flex-1">
            <Label className="text-xs font-semibold text-foreground">{field.label}</Label>
            {field.hint && <p className="text-[10px] text-muted-foreground leading-snug">{field.hint}</p>}
          </div>
          <Switch checked={!!value} onCheckedChange={onChange} />
        </div>
      );
    default:
      return null;
  }
}

// Variable picker — autocomplete from token list
function VariableTokenPicker({
  value,
  onChange,
  placeholder,
  variableGroups = ALL_TEMPLATE_VARIABLES,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  variableGroups?: typeof ALL_TEMPLATE_VARIABLES;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return variableGroups;
    const q = search.toLowerCase();
    return variableGroups
      .map((g) => ({
        ...g,
        variables: g.variables.filter(
          (v) =>
            v.token.toLowerCase().includes(q) ||
            v.label.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.variables.length > 0);
  }, [search, variableGroups]);

  return (
    <div className="flex gap-1.5">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "customer.first_name"}
        className="h-9 text-sm font-mono flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
            <Variable className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="p-2 border-b border-border/40">
            <Input
              placeholder="Buscar variável..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
              autoFocus
            />
          </div>
          <ScrollArea className="h-72">
            <div className="p-2 space-y-3">
              {filteredGroups.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">Nada encontrado</p>
              )}
              {filteredGroups.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 mb-1">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.variables.map((v) => (
                      <button
                        key={v.token}
                        type="button"
                        onClick={() => {
                          onChange(v.token);
                          setOpen(false);
                          setSearch("");
                        }}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-accent transition-colors"
                      >
                        <p className="text-xs font-mono text-primary">{v.token}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {v.label} · {v.description}
                        </p>
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
  );
}

export function NodeConfigPanel({ node, onClose, onUpdate }: NodeConfigPanelProps) {
  const { currentTenant } = useAuth();
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTpl[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTpl[]>([]);
  const [automations, setAutomations] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchTemplates = async () => {
      if (!currentTenant) return;
      const [waRes, messageEmailRes, legacyEmailRes] = await Promise.all([
        supabase.from("message_templates")
          .select("id, name, header_type, header_content, body, footer, buttons, sample_values, status")
          .eq("tenant_id", currentTenant.id)
          .or("channel.eq.whatsapp,channel.is.null")
          .eq("status", "approved")
          .order("name"),
        supabase.from("message_templates")
          .select("id, name, subject, body_html")
          .eq("tenant_id", currentTenant.id)
          .eq("channel", "email")
          .order("name"),
        supabase.from("email_templates")
          .select("id, name, subject, body_html")
          .eq("tenant_id", currentTenant.id)
          .order("name"),
      ]);
      if (waRes.data) setWhatsappTemplates(waRes.data as WhatsAppTpl[]);

      // Lista automações disponíveis pra serem alvo do nó "Disparar automação".
      // Exclui a campanha atual (não dá pra fazer loop pra si mesma) — feito no useMemo abaixo.
      const { data: autos } = await supabase
        .from("campaigns")
        .select("id, name")
        .eq("tenant_id", currentTenant.id)
        .eq("kind", "automation")
        .order("name");
      setAutomations(autos || []);
      const messageEmailItems: EmailTpl[] = ((messageEmailRes.data as EmailTpl[]) || []).map((t) => ({
        id: t.id, name: t.name, subject: t.subject ?? null, body_html: t.body_html ?? null,
      }));
      const legacyEmailItems: EmailTpl[] = ((legacyEmailRes.data as EmailTpl[]) || []).map((t) => ({
        id: t.id, name: t.name, subject: t.subject ?? null, body_html: t.body_html ?? null,
      }));
      const seen = new Set<string>();
      const merged: EmailTpl[] = [];
      for (const t of [...messageEmailItems, ...legacyEmailItems]) {
        if (!seen.has(t.name)) { seen.add(t.name); merged.push(t); }
      }
      setEmailTemplates(merged);
    };
    void fetchTemplates();
  }, [currentTenant]);

  const whatsappOpts = useMemo<TemplateOpt[]>(
    () => whatsappTemplates.map((t) => ({ value: t.name, label: t.name })),
    [whatsappTemplates],
  );
  const emailOpts = useMemo<TemplateOpt[]>(
    () => emailTemplates.map((t) => ({ value: t.name, label: t.name })),
    [emailTemplates],
  );
  const automationOpts = useMemo<TemplateOpt[]>(
    () => automations.map((a) => ({ value: a.id, label: a.name })),
    [automations],
  );

  const nodeData = node.data as Record<string, unknown>;
  const nodeType = (nodeData.nodeType as string) || (node.type as string);
  const config = getNodeConfigs(whatsappOpts, emailOpts, automationOpts)[nodeType];

  const selectedWhatsApp = useMemo(
    () => whatsappTemplates.find((t) => t.name === nodeData.template),
    [whatsappTemplates, nodeData.template],
  );
  const selectedEmail = useMemo(
    () => emailTemplates.find((t) => t.name === nodeData.emailTemplate),
    [emailTemplates, nodeData.emailTemplate],
  );

  // Detect template variables in body
  const templateVariables = useMemo(() => {
    if (!selectedWhatsApp?.body) return [];
    const matches = [...selectedWhatsApp.body.matchAll(/\{\{(\d+)\}\}/g)];
    const nums = [...new Set(matches.map((m) => parseInt(m[1], 10)))].sort((a, b) => a - b);
    return nums;
  }, [selectedWhatsApp]);

  // Detect button URL variables (separate space from body)
  const buttonUrlVariable = useMemo(() => {
    const btns = Array.isArray(selectedWhatsApp?.buttons) ? (selectedWhatsApp.buttons as { type: string; url?: string }[]) : [];
    const urlBtn = btns.find((b) => b.type === "URL" && b.url?.includes("{{1}}"));
    return urlBtn ? urlBtn.url : null;
  }, [selectedWhatsApp]);

  const variableOverrides = (nodeData.variableOverrides as Record<string, string>) || {};
  const effectiveVariableValues = useMemo(() => {
    const samples = (selectedWhatsApp?.sample_values as string[]) || [];
    return templateVariables.map((n) => ({
      index: n,
      defaultValue: samples[n - 1] || "",
      currentValue: variableOverrides[String(n)] ?? (samples[n - 1] || ""),
      isOverridden: variableOverrides[String(n)] !== undefined,
    }));
  }, [templateVariables, selectedWhatsApp, variableOverrides]);

  if (!config) {
    return (
      <div className="w-[380px] border-l border-border bg-background flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="text-sm font-semibold">Configuração</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7"><X className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="p-4 text-xs text-muted-foreground">Nenhuma configuração disponível para este nó.</div>
      </div>
    );
  }

  const handleFieldChange = (key: string, value: unknown) => {
    const next: Record<string, unknown> = { ...nodeData, [key]: value };
    // Quando o user escolhe a automação alvo, salva o nome junto pro card
    // no canvas mostrar "→ Nome da automação" em vez do UUID
    if (key === "targetAutomationId" && typeof value === "string") {
      const found = automations.find((a) => a.id === value);
      if (found) next.targetAutomationName = found.name;
    }
    onUpdate(node.id, next);
  };

  const handleVariableOverride = (index: number, value: string, defaultValue: string) => {
    const current = { ...variableOverrides };
    if (!value.trim() || value === defaultValue) {
      delete current[String(index)];
    } else {
      current[String(index)] = value;
    }
    handleFieldChange("variableOverrides", current);
  };

  const isWhatsApp = nodeType === "sendWhatsApp";
  const isEmail = nodeType === "sendEmail";
  const isTextMode = isWhatsApp && (nodeData.messageMode as string) === "text";
  const hasTextMessage = isTextMode && !!String(nodeData.messageText || "").trim();
  const hasTemplate =
    (isWhatsApp && (selectedWhatsApp || hasTextMessage)) || (isEmail && selectedEmail);
  const showVariablesTab = isWhatsApp && templateVariables.length > 0;
  const showPreviewTab = (isWhatsApp && selectedWhatsApp) || (isEmail && selectedEmail);

  const NodeIcon = isWhatsApp ? MessageSquare : isEmail ? Mail : Settings2;

  return (
    <div className="w-[400px] border-l border-border bg-background flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-muted/40 to-muted/10">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center shadow-sm" style={{ backgroundColor: (nodeData.color as string) || "#6366f1" }}>
            <NodeIcon className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground leading-tight">{config.title}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{nodeType}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Identification (always visible above tabs) */}
      <div className="px-4 py-3 border-b border-border/40 space-y-2 bg-muted/10">
        <Input
          value={(nodeData.label as string) || ""}
          onChange={(e) => handleFieldChange("label", e.target.value)}
          className="h-8 text-sm font-medium"
          placeholder="Nome do nó (ex: Enviar Cupom)"
        />
        <Input
          value={(nodeData.subtitle as string) || ""}
          onChange={(e) => handleFieldChange("subtitle", e.target.value)}
          className="h-7 text-xs text-muted-foreground"
          placeholder="Subtítulo exibido no card (opcional)"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="config" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-background h-10 px-2 gap-1">
          <TabsTrigger value="config" className="data-[state=active]:bg-muted text-xs gap-1.5 h-8">
            <Settings2 className="h-3.5 w-3.5" />
            Configuração
          </TabsTrigger>
          {showVariablesTab && (
            <TabsTrigger value="variables" className="data-[state=active]:bg-muted text-xs gap-1.5 h-8">
              <Variable className="h-3.5 w-3.5" />
              Variáveis
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{templateVariables.length}</Badge>
            </TabsTrigger>
          )}
          {showPreviewTab && (
            <TabsTrigger value="preview" className="data-[state=active]:bg-muted text-xs gap-1.5 h-8">
              <Eye className="h-3.5 w-3.5" />
              Preview
            </TabsTrigger>
          )}
        </TabsList>

        <ScrollArea className="flex-1">
          {/* Tab: Configuração */}
          <TabsContent value="config" className="p-4 space-y-4 m-0">
            {config.fields
              .filter((field) => !field.showWhen || field.showWhen(nodeData))
              .map((field) => (
                <ConfigField
                  key={field.key}
                  field={field}
                  value={nodeData[field.key]}
                  onChange={(v) => handleFieldChange(field.key, v)}
                />
              ))}

            {/* WhatsApp button URL section (separate from body vars) */}
            {isWhatsApp && buttonUrlVariable && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Botão dinâmico detectado</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Template usa <code className="bg-muted px-1 rounded text-[10px]">{buttonUrlVariable}</code>.
                  O CRM gera shortlink automaticamente conforme o gatilho. Override manual:
                </p>
                <Input
                  value={(nodeData.linkUrl as string) || ""}
                  onChange={(e) => handleFieldChange("linkUrl", e.target.value)}
                  placeholder="https://maxfem.tech/promo (opcional)"
                  className="h-8 text-xs"
                />
              </div>
            )}
          </TabsContent>

          {/* Tab: Variáveis */}
          {showVariablesTab && selectedWhatsApp && (
            <TabsContent value="variables" className="p-4 space-y-4 m-0">
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Override dos valores das variáveis do template <code className="bg-background px-1 rounded text-foreground">{selectedWhatsApp.name}</code>.
                  Deixe vazio pra usar o padrão do template.
                </p>
              </div>

              {effectiveVariableValues.map(({ index, defaultValue, currentValue, isOverridden }) => (
                <div key={index} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[11px] font-mono">
                        {`{{${index}}}`}
                      </code>
                      {isOverridden && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-amber-500 text-amber-600">
                          override
                        </Badge>
                      )}
                    </Label>
                    {isOverridden && (
                      <button
                        onClick={() => handleVariableOverride(index, "", defaultValue)}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Resetar
                      </button>
                    )}
                  </div>
                  <VariableTokenPicker
                    value={currentValue}
                    onChange={(v) => handleVariableOverride(index, v, defaultValue)}
                    placeholder={defaultValue || "customer.first_name"}
                  />
                  {defaultValue && (
                    <p className="text-[10px] text-muted-foreground/70 pl-0.5">
                      Padrão do template: <code className="text-foreground/60">{defaultValue}</code>
                    </p>
                  )}
                </div>
              ))}
            </TabsContent>
          )}

          {/* Tab: Preview */}
          {showPreviewTab && (
            <TabsContent value="preview" className="p-4 m-0">
              {isWhatsApp && selectedWhatsApp && (
                <div className="bg-muted/20 rounded-lg p-3 overflow-hidden">
                  <div className="scale-90 origin-top">
                    <WhatsAppPhonePreview
                      companyName={currentTenant?.name || "Empresa"}
                      headerType={selectedWhatsApp.header_type || "none"}
                      headerContent={selectedWhatsApp.header_content || ""}
                      body={selectedWhatsApp.body || ""}
                      footer={selectedWhatsApp.footer || ""}
                      buttons={Array.isArray(selectedWhatsApp.buttons) ? (selectedWhatsApp.buttons as { type: string; text: string }[]) : []}
                      sampleValues={effectiveVariableValues.map((v) => v.currentValue)}
                    />
                  </div>
                </div>
              )}
              {isEmail && selectedEmail && (
                <div className="rounded-lg border border-border bg-white overflow-hidden shadow-sm">
                  <div className="px-3 py-2 border-b border-border bg-muted/30">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Assunto</p>
                    <p className="text-xs font-semibold truncate text-foreground">
                      {(nodeData.subject as string) || selectedEmail.subject || "(sem assunto)"}
                    </p>
                  </div>
                  <iframe
                    title="email-preview"
                    srcDoc={(nodeData.content as string) || selectedEmail.body_html || "<p style='padding:16px;font-family:sans-serif;color:#666'>Sem conteúdo</p>"}
                    className="w-full h-[360px] border-0 bg-white"
                    sandbox=""
                  />
                </div>
              )}
            </TabsContent>
          )}
        </ScrollArea>
      </Tabs>

      {/* Footer */}
      {!hasTemplate && (isWhatsApp || isEmail) && (
        <div className="px-4 py-2.5 border-t border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
            {isTextMode
              ? "Escreva a mensagem de texto pra ativar este nó."
              : "Selecione um template pra ativar este nó."}
          </p>
        </div>
      )}
    </div>
  );
}
