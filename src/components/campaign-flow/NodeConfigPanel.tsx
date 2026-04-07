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

interface NodeConfigPanelProps {
  node: Node;
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
}

// Config fields per node type
const nodeConfigs: Record<string, { title: string; fields: FieldDef[] }> = {
  sendWhatsApp: {
    title: "Enviar WhatsApp",
    fields: [
      { key: "template", label: "Template", type: "select", options: ["Carrinho abandonado", "Boas-vindas", "Promoção", "Rastreio"] },
      { key: "delay", label: "Atraso antes de enviar", type: "select", options: ["Sem atraso", "5 minutos", "15 minutos", "1 hora", "1 dia"] },
      { key: "trackClicks", label: "Rastrear cliques", type: "toggle" },
      { key: "fallbackMessage", label: "Mensagem alternativa", type: "textarea", placeholder: "Se o template falhar..." },
    ],
  },
  sendEmail: {
    title: "Enviar E-mail",
    fields: [
      { key: "subject", label: "Assunto", type: "text", placeholder: "Assunto do e-mail" },
      { key: "template", label: "Template", type: "select", options: ["Boas-vindas", "Promoção", "Newsletter"] },
      { key: "from", label: "Remetente", type: "text", placeholder: "nome@empresa.com" },
      { key: "trackOpens", label: "Rastrear aberturas", type: "toggle" },
    ],
  },
  sendSms: {
    title: "Enviar SMS",
    fields: [
      { key: "message", label: "Mensagem", type: "textarea", placeholder: "Conteúdo do SMS (160 chars)" },
      { key: "delay", label: "Atraso antes de enviar", type: "select", options: ["Sem atraso", "5 minutos", "15 minutos", "1 hora"] },
    ],
  },
  sendCall: {
    title: "Ligação telefônica",
    fields: [
      { key: "script", label: "Roteiro", type: "textarea", placeholder: "Roteiro da ligação..." },
      { key: "maxAttempts", label: "Tentativas", type: "select", options: ["1", "2", "3"] },
    ],
  },
  sendWebhook: {
    title: "Enviar Webhook",
    fields: [
      { key: "url", label: "URL", type: "text", placeholder: "https://..." },
      { key: "method", label: "Método", type: "select", options: ["POST", "GET", "PUT"] },
      { key: "headers", label: "Headers (JSON)", type: "textarea", placeholder: '{"Authorization": "Bearer ..."}' },
      { key: "body", label: "Body (JSON)", type: "textarea", placeholder: '{"key": "value"}' },
    ],
  },
  condition: {
    title: "Condição",
    fields: [
      { key: "field", label: "Campo", type: "select", options: ["Tag", "E-mail aberto", "Clicou no link", "Respondeu", "Comprou", "Atributo personalizado"] },
      { key: "operator", label: "Operador", type: "select", options: ["é igual a", "não é igual a", "contém", "não contém", "existe", "não existe"] },
      { key: "value", label: "Valor", type: "text", placeholder: "Valor da condição" },
    ],
  },
  multiCondition: {
    title: "Condição múltipla",
    fields: [
      { key: "logic", label: "Lógica", type: "select", options: ["Todas (AND)", "Qualquer (OR)"] },
      { key: "condition1Field", label: "Condição 1 — Campo", type: "select", options: ["Tag", "E-mail aberto", "Clicou no link", "Respondeu", "Comprou"] },
      { key: "condition1Value", label: "Condição 1 — Valor", type: "text", placeholder: "Valor" },
      { key: "condition2Field", label: "Condição 2 — Campo", type: "select", options: ["Tag", "E-mail aberto", "Clicou no link", "Respondeu", "Comprou"] },
      { key: "condition2Value", label: "Condição 2 — Valor", type: "text", placeholder: "Valor" },
    ],
  },
  randomizer: {
    title: "Randomizador",
    fields: [
      { key: "variant", label: "Variantes", type: "select", options: ["2 (50/50)", "3 (33/33/33)", "4 (25/25/25/25)"] },
      { key: "description", label: "Descrição", type: "text", placeholder: "Ex: Teste A/B mensagem" },
    ],
  },
  wait: {
    title: "Aguardar",
    fields: [
      { key: "duration", label: "Duração", type: "text", placeholder: "Ex: 2" },
      { key: "unit", label: "Unidade", type: "select", options: ["Minutos", "Horas", "Dias"] },
    ],
  },
  waitCondition: {
    title: "Aguardar condição",
    fields: [
      { key: "conditionField", label: "Aguardar até", type: "select", options: ["Responder mensagem", "Clicar no link", "Abrir e-mail", "Comprar"] },
      { key: "timeout", label: "Timeout", type: "text", placeholder: "Ex: 24" },
      { key: "timeoutUnit", label: "Unidade do timeout", type: "select", options: ["Horas", "Dias"] },
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
      { key: "reason", label: "Motivo", type: "select", options: ["Concluída", "Sem resposta", "Outro"] },
      { key: "note", label: "Nota interna", type: "textarea", placeholder: "Nota opcional..." },
    ],
  },
  transferChat: {
    title: "Transferir conversa",
    fields: [
      { key: "department", label: "Departamento", type: "select", options: ["Vendas", "Suporte", "Financeiro", "Outro"] },
      { key: "agent", label: "Agente (opcional)", type: "text", placeholder: "Nome do agente" },
      { key: "note", label: "Nota para o agente", type: "textarea", placeholder: "Contexto da transferência..." },
    ],
  },
  addTag: {
    title: "Adicionar etiqueta",
    fields: [
      { key: "tagName", label: "Nome da etiqueta", type: "text", placeholder: "Ex: cliente-vip" },
      { key: "tagColor", label: "Cor", type: "select", options: ["Verde", "Azul", "Amarelo", "Vermelho", "Roxo"] },
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
      { key: "reason", label: "Motivo de saída", type: "select", options: ["Fluxo concluído", "Não qualificado", "Solicitou remoção", "Outro"] },
    ],
  },
  note: {
    title: "Nota",
    fields: [
      { key: "content", label: "Conteúdo da nota", type: "textarea", placeholder: "Anotação sobre esta etapa do fluxo..." },
    ],
  },
};

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "toggle";
  placeholder?: string;
  options?: string[];
}

