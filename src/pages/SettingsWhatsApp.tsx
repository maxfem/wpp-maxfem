import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CheckCircle2, Loader2, Phone, Shield, TriangleAlert, Smartphone, Activity } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { WhatsAppHealthDashboard } from "@/components/whatsapp/HealthDashboard";

type Step = "status" | "request_code" | "verify_code" | "register" | "done";

type PhoneStatus = {
  code_verification_status?: string;
  display_phone_number?: string;
  name_status?: string;
  quality_rating?: string;
  status?: string;
  verified_name?: string;
};

async function invokeWhatsAppRegister<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("whatsapp-register", { body });

  if (error) {
    const response = (error as { context?: Response }).context;
    const payload = response ? await response.json().catch(() => null) : null;
    const message = payload?.user_message || payload?.error || error.message || "Erro ao comunicar com o backend";
    throw new Error(message);
  }

  return data as T;
}

export default function SettingsWhatsApp() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("status");
  const [codeMethod, setCodeMethod] = useState("SMS");
  const [verificationCode, setVerificationCode] = useState("");
  const [pin, setPin] = useState("123456");

  // Fetch linked WhatsApp accounts
  const { data: waAccounts = [] } = useQuery({
    queryKey: ["whatsapp-accounts", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return [];
      const { data } = await supabase
        .from("whatsapp_accounts")
        .select("id, tenant_id, phone_number_id, display_phone, verified_name, quality_rating, is_active, created_at, updated_at")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!currentTenant?.id,
  });

  const {
    data: phoneStatus,
    error: statusError,
    isLoading: statusLoading,
    isFetching: statusFetching,
    refetch: refetchStatus,
  } = useQuery<PhoneStatus>({
    queryKey: ["whatsapp-phone-status"],
    queryFn: async () => invokeWhatsAppRegister<PhoneStatus>({ action: "status" }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const statusErrorMessage = statusError instanceof Error ? statusError.message : null;
  const hasBlockingStatusError = Boolean(statusErrorMessage);
  const isRegistered =
    phoneStatus?.code_verification_status === "VERIFIED" || phoneStatus?.status === "CONNECTED";

  const requestCodeMutation = useMutation({
    mutationFn: async () => invokeWhatsAppRegister({ action: "request_code", code_method: codeMethod }),
    onSuccess: () => {
      toast.success(`Código enviado via ${codeMethod}`);
      setStep("verify_code");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao solicitar código");
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async () => invokeWhatsAppRegister({ action: "verify_code", code: verificationCode }),
    onSuccess: () => {
      toast.success("Código verificado com sucesso!");
      setStep("register");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao verificar código");
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => invokeWhatsAppRegister({ action: "register", pin }),
    onSuccess: () => {
      toast.success("Número registrado com sucesso!");
      setStep("done");
      void refetchStatus();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao registrar número");
    },
  });

  const getStatusBadge = () => {
    if (statusLoading || statusFetching) {
      return <Badge variant="secondary">Carregando...</Badge>;
    }

    if (hasBlockingStatusError) {
      return <Badge variant="outline">Atenção</Badge>;
    }

    if (isRegistered) {
      return <Badge variant="secondary">Conectado</Badge>;
    }

    return <Badge variant="outline">Pendente</Badge>;
  };

  const getQualityBadge = (rating: string | undefined) => {
    if (!rating) return null;

    const label = rating === "GREEN" ? "Alta" : rating === "YELLOW" ? "Média" : "Baixa";
    const className =
      rating === "RED"
        ? "border-destructive/20 bg-destructive/10 text-destructive"
        : rating === "GREEN"
          ? "border-primary/20 bg-primary/10 text-primary"
          : "border-border bg-muted text-foreground";

    return (
      <Badge variant="outline" className={className}>
        {label}
      </Badge>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-6 p-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">WhatsApp</h1>
            <p className="text-sm text-muted-foreground">Gerenciar número e registro na Cloud API</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Número de telefone</CardTitle>
                  <CardDescription>+55 21 92367-3174</CardDescription>
                </div>
              </div>
              {getStatusBadge()}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasBlockingStatusError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 h-4 w-4 text-destructive" />
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Não foi possível consultar o status do número</p>
                      <p className="text-sm text-muted-foreground">{statusErrorMessage}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void refetchStatus()}>
                      Tentar novamente
                    </Button>
                  </div>
                </div>
              </div>
            ) : phoneStatus && !statusLoading ? (
              <div className="grid gap-4 text-sm md:grid-cols-2">
                {phoneStatus.verified_name && (
                  <div>
                    <p className="text-muted-foreground">Nome verificado</p>
                    <p className="font-medium text-foreground">{phoneStatus.verified_name}</p>
                  </div>
                )}
                {phoneStatus.display_phone_number && (
                  <div>
                    <p className="text-muted-foreground">Número exibido</p>
                    <p className="font-medium text-foreground">{phoneStatus.display_phone_number}</p>
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
                    <p className="font-medium text-foreground">{phoneStatus.name_status}</p>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {!hasBlockingStatusError && !isRegistered && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Registro do número</CardTitle>
                  <CardDescription>
                    Inscreva o número na Cloud API para habilitar envio e recebimento de mensagens.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-2 text-xs">
                {[
                  { key: "request_code", label: "1. Solicitar código" },
                  { key: "verify_code", label: "2. Verificar código" },
                  { key: "register", label: "3. Registrar" },
                ].map((item, index) => {
                  const isActive = step === item.key;
                  const isDone =
                    (item.key === "request_code" && ["verify_code", "register", "done"].includes(step)) ||
                    (item.key === "verify_code" && ["register", "done"].includes(step)) ||
                    (item.key === "register" && step === "done");

                  return (
                    <div key={item.key} className="flex items-center gap-2">
                      {index > 0 && <div className="h-px w-8 bg-border" />}
                      <div
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                          isDone
                            ? "border-primary/20 bg-primary/10 text-primary"
                            : isActive
                              ? "border-primary/20 bg-primary/10 text-primary"
                              : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {isDone ? <CheckCircle2 className="h-3 w-3" /> : null}
                        <span>{item.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {(step === "status" || step === "request_code") && (
                <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                  <div>
                    <h3 className="mb-1 text-sm font-medium text-foreground">Solicitar código de verificação</h3>
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
                    <Button onClick={() => requestCodeMutation.mutate()} disabled={requestCodeMutation.isPending}>
                      {requestCodeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Solicitar código
                    </Button>
                  </div>
                </div>
              )}

              {step === "verify_code" && (
                <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                  <div>
                    <h3 className="mb-1 text-sm font-medium text-foreground">Inserir código de verificação</h3>
                    <p className="text-xs text-muted-foreground">
                      Digite o código de 6 dígitos recebido via {codeMethod === "SMS" ? "SMS" : "ligação"}.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      placeholder="000000"
                      value={verificationCode}
                      onChange={(event) =>
                        setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      className="w-36 text-center font-mono text-lg tracking-widest"
                      maxLength={6}
                    />
                    <Button
                      onClick={() => verifyCodeMutation.mutate()}
                      disabled={verifyCodeMutation.isPending || verificationCode.length !== 6}
                    >
                      {verifyCodeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Verificar
                    </Button>
                  </div>
                  <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setStep("request_code")}>
                    Reenviar código
                  </Button>
                </div>
              )}

              {step === "register" && (
                <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                  <div>
                    <h3 className="mb-1 text-sm font-medium text-foreground">Registrar número</h3>
                    <p className="text-xs text-muted-foreground">
                      Defina um PIN de 6 dígitos para a conta; ele será usado na verificação em duas etapas.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      placeholder="PIN de 6 dígitos"
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-36 text-center font-mono text-lg tracking-widest"
                      maxLength={6}
                    />
                    <Button onClick={() => registerMutation.mutate()} disabled={registerMutation.isPending || pin.length !== 6}>
                      {registerMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Registrar
                    </Button>
                  </div>
                </div>
              )}

              {step === "done" && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Número registrado com sucesso</p>
                      <p className="text-xs text-muted-foreground">
                        O número está pronto para enviar e receber mensagens.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!hasBlockingStatusError && isRegistered && (
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">Número registrado e ativo</p>
                  <p className="text-xs text-muted-foreground">
                    O número está conectado à Cloud API e pronto para uso.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Connected accounts */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Números conectados</CardTitle>
                <CardDescription>Números de WhatsApp vinculados a esta conta</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {waAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum número vinculado ainda.</p>
            ) : (
              <div className="space-y-3">
                {waAccounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {account.display_phone || account.phone_number_id}
                        </p>
                        {account.verified_name && (
                          <p className="text-xs text-muted-foreground">{account.verified_name}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant={account.is_active ? "secondary" : "outline"}>
                      {account.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
