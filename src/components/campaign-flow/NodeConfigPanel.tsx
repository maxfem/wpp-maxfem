import React, { useState, useEffect, useMemo } from "react";
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
  type: "text" | "textarea" | "select" | "toggle" | "multiAutocomplete";
  placeholder?: string;
  options?: { value: string; label: string }[];
  hint?: string;
  showWhen?: (data: Record<string, unknown>) => boolean;
  source?: "products" | "states" | "weekdays";
}

const BR_STATES: { value: string; label: string }[] = [
  { value: "AC", label: "AC — Acre" }, { value: "AL", label: "AL — Alagoas" },
  { value: "AM", label: "AM — Amazonas" }, { value: "AP", label: "AP — Amapá" },
  { value: "BA", label: "BA — Bahia" }, { value: "CE", label: "CE — Ceará" },
  { value: "DF", label: "DF — Distrito Federal" }, { value: "ES", label: "ES — Espírito Santo" },
  { value: "GO", label: "GO — Goiás" }, { value: "MA", label: "MA — Maranhão" },
  { value: "MG", label: "MG — Minas Gerais" }, { value: "MS", label: "MS — Mato Grosso do Sul" },
  { value: "MT", label: "MT — Mato Grosso" }, { value: "PA", label: "PA — Pará" },
  { value: "PB", label: "PB — Paraíba" }, { value: "PE", label: "PE — Pernambuco" },
  { value: "PI", label: "PI — Piauí" }, { value: "PR", label: "PR — Paraná" },
  { value: "RJ", label: "RJ — Rio de Janeiro" }, { value: "RN", label: "RN — Rio Grande do Norte" },
  { value: "RO", label: "RO — Rondônia" }, { value: "RR", label: "RR — Roraima" },
  { value: "RS", label: "RS — Rio Grande do Sul" }, { value: "SC", label: "SC — Santa Catarina" },
  { value: "SE", label: "SE — Sergipe" }, { value: "SP", label: "SP — São Paulo" },
  { value: "TO", label: "TO — Tocantins" },
];

const WEEKDAYS: { value: string; label: string }[] = [
  { value: "Seg", label: "Seg — Segunda-feira" }, { value: "Ter", label: "Ter — Terça-feira" },
  { value: "Qua", label: "Qua — Quarta-feira" }, { value: "Qui", label: "Qui — Quinta-feira" },
  { value: "Sex", label: "Sex — Sexta-feira" }, { value: "Sáb", label: "Sáb — Sábado" },
  { value: "Dom", label: "Dom — Domingo" },
];

