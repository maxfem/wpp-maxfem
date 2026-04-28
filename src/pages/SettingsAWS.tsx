import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Send, ShieldCheck, AlertTriangle, Save, RefreshCw, ExternalLink, Key } from "lucide-react";
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
}

export default function SettingsAWS() {
  const navigate = useNavigate();
  const { currentTenant, user } = useAuth();
  const queryClient = useQueryClient();

  const [senderEmail, setSenderEmail] = useState("");
  const [secretsStatus, setSecretsStatus] = useState<SecretsStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
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

  useEffect(() => {
    if (integration?.config) {
      const cfg = integration.config as any;
      setSenderEmail(cfg.sender_email || "");
    }
  }, [integration]);

  // Fetch secrets status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      setLoadingStatus(true);
      try {
        const { data, error } = await supabase.functions.invoke("send-email-ses", {
          body: { mode: "status" },
        });
        if (error) throw error;
        setSecretsStatus(data as SecretsStatus);
      } catch (e: any) {
        toast.error(`Erro ao verificar credenciais: ${e.message}`);
      } finally {
        setLoadingStatus(false);
      }
    };
    fetchStatus();
  }, []);

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
      const { data, error } = await supabase.functions.invoke("send-email-ses", {
        body: { mode: "validate", fromEmail: senderEmail.trim() },
      });

      if (error) {
        setChecks({
          credentials: { state: "error", error: error.message || "Falha ao chamar a função" },
          region: { state: "pending" },
          identity: { state: "pending" },
          quota: { state: "pending" },
        });
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
      const { data, error } = await supabase.functions.invoke("send-email-ses", {
        body: {
          mode: "test",
          to: user.email,
          fromEmail: senderEmail.trim(),
          subject: "✅ Teste AWS SES — Maxfem CRM",
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px;">
            <h1 style="color:#ED2B75;margin-bottom:16px;">Tudo certo! 🎉</h1>
            <p>Sua integração com o AWS SES está funcionando perfeitamente.</p>
            <p>Este e-mail foi enviado de <strong>${senderEmail}</strong> via região <strong>${secretsStatus?.region || "—"}</strong>.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
            <p style="color:#888;font-size:12px;">Maxfem CRM — Sistema de Email Marketing</p>
          </div>`,
        },
      });
      if (error || data?.error) {
        throw new Error(error?.message || data?.error);
      }
      toast.success(`E-mail de teste enviado para ${user.email}!`, {
        description: `Message ID: ${data.messageId}`,
      });
    } catch (e: any) {
      toast.error(`Falha no envio: ${e.message}`);
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
      const config: any = {
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

        {/* Secrets status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="h-4 w-4" /> Credenciais AWS (secrets do projeto)
            </CardTitle>
            <CardDescription>
              As credenciais ficam armazenadas com segurança como secrets do projeto, não no banco de dados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingStatus ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando secrets...
              </div>
            ) : (
              <div className="space-y-1">
                <SecretRow label="AWS_ACCESS_KEY_ID" ok={!!secretsStatus?.has_access_key} value={secretsStatus?.access_key_prefix} />
                <SecretRow label="AWS_SECRET_ACCESS_KEY" ok={!!secretsStatus?.has_secret_key} value={secretsStatus?.has_secret_key ? "•••••• (40 caracteres)" : null} />
                <SecretRow label="AWS_REGION" ok={!!secretsStatus?.has_region} value={secretsStatus?.region} />

                {!allSecretsReady && (
                  <div className="mt-4 flex gap-2 p-3 bg-muted border border-border rounded-md text-sm">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="text-foreground">
                      <p className="font-medium">Secrets faltando</p>
                      <p className="text-xs mt-1">Configure os secrets ausentes no projeto (Lovable Cloud → Secrets) para habilitar o envio de e-mails.</p>
                    </div>
                  </div>
                )}

                {secretsStatus?.has_access_key && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Para alterar as credenciais, atualize os secrets pelo painel do Lovable Cloud.
                  </p>
                )}
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
              Anexe esta policy ao usuário IAM (ou use a managed policy <code className="text-xs bg-muted px-1 rounded">AmazonSESFullAccess</code>):
            </p>
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{`{
  "Effect": "Allow",
  "Action": [
    "ses:SendEmail",
    "ses:SendRawEmail",
    "ses:GetSendQuota",
    "ses:GetIdentityVerificationAttributes",
    "ses:GetAccount",
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
