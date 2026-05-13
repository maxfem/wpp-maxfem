import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Send, ShieldCheck, AlertTriangle, Save, RefreshCw, ExternalLink, Key, Copy, Webhook, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState, useEffect } from "react";

type CheckState = "pending" | "running" | "ok" | "error";
interface CheckResult { state: CheckState; detail?: string; error?: string; }
interface ValidationChecks {
  credentials: CheckResult;
  region: CheckResult;
  identity: CheckResult;
  quota: CheckResult;
}

const initialChecks: ValidationChecks = {
  credentials: { state: "pending" },
  region: { state: "pending" },
  identity: { state: "pending" },
  quota: { state: "pending" },
};

interface SecretsStatus {
  has_access_key: boolean;
  has_secret_key: boolean;
  has_region: boolean;
  region: string | null;
  access_key_prefix: string | null;
  source?: "db" | "env" | "mixed" | "none";
}

const REGION_OPTIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "sa-east-1",
  "eu-west-1", "eu-west-2", "eu-central-1",
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
];

export default function SettingsAWS() {
  const navigate = useNavigate();
  const { currentTenant, user } = useAuth();
  const queryClient = useQueryClient();

  const [senderEmail, setSenderEmail] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [showSecret, setShowSecret] = useState(false);
  const [secretsStatus, setSecretsStatus] = useState<SecretsStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [isSavingCreds, setIsSavingCreds] = useState(false);
  const [checks, setChecks] = useState<ValidationChecks>(initialChecks);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [validationCompleted, setValidationCompleted] = useState(false);

  const { data: integration } = useQuery({
    queryKey: ["aws-integration", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("provider", "aws")
        .maybeSingle();
      return data;
    },
    enabled: !!currentTenant,
  });

  const [trackingSetup, setTrackingSetup] = useState<{ configuration_set?: string; topic_arn?: string; tracking_setup_at?: string } | null>(null);
  const [isSettingUpTracking, setIsSettingUpTracking] = useState(false);
  const [trackingLog, setTrackingLog] = useState<string[]>([]);

  useEffect(() => {
    if (integration?.config) {
      const cfg = integration.config as any;
      setSenderEmail(cfg.sender_email || "");
      setAccessKeyId(cfg.aws_access_key_id || "");
      setSecretAccessKey(cfg.aws_secret_access_key || "");
      setRegion(cfg.aws_region || "us-east-1");
      setTrackingSetup({
        configuration_set: cfg.configuration_set,
        topic_arn: cfg.sns_topic_arn,
        tracking_setup_at: cfg.tracking_setup_at,
      });
    }
  }, [integration]);

  const refreshStatus = async () => {
    setLoadingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email-ses", {
        body: { mode: "status", tenant_id: currentTenant?.id },
      });
      if (error) throw error;
      setSecretsStatus(data as SecretsStatus);
    } catch (e: any) {
      toast.error(`Erro ao verificar credenciais: ${e.message}`);
    } finally {
      setLoadingStatus(false);
    }
  };

  const saveCredentials = async () => {
    if (!currentTenant) return;
    if (!accessKeyId.trim() || !secretAccessKey.trim()) {
      toast.error("Preencha access key e secret key");
      return;
    }
    setIsSavingCreds(true);
    try {
      const baseConfig = {
        ...(integration?.config as any || {}),
        aws_access_key_id: accessKeyId.trim(),
        aws_secret_access_key: secretAccessKey.trim(),
        aws_region: region,
      };
      if (integration) {
        const { error } = await supabase
          .from("integrations")
          .update({ config: baseConfig, updated_at: new Date().toISOString() })
          .eq("id", integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("integrations").insert({
          tenant_id: currentTenant.id,
          provider: "aws",
          config: baseConfig,
          is_active: false,
        });
        if (error) throw error;
      }
      toast.success("Credenciais salvas no banco");
      queryClient.invalidateQueries({ queryKey: ["aws-integration"] });
      await refreshStatus();
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e.message}`);
    } finally {
      setIsSavingCreds(false);
    }
  };

  const setupTracking = async () => {
    setIsSettingUpTracking(true);
    setTrackingLog([]);
    try {
      // fetch direto pra extrair body de erro (invoke esconde detalhes em non-2xx)
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ses-setup-tracking`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        const msg = data?.error || data?.message || `HTTP ${res.status}`;
        if (Array.isArray(data?.log)) setTrackingLog(data.log);
        throw new Error(msg);
      }
      setTrackingLog(data.log || []);
      setTrackingSetup({
        configuration_set: data.configuration_set,
        topic_arn: data.topic_arn,
        tracking_setup_at: new Date().toISOString(),
      });
      toast.success("Rastreamento de e-mails configurado!", {
        description: `Configuration Set: ${data.configuration_set}`,
      });
      queryClient.invalidateQueries({ queryKey: ["aws-integration"] });
    } catch (e: any) {
      toast.error(`Falha ao configurar tracking: ${e.message}`, { duration: 8000 });
    } finally {
      setIsSettingUpTracking(false);
    }
  };

  // Fetch secrets status on mount
  useEffect(() => {
    if (currentTenant) refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenant?.id]);

  const isConnected = integration?.is_active;
  const allSecretsReady = secretsStatus?.has_access_key && secretsStatus?.has_secret_key && secretsStatus?.has_region;

  const runValidation = async () => {
    if (!senderEmail.includes("@")) {
      toast.error("Informe um e-mail remetente válido.");
      return;
    }
    if (!allSecretsReady) {
      toast.error("Configure os secrets AWS no projeto antes de validar.");
      return;
    }

    setIsValidating(true);
    setValidationCompleted(false);
    setChecks({
      credentials: { state: "running" },
      region: { state: "pending" },
      identity: { state: "pending" },
      quota: { state: "pending" },
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-ses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ mode: "validate", fromEmail: senderEmail.trim(), tenant_id: currentTenant?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data?.checks) {
        const msg = data?.error || data?.message || `HTTP ${res.status}`;
        setChecks({
          credentials: { state: "error", error: msg },
          region: { state: "pending" },
          identity: { state: "pending" },
          quota: { state: "pending" },
        });
        toast.error(msg, { duration: 10000 });
        return;
      }

      const c = data.checks;
      setChecks({
        credentials: c.credentials.ok
          ? { state: "ok", detail: `Conta AWS: ${c.credentials.account_id}` }
          : { state: "error", error: c.credentials.error },
        region: c.region.ok
          ? { state: "ok", detail: c.quota?.is_sandbox ? `${c.region.region} (modo Sandbox)` : `${c.region.region} (modo Produção)` }
          : { state: "error", error: c.region.error || "Região inválida" },
        identity: c.identity.ok
          ? { state: "ok", detail: `${senderEmail} verificado` }
          : { state: "error", error: c.identity.error },
        quota: c.quota.ok
          ? { state: "ok", detail: `${c.quota.sent_24h}/${c.quota.max_24h} e-mails enviados nas últimas 24h` }
          : { state: "error", error: c.quota.error },
      });

      setValidationCompleted(true);
      if (data.validated) {
        toast.success("Todas as validações passaram!");
      } else {
        toast.error(`Validação falhou em: ${data.failed_at}`);
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
      setChecks({
        credentials: { state: "error", error: e.message },
        region: { state: "pending" },
        identity: { state: "pending" },
        quota: { state: "pending" },
      });
    } finally {
      setIsValidating(false);
    }
  };

  const allChecksPassed = Object.values(checks).every((c) => c.state === "ok");

  const sendTestEmail = async () => {
    if (!user?.email) {
      toast.error("E-mail do usuário não encontrado.");
      return;
    }
    if (!senderEmail) {
      toast.error("Configure o e-mail remetente primeiro.");
      return;
    }
    setIsSendingTest(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-ses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          mode: "test",
          to: user.email,
          fromEmail: senderEmail.trim(),
          tenant_id: currentTenant?.id,
          subject: "Teste AWS SES — Maxfem CRM",
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px;">
            <h1 style="color:#ED2B75;margin-bottom:16px;">Tudo certo!</h1>
            <p>Sua integração com o AWS SES está funcionando perfeitamente.</p>
            <p>Este e-mail foi enviado de <strong>${senderEmail}</strong> via região <strong>${secretsStatus?.region || "—"}</strong>.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
            <p style="color:#888;font-size:12px;">Maxfem CRM — Sistema de Email Marketing</p>
          </div>`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        const msg = data?.error || data?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      toast.success(`E-mail de teste enviado para ${user.email}!`, {
        description: `Message ID: ${data.messageId}`,
      });
    } catch (e: any) {
      toast.error(`Falha no envio: ${e.message}`, { duration: 10000 });
    } finally {
      setIsSendingTest(false);
    }
  };

  const saveAndActivate = async () => {
    if (!currentTenant) return;
    if (!senderEmail.includes("@")) {
      toast.error("E-mail remetente inválido.");
      return;
    }
    setIsSaving(true);
    try {
      // PRESERVA tudo que já está em integration.config (aws_access_key_id, secret, region etc)
      const existingConfig = (integration?.config as any) || {};
      const config: any = {
        ...existingConfig,
        sender_email: senderEmail.trim(),
        last_validated_at: new Date().toISOString(),
        last_validation_checks: JSON.parse(JSON.stringify(checks)),
        updated_at: new Date().toISOString(),
      };

      if (integration) {
        const { error } = await supabase
          .from("integrations")
          .update({ config, is_active: true })
          .eq("id", integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("integrations")
          .insert([{ tenant_id: currentTenant.id, provider: "aws", config, is_active: true }]);
        if (error) throw error;
      }

      toast.success("Integração AWS SES ativada!");
      queryClient.invalidateQueries({ queryKey: ["aws-integration"] });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deactivate = async () => {
    if (!integration) return;
    const { error } = await supabase.from("integrations").update({ is_active: false }).eq("id", integration.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Integração desativada.");
    queryClient.invalidateQueries({ queryKey: ["aws-integration"] });
  };

  const SecretRow = ({ label, ok, value }: { label: string; ok: boolean; value?: string | null }) => (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
        <code className="text-xs font-mono">{label}</code>
      </div>
      <span className="text-xs text-muted-foreground">
        {ok ? (value || "Configurado") : "Não configurado"}
      </span>
    </div>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings/integrations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3 flex-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">A</div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">Amazon AWS SES</h1>
              <p className="text-sm text-muted-foreground">Envio de e-mails transacionais e de marketing</p>
            </div>
            {isConnected && (
              <Badge className="bg-primary text-primary-foreground">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
              </Badge>
            )}
          </div>
        </div>

        {/* Credenciais AWS — editáveis na UI */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="h-4 w-4" /> Credenciais AWS
            </CardTitle>
            <CardDescription>
              Cole as credenciais IAM aqui — ficam armazenadas em <code className="text-[10px]">integrations.config</code> vinculadas ao tenant.
              Se nada for preenchido, o sistema usa fallback de variáveis de ambiente do projeto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="aws-access-key">AWS_ACCESS_KEY_ID</Label>
              <Input
                id="aws-access-key"
                placeholder="AKIA..."
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aws-secret-key">AWS_SECRET_ACCESS_KEY</Label>
              <div className="relative">
                <Input
                  id="aws-secret-key"
                  type={showSecret ? "text" : "password"}
                  placeholder="40 caracteres"
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  className="font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="aws-region">AWS_REGION</Label>
              <select
                id="aws-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              >
                {REGION_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={saveCredentials}
                disabled={isSavingCreds || !accessKeyId || !secretAccessKey}
              >
                {isSavingCreds ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar credenciais
              </Button>
              {secretsStatus && (
                <span className="text-xs text-muted-foreground">
                  Origem atual:{" "}
                  <Badge variant="outline" className="text-[10px]">
                    {secretsStatus.source === "db" ? "banco (tenant)"
                      : secretsStatus.source === "env" ? "env vars (fallback)"
                      : secretsStatus.source === "mixed" ? "banco + env"
                      : "não configurado"}
                  </Badge>
                </span>
              )}
            </div>

            {!loadingStatus && (
              <div className="space-y-1 pt-3 border-t">
                <SecretRow label="AWS_ACCESS_KEY_ID" ok={!!secretsStatus?.has_access_key} value={secretsStatus?.access_key_prefix} />
                <SecretRow label="AWS_SECRET_ACCESS_KEY" ok={!!secretsStatus?.has_secret_key} value={secretsStatus?.has_secret_key ? "•••••• (40 caracteres)" : null} />
                <SecretRow label="AWS_REGION" ok={!!secretsStatus?.has_region} value={secretsStatus?.region} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sender email */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">E-mail remetente</CardTitle>
            <CardDescription>O endereço deve estar verificado no AWS SES → Verified Identities.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="senderEmail">From address</Label>
              <Input
                id="senderEmail"
                type="email"
                placeholder="contato@suaempresa.com"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Callback URL (SNS Webhook) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              URL de callback (SNS Webhook)
            </CardTitle>
            <CardDescription>
              Endpoint público que recebe notificações do SNS (entregas, aberturas, cliques, bounces, reclamações).
              Usado também durante o handshake <code className="text-[10px]">SubscriptionConfirmation</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ses-events-webhook`}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                onClick={() => {
                  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ses-events-webhook`;
                  navigator.clipboard.writeText(url);
                  toast.success("URL de callback copiada!");
                }}
                variant="outline"
                className="shrink-0 gap-2"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </Button>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-2">
              <p className="font-medium text-foreground">Como cadastrar manualmente no SNS:</p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                <li>AWS Console → SNS → Topic do SES → <strong>Create subscription</strong></li>
                <li>Protocol: <code>HTTPS</code></li>
                <li>Endpoint: cole a URL acima</li>
                <li>O webhook confirma a subscrição automaticamente no primeiro POST</li>
              </ol>
              <p className="text-muted-foreground pt-1">
                Ou clique em <strong>"Configurar rastreamento"</strong> abaixo para o setup automático
                (cria Configuration Set + SNS Topic + Subscription).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Validation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Validação</CardTitle>
            <CardDescription>Verifica credenciais (STS), identidade verificada e cota de envio.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ValidationItem label="1. Credenciais válidas" result={checks.credentials} />
            <ValidationItem label="2. Região acessível" result={checks.region} />
            <ValidationItem label="3. E-mail remetente verificado" result={checks.identity} />
            <ValidationItem label="4. Permissão de envio (IAM + cota)" result={checks.quota} />

            {checks.region.state === "ok" && checks.region.detail?.includes("Sandbox") && (
              <div className="flex gap-2 p-3 bg-muted border border-border rounded-md text-sm">
                <AlertTriangle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Conta em modo Sandbox</p>
                  <p className="text-muted-foreground text-xs mt-1">Você só envia para e-mails verificados. Solicite saída do sandbox no console AWS SES para enviar para qualquer destinatário.</p>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={runValidation} disabled={isValidating || !allSecretsReady || !senderEmail}>
                {isValidating ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Validando...</> : <><RefreshCw className="h-4 w-4 mr-1" /> {validationCompleted ? "Revalidar" : "Validar conexão"}</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tracking de eventos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rastreamento de eventos</CardTitle>
            <CardDescription>
              Configura no AWS o Configuration Set, o tópico SNS e a assinatura HTTPS para receber em tempo real entregas, aberturas, cliques, bounces e reclamações. Sem isso, os relatórios das campanhas só mostram "enviado".
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {trackingSetup?.configuration_set ? (
              <div className="p-3 bg-secondary/30 rounded-md text-sm space-y-1">
                <p><strong>Configuration Set:</strong> <code className="text-xs">{trackingSetup.configuration_set}</code></p>
                {trackingSetup.topic_arn && <p className="break-all"><strong>SNS Topic:</strong> <code className="text-xs">{trackingSetup.topic_arn}</code></p>}
                {trackingSetup.tracking_setup_at && <p className="text-xs text-muted-foreground">Última configuração: {new Date(trackingSetup.tracking_setup_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>}
              </div>
            ) : (
              <div className="flex gap-2 p-3 bg-muted border border-border rounded-md text-sm">
                <AlertTriangle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Rastreamento ainda não configurado</p>
                  <p className="text-xs mt-1">Clique em "Configurar rastreamento" para criar o Configuration Set, o tópico SNS e a assinatura webhook automaticamente.</p>
                </div>
              </div>
            )}

            <Button onClick={setupTracking} disabled={isSettingUpTracking || !allSecretsReady}>
              {isSettingUpTracking ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Configurando...</> : <><ShieldCheck className="h-4 w-4 mr-2" /> {trackingSetup?.configuration_set ? "Reverificar/Reparar" : "Configurar rastreamento"}</>}
            </Button>

            {trackingLog.length > 0 && (
              <div className="mt-2 p-3 bg-muted/50 rounded-md text-xs font-mono space-y-1 max-h-48 overflow-auto">
                {trackingLog.map((line, i) => <div key={i}>• {line}</div>)}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test & activate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Teste e ativação</CardTitle>
            <CardDescription>Envie um e-mail de teste e ative a integração para uso em campanhas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 bg-secondary/30 rounded-md text-sm space-y-1">
              <p><strong>Destinatário do teste:</strong> {user?.email}</p>
              <p><strong>Remetente:</strong> {senderEmail || <span className="text-muted-foreground">não definido</span>}</p>
              <p><strong>Região:</strong> {secretsStatus?.region || "—"}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={sendTestEmail} disabled={isSendingTest || !allSecretsReady || !senderEmail} variant="outline">
                {isSendingTest ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</> : <><Send className="h-4 w-4 mr-2" /> Enviar teste para mim</>}
              </Button>
              <Button onClick={saveAndActivate} disabled={isSaving || !senderEmail}>
                {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="h-4 w-4 mr-2" /> {isConnected ? "Atualizar" : "Salvar e ativar"}</>}
              </Button>
              {isConnected && (
                <Button variant="outline" onClick={deactivate} className="text-destructive hover:text-destructive ml-auto">
                  Desativar integração
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* IAM hint */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Permissões IAM mínimas
              <a href="https://docs.aws.amazon.com/ses/latest/dg/setting-up.html" target="_blank" rel="noopener noreferrer" className="text-primary text-xs ml-auto inline-flex items-center gap-1">
                Documentação <ExternalLink className="h-3 w-3" />
              </a>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">
              Anexe esta policy ao usuário IAM. Para tracking automático (Configuration Set + SNS),
              também precisa das ações SNS — recomendado anexar as managed policies
              <code className="text-xs bg-muted px-1 rounded mx-1">AmazonSESFullAccess</code> +
              <code className="text-xs bg-muted px-1 rounded">AmazonSNSFullAccess</code>:
            </p>
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{`{
  "Effect": "Allow",
  "Action": [
    "ses:SendEmail",
    "ses:SendRawEmail",
    "ses:GetSendQuota",
    "ses:GetSendStatistics",
    "ses:GetAccount",
    "ses:GetIdentityVerificationAttributes",
    "ses:GetIdentityDkimAttributes",
    "ses:ListIdentities",
    "ses:VerifyEmailIdentity",
    "ses:VerifyDomainIdentity",
    "ses:DeleteIdentity",
    "ses:CreateConfigurationSet",
    "ses:DescribeConfigurationSet",
    "ses:ListConfigurationSets",
    "ses:CreateConfigurationSetEventDestination",
    "ses:UpdateConfigurationSetEventDestination",
    "sns:ListTopics",
    "sns:CreateTopic",
    "sns:GetTopicAttributes",
    "sns:SetTopicAttributes",
    "sns:ListSubscriptionsByTopic",
    "sns:Subscribe",
    "sts:GetCallerIdentity"
  ],
  "Resource": "*"
}`}
            </pre>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function ValidationItem({ label, result }: { label: string; result: CheckResult }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md border">
      <div className="mt-0.5">
        {result.state === "pending" && <div className="h-5 w-5 rounded-full border-2 border-muted" />}
        {result.state === "running" && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
        {result.state === "ok" && <CheckCircle2 className="h-5 w-5 text-primary" />}
        {result.state === "error" && <XCircle className="h-5 w-5 text-destructive" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        {result.detail && <p className="text-xs text-muted-foreground mt-0.5">{result.detail}</p>}
        {result.error && <p className="text-xs text-destructive mt-0.5 break-words">{result.error}</p>}
      </div>
    </div>
  );
}