function ConfigField({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.type) {
    case "text":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}</Label>
          <Input
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="h-8 text-sm"
          />
        </div>
      );
    case "textarea":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}</Label>
          <Textarea
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="text-sm min-h-[70px] resize-none"
          />
        </div>
      );
    case "select":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}</Label>
          <Select value={(value as string) || ""} onValueChange={onChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
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
  const nodeType = (node.data as Record<string, unknown>).nodeType as string;
  const config = nodeConfigs[nodeType];

  if (!config) {
    return (
      <div className="w-[300px] border-l border-border bg-background flex flex-col h-full">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-sm font-semibold">Configuração</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="p-4 text-xs text-muted-foreground">
          Nenhuma configuração disponível para este nó.
        </div>
      </div>
    );
  }

  const nodeData = node.data as Record<string, unknown>;

  const handleFieldChange = (key: string, value: unknown) => {
    onUpdate(node.id, { ...nodeData, [key]: value });
  };

  return (
    <div className="w-[300px] border-l border-border bg-background flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded flex items-center justify-center"
            style={{ backgroundColor: nodeData.color as string }}
          />
          <span className="text-sm font-semibold">{config.title}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Fields */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {/* Node label */}
          <div className="space-y-1.5">
            <Label className="text-xs">Nome do nó</Label>
            <Input
              value={(nodeData.label as string) || ""}
              onChange={(e) => handleFieldChange("label", e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <Separator />

          {config.fields.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              value={nodeData[field.key]}
              onChange={(v) => handleFieldChange(field.key, v)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
