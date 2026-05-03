import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { Node } from "@xyflow/react";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppPhonePreview } from "@/components/WhatsAppPhonePreview";
import { useAuth } from "@/contexts/AuthContext";

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
): Record<string, { title: string; fields: FieldDef[] }> => ({
  sendWhatsApp: {
    title: "Enviar WhatsApp",
    fields: [
      { key: "template", label: "Template", type: "select", options: whatsappOpts },
      { key: "delay", label: "Atraso antes de enviar", type: "select", options: ["Sem atraso", "5 minutos", "15 minutos", "1 hora", "1 dia"].map(o => ({ value: o, label: o })) },
      { key: "trackClicks", label: "Rastrear cliques", type: "toggle" },
      { key: "fallbackMessage", label: "Mensagem alternativa", type: "textarea", placeholder: "Se o template falhar..." },
    ],
  },
  sendEmail: {
    title: "Enviar E-mail",
    fields: [
      { key: "emailTemplate", label: "Template de E-mail", type: "select", options: emailOpts },
      { key: "fromName", label: "Nome do Remetente", type: "text", placeholder: "Ex: Minha Loja" },
      { key: "subject", label: "Assunto (Sobrescreve template)", type: "text", placeholder: "Deixe vazio para usar o do template" },
      { key: "content", label: "Conteúdo Personalizado (HTML)", type: "textarea", placeholder: "Sobrescreve o template se preenchido" },
      { key: "configurationSet", label: "Configuration Set (SES) — opcional", type: "text", placeholder: "Deixe em branco se não usar" },
    ],
  },
  sendSms: {
    title: "Enviar SMS",
    fields: [
      { key: "message", label: "Mensagem", type: "textarea", placeholder: "Conteúdo do SMS (160 chars)" },
      { key: "delay", label: "Atraso antes de enviar", type: "select", options: ["Sem atraso", "5 minutos", "15 minutos", "1 hora"].map(o => ({ value: o, label: o })) },
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
      { key: "field", label: "Campo", type: "select", options: ["Tag","E-mail aberto","Clicou no link","Respondeu","Comprou","Atributo personalizado"].map(o => ({ value: o, label: o })) },
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
      { key: "content", label: "Conteúdo da nota", type: "textarea", placeholder: "Anotação sobre esta etapa do fluxo..." },
    ],
  },
  startNode: {
    title: "Gatilho",
    fields: [
      { key: "filterProducts", label: "Filtrar por Produtos (ID ou Nome)", type: "text", placeholder: "Ex: SKU1, SKU2" },
      { key: "filterStates", label: "Filtrar por Estados", type: "text", placeholder: "Ex: SP, RJ, MG" },
      { key: "filterDays", label: "Dias da Semana Permitidos", type: "text", placeholder: "Ex: Seg, Ter, Qua" },
    ],
  },
});

function ConfigField({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.type) {
    case "text":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}</Label>
          <Input value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className="h-8 text-sm" />
        </div>
      );
    case "textarea":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}</Label>
          <Textarea value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className="text-sm min-h-[70px] resize-none" />
        </div>
      );
    case "select":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}</Label>
          <Select value={(value as string) || ""} onValueChange={onChange}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
            <SelectContent>
              {field.options?.length
                ? field.options.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)
                : <SelectItem value="__none" disabled>Nenhum item</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      );
    case "toggle":
      return (
        <div className="flex items-center justify-between">
          <Label className="text-xs">{field.label}</Label>
          <Switch checked={!!value} onCheckedChange={onChange} />
        </div>
      );
    default:
      return null;
  }
}

