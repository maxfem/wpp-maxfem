import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Phone, CheckCircle2, AlertCircle, Loader2, Shield } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type Step = "status" | "request_code" | "verify_code" | "register" | "done";

export default function SettingsWhatsApp() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("status");
  const [codeMethod, setCodeMethod] = useState("SMS");
  const [verificationCode, setVerificationCode] = useState("");
  const [pin, setPin] = useState("123456");

  // Fetch phone status
  const { data: phoneStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ["whatsapp-phone-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-register", {
        body: { action: "status" },
      });
      if (error) throw error;
      return data;
    },
  });

  // Request code
  const requestCodeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-register", {
        body: { action: "request_code", code_method: codeMethod },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`Código enviado via ${codeMethod}`);
      setStep("verify_code");
    },
    onError: (err: any) => {
      toast.error("Erro ao solicitar código: " + (err?.message || "Erro desconhecido"));
    },
  });

  // Verify code
  const verifyCodeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-register", {
        body: { action: "verify_code", code: verificationCode },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Código verificado com sucesso!");
      setStep("register");
    },
    onError: (err: any) => {
      toast.error("Código inválido ou expirado");
    },
  });

  // Register
  const registerMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-register", {
        body: { action: "register", pin },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Número registrado com sucesso!");
      setStep("done");
      refetchStatus();
    },
    onError: (err: any) => {
      toast.error("Erro ao registrar: " + (err?.message || "Erro desconhecido"));
    },
  });

  const isRegistered = phoneStatus?.code_verification_status === "VERIFIED" || phoneStatus?.status === "CONNECTED";

  const getStatusBadge = () => {
    if (statusLoading) return <Badge variant="secondary">Carregando...</Badge>;
    if (isRegistered) return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Conectado</Badge>;
    return <Badge variant="outline" className="text-yellow-600 border-yellow-500/30 bg-yellow-500/10">Pendente</Badge>;
  };

  const getQualityBadge = (rating: string | undefined) => {
    if (!rating) return null;
    const colors: Record<string, string> = {
      GREEN: "bg-green-500/10 text-green-600 border-green-500/20",
      YELLOW: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
      RED: "bg-red-500/10 text-red-600 border-red-500/20",
    };
    return <Badge className={colors[rating] || ""}>{rating === "GREEN" ? "Alta" : rating === "YELLOW" ? "Média" : "Baixa"}</Badge>;
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in max-w-3xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">WhatsApp</h1>
            <p className="text-sm text-muted-foreground">Gerenciar número e registro na Cloud API</p>
          </div>
        </div>

        {/* Phone Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <Phone className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Número de Telefone</CardTitle>
                  <CardDescription>+55 21 92367-3174</CardDescription>
                </div>
              </div>
              {getStatusBadge()}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {phoneStatus && !statusLoading && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                {phoneStatus.verified_name && (
                  <div>
                    <p className="text-muted-foreground">Nome verificado</p>
                    <p className="font-medium">{phoneStatus.verified_name}</p>
                  </div>
                )}
                {phoneStatus.display_phone_number && (
                  <div>
                    <p className="text-muted-foreground">Número exibido</p>
                    <p className="font-medium">{phoneStatus.display_phone_number}</p>
                  </div>
                )}
                {phoneStatus.quality_rating && (
                  <div>
                    <p className="text-muted-foreground">Qualidade</p>
                    {getQualityBadge(phoneStatus.quality_rating)}
                  </div>
                )}
                {phoneStatus.name_status && (
                  <div>
                    <p className="text-muted-foreground">Status do nome</p>
                    <p className="font-medium">{phoneStatus.name_status}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Registration Flow */}
        {!isRegistered && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Registro do Número</CardTitle>
                  <CardDescription>
                    Inscreva o número na Cloud API para habilitar envio e recebimento de mensagens
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step indicators */}
              <div className="flex items-center gap-2 text-xs">
                {[
                  { key: "request_code", label: "1. Solicitar código" },
                  { key: "verify_code", label: "2. Verificar código" },
                  { key: "register", label: "3. Registrar" },
                ].map((s, i) => {
                  const isActive = step === s.key;
                  const isDone =
                    (s.key === "request_code" && ["verify_code", "register", "done"].includes(step)) ||
                    (s.key === "verify_code" && ["register", "done"].includes(step)) ||
                    (s.key === "register" && step === "done");
                  return (
                    <div key={s.key} className="flex items-center gap-2">
                      {i > 0 && <div className="w-8 h-px bg-border" />}
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                        isDone ? "bg-green-500/10 border-green-500/30 text-green-600" :
                        isActive ? "bg-primary/10 border-primary/30 text-primary" :
                        "bg-muted border-border text-muted-foreground"
                      }`}>
                        {isDone ? <CheckCircle2 className="h-3 w-3" /> : null}
                        <span>{s.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Step 1: Request Code */}
              {(step === "status" || step === "request_code") && (
                <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
                  <div>
                    <h3 className="text-sm font-medium mb-1">Solicitar código de verificação</h3>
                    <p className="text-xs text-muted-foreground">
                      Enviaremos um código para o número +55 21 92367-3174 via SMS ou ligação.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Select value={codeMethod} onValueChange={setCodeMethod}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SMS">SMS</SelectItem>
                        <SelectItem value="VOICE">Ligação</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => requestCodeMutation.mutate()}
                      disabled={requestCodeMutation.isPending}
                    >
                      {requestCodeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Solicitar código
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 2: Verify Code */}
              {step === "verify_code" && (
                <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
                  <div>
                    <h3 className="text-sm font-medium mb-1">Inserir código de verificação</h3>
                    <p className="text-xs text-muted-foreground">
                      Digite o código de 6 dígitos recebido via {codeMethod === "SMS" ? "SMS" : "ligação"}.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      placeholder="000000"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-36 text-center tracking-widest font-mono text-lg"
                      maxLength={6}
                    />
                    <Button
                      onClick={() => verifyCodeMutation.mutate()}
                      disabled={verifyCodeMutation.isPending || verificationCode.length !== 6}
                    >
                      {verifyCodeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Verificar
                    </Button>
                  </div>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => setStep("request_code")}
                  >
                    Reenviar código
                  </button>
                </div>
              )}

              {/* Step 3: Register */}
              {step === "register" && (
                <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
                  <div>
                    <h3 className="text-sm font-medium mb-1">Registrar número</h3>
                    <p className="text-xs text-muted-foreground">
                      Defina um PIN de 6 dígitos para a conta (será usado para verificação em duas etapas).
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      placeholder="PIN de 6 dígitos"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-36 text-center tracking-widest font-mono text-lg"
                      maxLength={6}
                    />
                    <Button
                      onClick={() => registerMutation.mutate()}
                      disabled={registerMutation.isPending || pin.length !== 6}
                    >
                      {registerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Registrar
                    </Button>
                  </div>
                </div>
              )}

              {/* Done */}
              {step === "done" && (
                <div className="flex items-center gap-3 p-4 rounded-lg border border-green-500/30 bg-green-500/5">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-700">Número registrado com sucesso!</p>
                    <p className="text-xs text-muted-foreground">O número está pronto para enviar e receber mensagens.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Already registered */}
        {isRegistered && (
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium">Número registrado e ativo</p>
                  <p className="text-xs text-muted-foreground">O número está conectado à Cloud API e pronto para uso.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
