import { useMemo, useState, useEffect } from "react";
import { Plus, Trash2, Sparkles, Users, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type Rule = { field: string; op: string; value: any };
export type FilterRules = { match: "all" | "any"; rules: Rule[] };

type FieldDef = {
  value: string;
  label: string;
  group: "Compras" | "Localização" | "Engajamento" | "Atributos";
  type: "number" | "text" | "boolean" | "select" | "multi-text";
  ops: { value: string; label: string }[];
  placeholder?: string;
  options?: { value: string; label: string }[];
  hint?: string;
};

const FIELDS: FieldDef[] = [
  // Compras
  {
    value: "total_orders", label: "Número de pedidos", group: "Compras", type: "number",
    ops: [{ value: ">=", label: "maior ou igual" }, { value: ">", label: "maior que" }, { value: "<=", label: "menor ou igual" }, { value: "<", label: "menor que" }, { value: "=", label: "igual a" }],
    placeholder: "Ex: 2", hint: "Quantos pedidos o cliente já fez",
  },
  {
    value: "total_spent", label: "Valor total gasto (R$)", group: "Compras", type: "number",
    ops: [{ value: ">=", label: "maior ou igual" }, { value: ">", label: "maior que" }, { value: "<=", label: "menor ou igual" }, { value: "<", label: "menor que" }],
    placeholder: "Ex: 500", hint: "Soma de tudo que comprou",
  },
  {
    value: "avg_ticket", label: "Ticket médio (R$)", group: "Compras", type: "number",
    ops: [{ value: ">=", label: "maior ou igual" }, { value: ">", label: "maior que" }, { value: "<=", label: "menor ou igual" }, { value: "<", label: "menor que" }],
    placeholder: "Ex: 150",
  },
  {
    value: "last_order_days_ago", label: "Dias desde último pedido", group: "Compras", type: "number",
    ops: [{ value: "<=", label: "há no máximo X dias" }, { value: ">=", label: "há pelo menos X dias" }, { value: "<", label: "há menos de" }, { value: ">", label: "há mais de" }],
    placeholder: "Ex: 30", hint: "Recência da última compra",
  },
  {
    value: "bought_product", label: "Comprou produto (nome)", group: "Compras", type: "text",
    ops: [{ value: "contains", label: "contém" }],
    placeholder: "Ex: Imunofem Gummy",
  },
  {
    value: "used_coupon", label: "Usou cupom", group: "Compras", type: "text",
    ops: [{ value: "=", label: "código específico" }, { value: "is_not_null", label: "qualquer cupom" }],
    placeholder: "Ex: BEMVINDA10 (vazio = qualquer)",
  },

  // Localização
  {
    value: "state", label: "Estado (UF)", group: "Localização", type: "select",
    ops: [{ value: "=", label: "é" }, { value: "!=", label: "não é" }, { value: "in", label: "está em (lista)" }],
    placeholder: "Ex: SP",
    options: ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"].map((s) => ({ value: s, label: s })),
  },
  {
    value: "city", label: "Cidade", group: "Localização", type: "text",
    ops: [{ value: "=", label: "é" }, { value: "contains", label: "contém" }],
    placeholder: "Ex: São Paulo",
  },

  // Engajamento
  {
    value: "has_phone", label: "Tem WhatsApp cadastrado", group: "Engajamento", type: "boolean",
    ops: [{ value: "=", label: "é" }],
  },
  {
    value: "has_email", label: "Tem e-mail cadastrado", group: "Engajamento", type: "boolean",
    ops: [{ value: "=", label: "é" }],
  },
  {
    value: "rfm_segment", label: "Segmento RFM", group: "Engajamento", type: "select",
    ops: [{ value: "=", label: "é" }, { value: "in", label: "está em (lista)" }],
    options: ["Campeões", "Leais", "Potenciais", "Em Risco", "Hibernando", "Novos", "Perdidos"].map((s) => ({ value: s, label: s })),
  },

  // Atributos
  {
    value: "tag", label: "Tag", group: "Atributos", type: "text",
    ops: [{ value: "contains", label: "tem a tag" }, { value: "not_contains", label: "não tem a tag" }],
    placeholder: "Ex: cliente-vip",
  },
];

function getField(name: string): FieldDef | undefined {
  return FIELDS.find((f) => f.value === name);
}

interface Props {
  value: FilterRules;
  onChange: (rules: FilterRules) => void;
}

export function DynamicListRuleBuilder({ value, onChange }: Props) {
  const { currentTenant } = useAuth();
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const rules = value.rules || [];

  const addRule = () => {
    onChange({ ...value, rules: [...rules, { field: "total_spent", op: ">=", value: 100 }] });
  };

  const updateRule = (i: number, patch: Partial<Rule>) => {
    const next = [...rules];
    next[i] = { ...next[i], ...patch };
    // Reset op + value when field changes
    if (patch.field && patch.field !== next[i].field) {
      const fd = getField(patch.field);
      next[i].op = fd?.ops?.[0]?.value || "=";
      next[i].value = fd?.type === "number" ? 0 : fd?.type === "boolean" ? "true" : "";
    }
    onChange({ ...value, rules: next });
  };

  const removeRule = (i: number) => {
    onChange({ ...value, rules: rules.filter((_, idx) => idx !== i) });
  };

  const groupedFields = useMemo(() => {
    const groups = new Map<string, FieldDef[]>();
    for (const f of FIELDS) {
      if (!groups.has(f.group)) groups.set(f.group, []);
      groups.get(f.group)!.push(f);
    }
    return groups;
  }, []);

  const runPreview = async () => {
    if (!currentTenant || rules.length === 0) {
      setPreviewCount(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const { data, error } = await supabase.rpc("preview_dynamic_list" as any, {
        p_tenant: currentTenant.id,
        p_rules: value,
      });
      if (error) throw error;
      setPreviewCount(Number(data) || 0);
    } catch (e: any) {
      setPreviewError(e.message || "Erro ao calcular");
      setPreviewCount(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Auto-preview on rule changes (debounced)
  useEffect(() => {
    const t = setTimeout(() => { void runPreview(); }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), currentTenant?.id]);

  return (
    <div className="space-y-3">
      {/* Match mode */}
      <div className="flex items-center gap-3">
        <Label className="text-xs font-semibold text-muted-foreground">Cliente deve atender</Label>
        <ToggleGroup
          type="single"
          value={value.match}
          onValueChange={(v) => v && onChange({ ...value, match: v as "all" | "any" })}
        >
          <ToggleGroupItem value="all" className="text-xs h-7 px-3">Todas as regras</ToggleGroupItem>
          <ToggleGroupItem value="any" className="text-xs h-7 px-3">Qualquer regra</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Rules */}
      <div className="space-y-2">
        {rules.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
            <Sparkles className="h-5 w-5 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">Nenhuma regra ainda. Clique em "Adicionar regra" pra começar.</p>
          </div>
        )}

        {rules.map((rule, i) => {
          const fd = getField(rule.field);
          return (
            <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">REGRA {i + 1}</Badge>
                <div className="flex-1" />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRule(i)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>

              <div className="grid grid-cols-12 gap-2">
                {/* Field */}
                <Select value={rule.field} onValueChange={(v) => updateRule(i, { field: v })}>
                  <SelectTrigger className="col-span-12 sm:col-span-5 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...groupedFields.entries()].map(([group, fields]) => (
                      <div key={group}>
                        <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">{group}</div>
                        {fields.map((f) => (
                          <SelectItem key={f.value} value={f.value} className="text-sm">{f.label}</SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>

                {/* Operator */}
                <Select value={rule.op} onValueChange={(v) => updateRule(i, { op: v })}>
                  <SelectTrigger className="col-span-6 sm:col-span-3 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fd?.ops.map((op) => (
                      <SelectItem key={op.value} value={op.value} className="text-sm">{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Value */}
                <div className="col-span-6 sm:col-span-4">
                  {rule.op === "is_not_null" ? (
                    <div className="h-9 flex items-center text-xs text-muted-foreground italic px-3 rounded-md bg-muted/30">
                      qualquer valor
                    </div>
                  ) : fd?.type === "boolean" ? (
                    <Select value={String(rule.value)} onValueChange={(v) => updateRule(i, { value: v })}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true" className="text-sm">Sim</SelectItem>
                        <SelectItem value="false" className="text-sm">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : fd?.type === "select" && rule.op !== "in" ? (
                    <Select value={String(rule.value || "")} onValueChange={(v) => updateRule(i, { value: v })}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Selecionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {fd.options?.map((o) => (
                          <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : rule.op === "in" ? (
                    <Input
                      value={Array.isArray(rule.value) ? rule.value.join(", ") : String(rule.value || "")}
                      onChange={(e) => updateRule(i, { value: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      placeholder="SP, RJ, MG"
                      className="h-9 text-sm"
                    />
                  ) : (
                    <Input
                      type={fd?.type === "number" ? "number" : "text"}
                      value={String(rule.value || "")}
                      onChange={(e) => updateRule(i, { value: fd?.type === "number" ? Number(e.target.value) || 0 : e.target.value })}
                      placeholder={fd?.placeholder}
                      className="h-9 text-sm"
                    />
                  )}
                </div>
              </div>
              {fd?.hint && <p className="text-[10px] text-muted-foreground pl-1">{fd.hint}</p>}
            </div>
          );
        })}

        <Button type="button" variant="outline" size="sm" onClick={addRule} className="w-full">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar regra
        </Button>
      </div>

      {/* Preview */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
        <Users className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-foreground">Pré-visualização</p>
          {previewLoading ? (
            <p className="text-xs text-muted-foreground">Calculando...</p>
          ) : previewError ? (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {previewError}
            </p>
          ) : previewCount === null ? (
            <p className="text-xs text-muted-foreground">Adicione regras pra ver quantos clientes casam</p>
          ) : (
            <p className="text-sm">
              <span className="text-xl font-bold text-primary">{previewCount.toLocaleString("pt-BR")}</span>
              <span className="text-xs text-muted-foreground ml-1">cliente{previewCount !== 1 ? "s" : ""} casariam essa lista agora</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export const EMPTY_FILTER_RULES: FilterRules = { match: "all", rules: [] };