// Produtos Maxfem (SKU + nome) — extraído de bling_pedidos.itens últimos 90d
// 49 SKUs reais com volume + variantes de busca por nome
const MAXFEM_PRODUCTS: { value: string; label: string }[] = [
  // Imunofem cápsulas (kits)
  { value: "KIT1IMUNO", label: "KIT1IMUNO — Imunofem Kit 1 mês" },
  { value: "KIT2IMUNO", label: "KIT2IMUNO — Imunofem Kit 2 meses" },
  { value: "KIT3IMUNO", label: "KIT3IMUNO — Imunofem Kit 3 meses" },
  { value: "KIT5IMUNO", label: "KIT5IMUNO — Imunofem Kit 5 meses" },
  { value: "IMUNOFEM1", label: "IMUNOFEM1 — Imunofem 1 frasco" },
  { value: "IMUNOFEM2", label: "IMUNOFEM2 — 2 Imunofem (envio imediato)" },
  { value: "IMUNO60", label: "IMUNO60 — Imunofem Candidíase 60 cáps" },
  { value: "IMUNO180", label: "IMUNO180 — Imunofem Candidíase 180 cáps" },
  { value: "IMUNO300", label: "IMUNO300 — Imunofem Candidíase 300 cáps" },
  { value: "Imunofem", label: "Imunofem (nome genérico)" },

  // Imunofem Gummy
  { value: "GUMMYKIT1", label: "GUMMYKIT1 — Imunofem Gummy Kit 1 mês" },
  { value: "GUMMYKIT3", label: "GUMMYKIT3 — Imunofem Gummy Kit 3 meses" },
  { value: "GUMMYKIT5", label: "GUMMYKIT5 — Imunofem Gummy Kit 5 meses" },
  { value: "GUMMY1", label: "GUMMY1 — Imunofem Gummy avulso" },
  { value: "2GUMMYIMUNO1", label: "2GUMMYIMUNO1 — 2 Gummy + Imunofem" },
  { value: "GUMMYIMUNO", label: "GUMMYIMUNO — Imunofem Gummy + Imunofem" },
  { value: "Imunofem Gummy", label: "Imunofem Gummy (nome)" },

  // Sérum Clareador
  { value: "SCLAREADOR", label: "SCLAREADOR — Sérum Clareador Maxfem" },
  { value: "SCLAREADOR-1", label: "SCLAREADOR-1 — Sérum Clareador 1 unidade" },
  { value: "SCLAREADOR2", label: "SCLAREADOR2 — Sérum Clareador 2 unidades" },
  { value: "SCLAREADOR-2", label: "SCLAREADOR-2 — Sérum Clareador 3 unidades" },
  { value: "SCLAREADOR-3", label: "SCLAREADOR-3 — Sérum Clareador (3 unid)" },
  { value: "SCLAREADOR-5", label: "SCLAREADOR-5 — Sérum Clareador 5 unidades" },
  { value: "Sérum Clareador", label: "Sérum Clareador (nome)" },

  // Sérum Firmador
  { value: "SFIRMADOR", label: "SFIRMADOR — Sérum Firmador Maxfem" },
  { value: "SFIRMADOR-5", label: "SFIRMADOR-5 — Sérum Firmador 5 unidades" },
  { value: "Sérum Firmador", label: "Sérum Firmador (nome)" },

  // Kit Sérum
  { value: "KITSERUM", label: "KITSERUM — Kit Sérum Maxfem (Firmador + Clareador)" },
  { value: "KITSERUM2", label: "KITSERUM2 — Kit PPK Perfeita (2 Clareador + 2 Firmador)" },

  // Menovital
  { value: "KIT1MENO", label: "KIT1MENO — Menovital Kit 1 mês" },
  { value: "KIT3MENO", label: "KIT3MENO — Menovital Kit 3 meses" },
  { value: "KIT5MENO", label: "KIT5MENO — Menovital Kit 5 meses" },
  { value: "MENOVITAL1", label: "MENOVITAL1 — Menovital 1 frasco" },
  { value: "Menovital", label: "Menovital (nome)" },
  { value: "KITIMUNOVITAL", label: "KITIMUNOVITAL — Kit 2 Imunofem + 1 Menovital" },

  // Noite
  { value: "KIT1NOITE", label: "KIT1NOITE — Maxfem Noite Kit 1 mês" },
  { value: "KIT3NOITE", label: "KIT3NOITE — Maxfem Noite Kit 3 meses" },
  { value: "NOITE1", label: "NOITE1 — Maxfem Noite 1 frasco" },
  { value: "KUOVT190UD", label: "KUOVT190UD — Maxfem Noite Oferta Exclusiva" },
  { value: "Maxfem Noite", label: "Maxfem Noite (nome)" },

  // Cheirozinha
  { value: "CHEIROZINHA1", label: "CHEIROZINHA1 — Cheirozinha Body Splash" },
  { value: "CHEIROZINHAC", label: "CHEIROZINHAC — Kit Cheirozinha + Clareador" },
  { value: "CHEIROZINHAF", label: "CHEIROZINHAF — Kit Cheirozinha + Firmador" },
  { value: "Cheirozinha", label: "Cheirozinha (nome)" },

  // NAC Ultra
  { value: "NACULTRA1", label: "NACULTRA1 — Maxfem NAC 600mg" },
  { value: "NAC1", label: "NAC1 — Maxfem NAC Ultra Kit 1 mês" },
  { value: "NAC Ultra", label: "NAC Ultra (nome)" },

  // PPK / Kits combo
  { value: "PPKSPODEROSA", label: "PPKSPODEROSA — PPK Super Poderosa" },
  { value: "DETOX1PPK", label: "DETOX1PPK — 2 Imunofem + 1 Noite" },
  { value: "IMUNOCLARE", label: "IMUNOCLARE — Kit Prikito (Imunofem + Clareador)" },
  { value: "IMUNOMAIS2", label: "IMUNOMAIS2 — Kit 3 Imunofem + 2 brindes" },
  { value: "GUMMYCLARE", label: "GUMMYCLARE — Imunofem Gummy + Clareador" },
  { value: "KIT4S", label: "KIT4S — Gummy + Imunofem + Noite + Menovital" },
  { value: "KITCUIDADODIARIO", label: "KITCUIDADODIARIO — Kit Cuidado Diário" },
  { value: "KITCOSMETICO", label: "KITCOSMETICO — Kit Cosmético" },

  // Brindes
  { value: "BONE", label: "BONE — Boné brinde" },
  { value: "BRINDEB", label: "BRINDEB — Bag brinde" },
  { value: "BOLSINHAB", label: "BOLSINHAB — Bolsinha brinde" },
];

