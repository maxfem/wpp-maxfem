import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CheckCircle2, Loader2, Phone, Shield, TriangleAlert, Smartphone, Activity, Trash2, Power, Webhook, Copy, KeyRound, ExternalLink, XCircle } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { WhatsAppHealthDashboard } from "@/components/whatsapp/HealthDashboard";
import { AddWhatsAppDialog } from "@/components/whatsapp/AddWhatsAppDialog";
import { ConnectWhatsAppDialog } from "@/components/whatsapp/ConnectWhatsAppDialog";

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
  const { data: waAccounts = [], refetch: refetchAccounts } = useQuery({
    queryKey: ["whatsapp-accounts", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return [];
      const { data } = await supabase
        .from("whatsapp_accounts")
        .select("id, tenant_id, phone_number_id, display_phone, verified_name, quality_rating, is_active, label, whatsapp_business_account_id, notes, created_at, updated_at")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!currentTenant?.id,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("whatsapp_accounts")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      void refetchAccounts();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao atualizar"),
  });

  const removeAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Número removido");
      void refetchAccounts();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao remover"),
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

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
  const callbackUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;

  const { data: secretsStatus } = useQuery({
    queryKey: ["wa-secrets-status"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ action: "secrets_status" }),
      });
      return res.ok ? await res.json() : null;
    },
    refetchOnWindowFocus: false,
  });

  const copyCallback = () => {
    navigator.clipboard.writeText(callbackUrl);
    toast.success("URL de callback copiada!");
  };

  const copyVerifyToken = () => {
    const token = secretsStatus?.has_verify_token
      ? "(salvo no servidor — pega no Supabase Secrets se precisar)"
      : "maxfem_wa_ba510d8bf4e7d046effa0b8c";
    navigator.clipboard.writeText(token);
    toast.success("Verify token copiado!");
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

        <Tabs defaultValue="diagnostico" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="diagnostico" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Diagnóstico
            </TabsTrigger>
            <TabsTrigger value="configuracao" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Configuração
            </TabsTrigger>
          </TabsList>

          <TabsContent value="diagnostico">
            <WhatsAppHealthDashboard />
          </TabsContent>

          <TabsContent value="configuracao" className="space-y-6">
            {/* URL de callback (Webhook) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Webhook className="h-4 w-4" />
                  URL de callback (Meta Webhook)
                </CardTitle>
                <CardDescription>
                  Cadastre essa URL em <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">developers.facebook.com <ExternalLink className="h-3 w-3" /></a> → seu app → Webhooks → WhatsApp Business Account → Subscription URL.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Callback URL</p>
                  <div className="flex gap-2">
                    <Input value={callbackUrl} readOnly className="font-mono text-xs" />
                    <Button onClick={copyCallback} variant="outline" className="shrink-0 gap-2">
                      <Copy className="h-4 w-4" />
                      Copiar
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Verify token</p>
                  <div className="flex gap-2">
                    <Input
                      value={secretsStatus?.has_verify_token ? "•••••• (configurado nos secrets)" : "maxfem_wa_ba510d8bf4e7d046effa0b8c"}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button onClick={copyVerifyToken} variant="outline" className="shrink-0 gap-2">
                      <Copy className="h-4 w-4" />
                      Copiar
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground rounded-lg bg-muted/30 p-3 space-y-1">
                  <p className="font-medium text-foreground">Eventos a subscrever:</p>
                  <p>messages · message_status · message_template_status_update · account_update · phone_number_quality_update</p>
                </div>
              </CardContent>
            </Card>

            {/* Status das credenciais Meta */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <KeyRound className="h-4 w-4" />
                      Credenciais Meta Cloud API
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Token de acesso (System User ou Permanent) + Phone Number ID + WABA ID. Validados via Graph API e salvos nos secrets do Supabase.
                    </CardDescription>
                  </div>
                  <ConnectWhatsAppDialog
                    onConnected={() =>
                      queryClient.invalidateQueries({ queryKey: ["wa-secrets-status"] })
                    }
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="flex items-center justify-between py-2 border-b">
                    <div className="flex items-center gap-2">
                      {secretsStatus?.has_access_token ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
                      <code className="text-xs font-mono">WHATSAPP_ACCESS_TOKEN</code>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {secretsStatus?.has_access_token
                        ? `${secretsStatus.access_token_prefix} (${secretsStatus.access_token_length} chars)`
                        : "Não configurado"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <div className="flex items-center gap-2">
                      {secretsStatus?.has_phone_number_id ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
                      <code className="text-xs font-mono">WHATSAPP_PHONE_NUMBER_ID</code>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {secretsStatus?.phone_number_id || "Não configurado"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <div className="flex items-center gap-2">
                      {secretsStatus?.has_waba_id ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
                      <code className="text-xs font-mono">WHATSAPP_BUSINESS_ACCOUNT_ID</code>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {secretsStatus?.waba_id || "Não configurado"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      {secretsStatus?.has_verify_token ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
                      <code className="text-xs font-mono">WHATSAPP_VERIFY_TOKEN</code>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {secretsStatus?.has_verify_token ? "Configurado" : "Não configurado"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Phone className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Número de telefone</CardTitle>
                      <CardDescription>Status atual da conexão com Meta Cloud API</CardDescription>
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
                          Seu número deve estar configurado na Meta Business Suite.
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
                          Digite o código de 6 dígitos recebido.
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
                    </div>
                  )}

                  {step === "register" && (
                    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                      <div>
                        <h3 className="mb-1 text-sm font-medium text-foreground">Registrar número</h3>
                        <p className="text-xs text-muted-foreground">
                          Defina um PIN de 6 dígitos.
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
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Smartphone className="h-5 w-5" />
                    Números cadastrados
                    <Badge variant="outline" className="ml-1">{waAccounts.length}</Badge>
                  </CardTitle>
                  <AddWhatsAppDialog onAdded={() => refetchAccounts()} />
                </div>
                <CardDescription>
                  Cadastre múltiplos números do WhatsApp Cloud API. O número marcado como ativo é o usado para envio padrão.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {waAccounts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center">
                    <Smartphone className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium text-foreground">
                      Nenhum número cadastrado ainda
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Clique em "Adicionar número" pra cadastrar o primeiro.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {waAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-start justify-between rounded-lg border border-border p-3 gap-3"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <Phone className="mt-1 h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium truncate">
                                {account.label || account.display_phone || account.phone_number_id}
                              </p>
                              {account.is_active ? (
                                <Badge variant="secondary">Ativo</Badge>
                              ) : (
                                <Badge variant="outline">Inativo</Badge>
                              )}
                              {getQualityBadge(account.quality_rating || undefined)}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground truncate">
                              {account.display_phone && <span>{account.display_phone} · </span>}
                              {account.verified_name && <span>{account.verified_name} · </span>}
                              <span className="font-mono">{account.phone_number_id}</span>
                            </div>
                            {account.notes && (
                              <p className="mt-1 text-xs text-muted-foreground italic">
                                {account.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={account.is_active ? "Desativar" : "Ativar"}
                            onClick={() =>
                              toggleActiveMutation.mutate({
                                id: account.id,
                                is_active: !account.is_active,
                              })
                            }
                            disabled={toggleActiveMutation.isPending}
                          >
                            <Power className={`h-4 w-4 ${account.is_active ? "text-primary" : "text-muted-foreground"}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Remover"
                            onClick={() => {
                              if (confirm(`Remover o número ${account.label || account.phone_number_id}?`)) {
                                removeAccountMutation.mutate(account.id);
                              }
                            }}
                            disabled={removeAccountMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
