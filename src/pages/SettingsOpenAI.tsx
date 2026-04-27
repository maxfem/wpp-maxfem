import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Save, Loader2, Eye, EyeOff, Trash2, Bot, Sparkles, MessageSquare, Zap } from "lucide-react";

const TONE_OPTIONS = [
  { value: "formal", label: "Formal", description: "Linguagem profissional e direta" },
  { value: "friendly", label: "Amigável", description: "Tom caloroso e acolhedor" },
  { value: "informal", label: "Informal", description: "Linguagem descontraída e casual" },
  { value: "technical", label: "Técnico", description: "Preciso e objetivo" },
];

const MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini", description: "Econômico — ideal para respostas rápidas" },
  { value: "gpt-4o", label: "GPT-4o", description: "Balanceado — boa qualidade e custo" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo", description: "Avançado — máxima qualidade" },
];

const DEFAULT_WHATSAPP_PROMPT = `Você é um assistente de atendimento ao cliente via WhatsApp. Seu papel é ajudar o atendente a responder mensagens de forma eficiente e profissional.

Regras:
- Responda sempre em português brasileiro
- Seja conciso e objetivo
- Mantenha o tom configurado pelo atendente
- Use informações do contexto do cliente quando disponíveis
- Sugira respostas completas que o atendente possa enviar diretamente`;

const DEFAULT_INSTAGRAM_PROMPT = `Você é um assistente de atendimento ao cliente via Instagram. Seu papel é ajudar o atendente a responder direct messages e comentários de forma eficiente e engajadora.

Regras:
- Responda sempre em português brasileiro
- Seja visual e use emojis moderadamente
- Mantenha o tom configurado pelo atendente
- Foque em engajamento e conversão
- Sugira respostas adequadas para a plataforma Instagram`;

export default function SettingsOpenAI() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();

  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [tone, setTone] = useState("friendly");
  const [model, setModel] = useState("gpt-4o-mini");
  const [whatsappPrompt, setWhatsappPrompt] = useState(DEFAULT_WHATSAPP_PROMPT);
  const [instagramPrompt, setInstagramPrompt] = useState(DEFAULT_INSTAGRAM_PROMPT);

  const { data: integration, isLoading } = useQuery({
    queryKey: ["integration-openai", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("provider", "openai")
        .maybeSingle();
      return data;
    },
    enabled: !!currentTenant,
  });

  useEffect(() => {
    if (integration) {
      const config = integration.config as any;
      setApiKey(config?.openai_api_key || "");
      setTone(config?.tone || "friendly");
      setModel(config?.model || "gpt-4o-mini");
      setWhatsappPrompt(config?.whatsapp_prompt || config?.system_prompt || DEFAULT_WHATSAPP_PROMPT);
      setInstagramPrompt(config?.instagram_prompt || DEFAULT_INSTAGRAM_PROMPT);
    }
  }, [integration]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("Sem tenant");
      const payload = {
        tenant_id: currentTenant.id,
        provider: "openai",
        is_active: true,
        config: {
          openai_api_key: apiKey,
          tone,
          model,
          whatsapp_prompt: whatsappPrompt,
          instagram_prompt: instagramPrompt,
          system_prompt: whatsappPrompt, // Mantém compatibilidade por enquanto
          ai_enabled: true,
        },
        sync_settings: {},
      };

      if (integration) {
        const { error } = await supabase.from("integrations").update(payload).eq("id", integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("integrations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-openai"] });
      toast.success("Configuração OpenAI salva!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!integration) return;
      const { error } = await supabase.from("integrations").delete().eq("id", integration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-openai"] });
      toast.success("Integração removida");
      navigate("/settings/integrations");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const isConfigured = !!apiKey;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings/integrations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold text-lg bg-[#10A37F]">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">OpenAI</h1>
              <p className="text-sm text-muted-foreground">
                Assistente de IA para WhatsApp e Instagram
              </p>
            </div>
          </div>
        </div>

        {/* API Key */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chave da API</CardTitle>
            <CardDescription className="text-xs">
              Obtenha sua API Key em{" "}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                platform.openai.com/api-keys
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configurações do Assistente</CardTitle>
            <CardDescription className="text-xs">
              Defina o comportamento padrão do assistente de IA no atendimento
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Tom de voz</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div>
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs">— {opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Modelo de IA</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div>
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs">— {opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 pt-2 border-t">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Prompt do WhatsApp (instruções da agente)
                </Label>
                <Textarea
                  value={whatsappPrompt}
                  onChange={(e) => setWhatsappPrompt(e.target.value)}
                  placeholder="Instruções para o assistente de WhatsApp..."
                  className="min-h-[140px] text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Estas instruções definem como o assistente se comporta no WhatsApp.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Prompt do Instagram (instruções da agente)
                </Label>
                <Textarea
                  value={instagramPrompt}
                  onChange={(e) => setInstagramPrompt(e.target.value)}
                  placeholder="Instruções para o assistente de Instagram..."
                  className="min-h-[140px] text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Estas instruções definem como o assistente se comporta no Instagram.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que você poderá fazer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: MessageSquare, text: "Sugestão de respostas em tempo real" },
                { icon: Bot, text: "Copilot inteligente no chat" },
                { icon: Sparkles, text: "Personalizar tom por conversa" },
                { icon: Zap, text: "Contexto específico por contato" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <item.icon className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!isConfigured || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Configuração
          </Button>

          {integration && (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("Tem certeza que deseja remover a integração OpenAI?")) {
                  deleteMutation.mutate();
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