const OPTION_SOURCES: Record<string, { value: string; label: string }[]> = {
  products: MAXFEM_PRODUCTS,
  states: BR_STATES,
  weekdays: WEEKDAYS,
};

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
      { key: "filterProducts", label: "Filtrar por produtos (SKU/nome)", type: "multiAutocomplete", source: "products", placeholder: "Digite 3 caracteres pra buscar (ex: gumm)" },
      { key: "filterStates", label: "Filtrar por estados", type: "multiAutocomplete", source: "states", placeholder: "Digite 2 letras (ex: SP, RJ)" },
      { key: "filterDays", label: "Dias da semana permitidos", type: "multiAutocomplete", source: "weekdays", placeholder: "Digite (ex: seg, ter)" },
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

function MultiAutocompleteField({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const options = field.source ? OPTION_SOURCES[field.source] || [] : [];
  // value é string CSV: "GUMMY1, SCLAREADOR"
  const parts = String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const [input, setInput] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const MIN = field.source === "states" ? 1 : field.source === "weekdays" ? 1 : 3;

  const matches = React.useMemo(() => {
    if (input.length < MIN) return [];
    const q = input.toLowerCase();
    return options
      .filter((o) => !parts.includes(o.value))
      .filter((o) => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [input, parts, options, MIN]);

  function addChip(v: string) {
    if (!v) return;
    if (parts.includes(v)) return;
    onChange([...parts, v].join(", "));
    setInput("");
  }
  function removeChip(v: string) {
    onChange(parts.filter((p) => p !== v).join(", "));
  }

  return (
    <div>
      <FieldLabel hint={field.hint}>{field.label}</FieldLabel>
      <div className="border border-input rounded-md bg-background px-2 py-1.5 min-h-[36px] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
        <div className="flex flex-wrap gap-1 items-center">
          {parts.map((p) => (
            <span key={p} className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-[11px]">
              {p}
              <button
                type="button"
                onClick={() => removeChip(p)}
                className="text-muted-foreground hover:text-destructive ml-0.5"
                aria-label={`remover ${p}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                e.preventDefault();
                addChip(matches[0].value);
              } else if (e.key === "Backspace" && !input && parts.length) {
                removeChip(parts[parts.length - 1]);
              } else if (e.key === "," || (e.key === "Enter" && input.trim())) {
                e.preventDefault();
                const v = input.trim().replace(/,$/, "");
                if (v) addChip(v);
              }
            }}
            placeholder={parts.length ? "" : field.placeholder}
            className="flex-1 min-w-[80px] bg-transparent outline-none text-sm py-0.5"
          />
        </div>
      </div>
      {focused && matches.length > 0 && (
        <div className="relative">
          <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md max-h-[240px] overflow-y-auto">
            {matches.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addChip(opt.value)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground border-b border-border last:border-b-0"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {input.length > 0 && input.length < MIN && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Digite mais {MIN - input.length} {MIN - input.length === 1 ? "caractere" : "caracteres"} pra ver opções
        </p>
      )}
    </div>
  );
}

function ConfigField({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.type) {
    case "multiAutocomplete":
      return <MultiAutocompleteField field={field} value={value} onChange={onChange} />;
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
