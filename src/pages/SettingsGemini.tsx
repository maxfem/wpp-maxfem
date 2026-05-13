import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Loader2,
  Trash2,
  Sparkles,
  Image,
  Video,
  Mic,
  MessageSquare,
  Bot,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";

const MODEL_OPTIONS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Rápido e econômico — ideal para atendimento" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Máxima qualidade — melhor raciocínio e contexto" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", description: "Geração mais nova com baixa latência" },
];

const TONE_OPTIONS = [
  { value: "formal", label: "Formal", description: "Linguagem profissional e direta" },
  { value: "friendly", label: "Amigável", description: "Tom caloroso e acolhedor" },
  { value: "informal", label: "Informal", description: "Linguagem descontraída e casual" },
  { value: "technical", label: "Técnico", description: "Preciso e objetivo" },
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

type TestStatus = "idle" | "testing" | "ok" | "fail";

export default function SettingsGemini() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [tone, setTone] = useState("friendly");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [whatsappPrompt, setWhatsappPrompt] = useState(DEFAULT_WHATSAPP_PROMPT);
  const [instagramPrompt, setInstagramPrompt] = useState(DEFAULT_INSTAGRAM_PROMPT);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const { data: integration, isLoading } = useQuery({
    queryKey: ["integration-gemini", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("provider", "gemini")
        .maybeSingle();
      return data;
    },
    enabled: !!currentTenant,
  });

  useEffect(() => {
    if (integration) {
      const config = integration.config as any;
      // legacy strip de "google/" prefix vindo do Lovable
      const rawModel = config?.model || "gemini-2.5-flash";
      setModel(rawModel.replace(/^google\//, ""));
      setApiKey(config?.api_key || "");
      setTone(config?.tone || "friendly");
      setWhatsappPrompt(config?.whatsapp_prompt || config?.system_prompt || DEFAULT_WHATSAPP_PROMPT);
      setInstagramPrompt(config?.instagram_prompt || DEFAULT_INSTAGRAM_PROMPT);
    }
  }, [integration]);

  const testConnection = async () => {
    if (!apiKey) {
      toast.error("Cole a API Key antes de testar");
      return;
    }
    setTestStatus("testing");
    setTestMessage(null);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 8 },
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error?.message || `HTTP ${res.status}`;
        setTestStatus("fail");
        setTestMessage(msg);
        toast.error("Falha na conexão: " + msg);
        return;
      }
      setTestStatus("ok");
      const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text || "ok";
      setTestMessage(`Conectado · resposta: "${reply.trim().slice(0, 40)}"`);
      toast.success("Gemini respondeu!");
    } catch (err: any) {
      setTestStatus("fail");
      setTestMessage(err.message);
      toast.error("Erro: " + err.message);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("Sem tenant");
      if (!apiKey.trim()) throw new Error("API Key obrigatória");

      const payload = {
        tenant_id: currentTenant.id,
        provider: "gemini",
        is_active: true,
        config: {
          api_key: apiKey.trim(),
          tone,
          model,
          whatsapp_prompt: whatsappPrompt,
          instagram_prompt: instagramPrompt,
          system_prompt: whatsappPrompt, // compat
          ai_enabled: true,
        },
        sync_settings: {},
      };

      if (integration) {
        const { error } = await supabase
          .from("integrations")
          .update(payload)
          .eq("id", integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("integrations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-gemini"] });
      toast.success("Configuração Gemini salva!");
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
      queryClient.invalidateQueries({ queryKey: ["integration-gemini"] });
      toast.success("Integração removida");
      navigate("/settings/integrations");
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const isConfigured = Boolean(integration && (integration.config as any)?.api_key);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings/integrations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold text-lg bg-[#4285F4]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Gemini AI</h1>
              <p className="text-sm text-muted-foreground">
                IA multimodal Google — usada no Copilot, Atendente IA do WhatsApp e Instagram
              </p>
            </div>
            {isConfigured && (
              <Badge variant="secondary" className="ml-2">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
              </Badge>
            )}
          </div>
        </div>

        {/* Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Credencial Google AI Studio
            </CardTitle>
            <CardDescription className="text-xs">
              Cole a API Key gerada em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">aistudio.google.com/apikey <ExternalLink className="h-3 w-3" /></a>. A chave é armazenada criptografada no Supabase e usada server-side pelas Edge Functions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="gemini-key">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="gemini-key"
                    type={showKey ? "text" : "password"}
                    placeholder="AIzaSy..."
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setTestStatus("idle");
                    }}
                    className="font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  onClick={testConnection}
                  disabled={!apiKey || testStatus === "testing"}
                  className="shrink-0"
                >
                  {testStatus === "testing" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Testar conexão"
                  )}
                </Button>
              </div>
              {testStatus === "ok" && testMessage && (
                <div className="flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{testMessage}</span>
                </div>
              )}
              {testStatus === "fail" && testMessage && (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{testMessage}</span>
                </div>
              )}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Modelo</Label>
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
            </div>

            <div className="space-y-4 pt-2 border-t">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Prompt do WhatsApp
                </Label>
                <Textarea
                  value={whatsappPrompt}
                  onChange={(e) => setWhatsappPrompt(e.target.value)}
                  placeholder="Instruções para o assistente de WhatsApp..."
                  className="min-h-[140px] text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Prompt do Instagram
                </Label>
                <Textarea
                  value={instagramPrompt}
                  onChange={(e) => setInstagramPrompt(e.target.value)}
                  placeholder="Instruções para o assistente de Instagram..."
                  className="min-h-[140px] text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capacidades multimodais</CardTitle>
            <CardDescription className="text-xs">
              O Gemini processa nativamente diferentes tipos de mídia
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: Image, text: "Análise de imagens recebidas" },
                { icon: Video, text: "Interpretação de vídeos" },
                { icon: Mic, text: "Transcrição e análise de áudios" },
                { icon: MessageSquare, text: "Copilot inteligente no chat" },
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
            disabled={saveMutation.isPending || !apiKey.trim()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {integration ? "Salvar configuração" : "Ativar Gemini"}
          </Button>

          {integration && (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              title="Remover integração"
              onClick={() => {
                if (confirm("Tem certeza que deseja remover a integração Gemini?")) {
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
