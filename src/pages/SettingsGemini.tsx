import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Save, Loader2, Trash2, Sparkles, Image, Video, Mic, MessageSquare } from "lucide-react";

const MODEL_OPTIONS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Rápido e econômico — ideal para atendimento" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Máxima qualidade — melhor raciocínio e contexto" },
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

export default function SettingsGemini() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();

  const [tone, setTone] = useState("friendly");
  const [model, setModel] = useState("google/gemini-2.5-flash");
  const [whatsappPrompt, setWhatsappPrompt] = useState(DEFAULT_WHATSAPP_PROMPT);
  const [instagramPrompt, setInstagramPrompt] = useState(DEFAULT_INSTAGRAM_PROMPT);

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
      setTone(config?.tone || "friendly");
      setModel(config?.model || "google/gemini-2.5-flash");
      setWhatsappPrompt(config?.whatsapp_prompt || config?.system_prompt || DEFAULT_WHATSAPP_PROMPT);
      setInstagramPrompt(config?.instagram_prompt || DEFAULT_INSTAGRAM_PROMPT);
    }
  }, [integration]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("Sem tenant");
      const payload = {
        tenant_id: currentTenant.id,
        provider: "gemini",
        is_active: true,
        config: {
          tone,
          model,
          whatsapp_prompt: whatsappPrompt,
          instagram_prompt: instagramPrompt,
          system_prompt: whatsappPrompt, // Compatibilidade
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
                IA multimodal para WhatsApp e Instagram
              </p>
            </div>
          </div>
        </div>

        {/* Info banner */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Sem necessidade de API Key</p>
                <p>O Gemini é integrado via Lovable AI Gateway — basta ativar e configurar o comportamento.</p>
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
            <CardTitle className="text-base">Capacidades Multimodais</CardTitle>
            <CardDescription className="text-xs">
              O Gemini processa nativamente diferentes tipos de mídia
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: Image, text: "Análise de imagens em tempo real", badge: "Nativo" },
                { icon: Video, text: "Interpretação de vídeos recebidos", badge: "Nativo" },
                { icon: Mic, text: "Transcrição e análise de áudios", badge: "Nativo" },
                { icon: MessageSquare, text: "Copilot inteligente no chat", badge: null },
                { icon: Sparkles, text: "Sem custo de API Key", badge: "Grátis" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <item.icon className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>{item.text}</span>
                  {item.badge && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">{item.badge}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {integration ? "Salvar Configuração" : "Ativar Gemini"}
          </Button>

          {integration && (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
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