export function NodeConfigPanel({ node, onClose, onUpdate }: NodeConfigPanelProps) {
  const { currentTenant } = useAuth();
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTpl[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTpl[]>([]);

  useEffect(() => {
    const fetchTemplates = async () => {
      if (!currentTenant) return;
      const [waRes, emRes] = await Promise.all([
        supabase.from("message_templates")
          .select("id, name, header_type, header_content, body, footer, buttons, sample_values")
          .eq("tenant_id", currentTenant.id)
          .order("name"),
        supabase.from("email_templates")
          .select("id, name, subject, body_html")
          .eq("tenant_id", currentTenant.id)
          .order("name"),
      ]);
      if (waRes.data) setWhatsappTemplates(waRes.data as WhatsAppTpl[]);
      if (emRes.data) setEmailTemplates(emRes.data as EmailTpl[]);
    };
    fetchTemplates();
  }, [currentTenant]);

  const whatsappOpts = useMemo<TemplateOpt[]>(
    () => whatsappTemplates.map((t) => ({ value: t.name, label: t.name })),
    [whatsappTemplates],
  );
  const emailOpts = useMemo<TemplateOpt[]>(
    () => emailTemplates.map((t) => ({ value: t.name, label: t.name })),
    [emailTemplates],
  );

  const nodeData = node.data as Record<string, unknown>;
  const nodeType = nodeData.nodeType as string;
  const config = getNodeConfigs(whatsappOpts, emailOpts)[nodeType];

  const selectedWhatsApp = useMemo(
    () => whatsappTemplates.find((t) => t.name === nodeData.template),
    [whatsappTemplates, nodeData.template],
  );
  const selectedEmail = useMemo(
    () => emailTemplates.find((t) => t.name === nodeData.emailTemplate),
    [emailTemplates, nodeData.emailTemplate],
  );

  if (!config) {
    return (
      <div className="w-[300px] border-l border-border bg-background flex flex-col h-full">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-sm font-semibold">Configuração</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7"><X className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="p-4 text-xs text-muted-foreground">Nenhuma configuração disponível para este nó.</div>
      </div>
    );
  }

  const handleFieldChange = (key: string, value: unknown) => {
    onUpdate(node.id, { ...nodeData, [key]: value });
  };

  return (
    <div className="w-[340px] border-l border-border bg-background flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: nodeData.color as string }} />
          <span className="text-sm font-semibold">{config.title}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7"><X className="h-3.5 w-3.5" /></Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome do nó</Label>
            <Input value={(nodeData.label as string) || ""} onChange={(e) => handleFieldChange("label", e.target.value)} className="h-8 text-sm" />
          </div>
          <Separator />
          {config.fields.map((field) => (
            <ConfigField key={field.key} field={field} value={nodeData[field.key]} onChange={(v) => handleFieldChange(field.key, v)} />
          ))}

          {/* WhatsApp preview */}
          {nodeType === "sendWhatsApp" && selectedWhatsApp && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Pré-visualização</Label>
                <div className="scale-90 origin-top-left -ml-3">
                  <WhatsAppPhonePreview
                    companyName={currentTenant?.name || "Empresa"}
                    headerType={selectedWhatsApp.header_type || "none"}
                    headerContent={selectedWhatsApp.header_content || ""}
                    body={selectedWhatsApp.body || ""}
                    footer={selectedWhatsApp.footer || ""}
                    buttons={Array.isArray(selectedWhatsApp.buttons) ? (selectedWhatsApp.buttons as { type: string; text: string }[]) : []}
                    sampleValues={Array.isArray(selectedWhatsApp.sample_values) ? (selectedWhatsApp.sample_values as string[]) : []}
                  />
                </div>
              </div>
            </>
          )}

          {/* Email preview */}
          {nodeType === "sendEmail" && selectedEmail && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Pré-visualização</Label>
                <div className="rounded border border-border bg-background overflow-hidden">
                  <div className="px-3 py-2 border-b border-border bg-muted/30">
                    <p className="text-[10px] text-muted-foreground">Assunto</p>
                    <p className="text-xs font-medium truncate">{(nodeData.subject as string) || selectedEmail.subject || "(sem assunto)"}</p>
                  </div>
                  <div className="max-h-[280px] overflow-auto bg-white">
                    <iframe
                      title="email-preview"
                      srcDoc={(nodeData.content as string) || selectedEmail.body_html || "<p style='padding:16px;font-family:sans-serif;color:#666'>Sem conteúdo</p>"}
                      className="w-full h-[280px] border-0"
                      sandbox=""
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
