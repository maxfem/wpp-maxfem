import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Eye, EyeOff, Send, ShieldCheck, AlertTriangle, Save, RefreshCw, ChevronRight, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState, useEffect } from "react";

type Step = 1 | 2 | 3;
type CheckState = "pending" | "running" | "ok" | "error";

interface CheckResult {
  state: CheckState;
  detail?: string;
  error?: string;
}

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

const REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia) — us-east-1" },
  { value: "us-west-2", label: "US West (Oregon) — us-west-2" },
  { value: "sa-east-1", label: "South America (São Paulo) — sa-east-1" },
  { value: "eu-west-1", label: "Europe (Ireland) — eu-west-1" },
  { value: "eu-central-1", label: "Europe (Frankfurt) — eu-central-1" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore) — ap-southeast-1" },
];

export default function SettingsAWS() {
  const navigate = useNavigate();
  const { currentTenant, user } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(1);
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [senderEmail, setSenderEmail] = useState("");
  const [showSecret, setShowSecret] = useState(false);
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
      setAccessKey(cfg.access_key || "");
      setSecretKey(cfg.secret_key || "");
      setRegion(cfg.region || "us-east-1");
      setSenderEmail(cfg.sender_email || "");
    }
  }, [integration]);

  const isConnected = integration?.is_active;

  // Client-side validation for step 1
  const canAdvanceToStep2 = () => {
    if (!accessKey.startsWith("AKIA") && !accessKey.startsWith("ASIA")) {
      toast.error("Access Key ID inválida (deve começar com AKIA ou ASIA).");
      return false;
    }
    if (secretKey.length !== 40) {
      toast.error(`Secret Access Key deve ter exatamente 40 caracteres (atual: ${secretKey.length}).`);
      return false;
    }
    if (!senderEmail.includes("@")) {
      toast.error("E-mail do remetente inválido.");
      return false;
    }
    return true;
  };

  const runValidation = async () => {
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
        body: {
          mode: "validate",
          accessKey: accessKey.trim(),
          secretKey: secretKey.trim(),
          region: region.trim(),
          fromEmail: senderEmail.trim(),
        },
      });

      if (error) {
        // Network/function error
        setChecks({
          credentials: { state: "error", error: error.message || "Falha ao chamar a função" },
          region: { state: "pending" },
          identity: { state: "pending" },
          quota: { state: "pending" },
        });
        return;
      }

      // Map backend response to UI state
      const c = data.checks;
      setChecks({
        credentials: c.credentials.ok
          ? { state: "ok", detail: `Conta AWS: ${c.credentials.account_id}` }
          : { state: "error", error: c.credentials.error },
        region: c.region.ok
          ? { state: "ok", detail: c.region.sandbox === true ? `${c.region.region} (modo Sandbox)` : c.region.sandbox === false ? `${c.region.region} (modo Produção)` : c.region.region }
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
    setIsSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email-ses", {
        body: {
          mode: "test",
          to: user.email,
          subject: "✅ Teste AWS SES — Maxfem CRM",
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px;">
            <h1 style="color:#ED2B75;margin-bottom:16px;">Tudo certo! 🎉</h1>
            <p>Sua integração com o AWS SES está funcionando perfeitamente.</p>
            <p>Este e-mail foi enviado de <strong>${senderEmail}</strong> via região <strong>${region}</strong>.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
            <p style="color:#888;font-size:12px;">Maxfem CRM — Sistema de Email Marketing</p>
          </div>`,
          accessKey: accessKey.trim(),
          secretKey: secretKey.trim(),
          region: region.trim(),
          fromEmail: senderEmail.trim(),
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
    setIsSaving(true);
    try {
      const config: any = {
        access_key: accessKey.trim(),
        secret_key: secretKey.trim(),
        region: region.trim(),
        sender_email: senderEmail.trim(),
        last_validated_at: new Date().toISOString(),
        last_validation_checks: JSON.parse(JSON.stringify(checks)),
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

      toast.success("Integração AWS SES ativada com sucesso!");
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

  const stepLabels = ["Credenciais", "Validação", "Teste & Ativar"];

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings/integrations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3 flex-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold text-lg bg-[#FF9900]">A</div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">Amazon AWS SES</h1>
              <p className="text-sm text-muted-foreground">Configure o envio de e-mails transacionais e de marketing</p>
            </div>
            {isConnected && (
              <Badge className="bg-green-600 text-white">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Ativo
              </Badge>
            )}
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-2">
          {stepLabels.map((label, idx) => {
            const num = (idx + 1) as Step;
            const active = step === num;
            const completed = step > num;
            return (
              <div key={num} className="flex items-center gap-2 flex-1">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  completed ? "bg-green-600 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {completed ? <CheckCircle2 className="h-4 w-4" /> : num}
                </div>
                <span className={`text-sm ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
                {idx < stepLabels.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            );
          })}
        </div>

        {/* STEP 1 — Credenciais */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Passo 1 — Credenciais AWS</CardTitle>
              <CardDescription>
                Cole as credenciais do usuário IAM com permissão para AWS SES.{" "}
                <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                  Como obter <ExternalLink className="h-3 w-3" />
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accessKey">AWS Access Key ID</Label>
                <Input
                  id="accessKey"
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">20 caracteres, começa com AKIA</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="secretKey">AWS Secret Access Key</Label>
                <div className="relative">
                  <Input
                    id="secretKey"
                    type={showSecret ? "text" : "password"}
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    className="font-mono text-sm pr-10"
                  />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowSecret(!showSecret)}>
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Exatamente 40 caracteres ({secretKey.length}/40).
                  {secretKey.length > 0 && secretKey.length !== 40 && (
                    <span className="text-destructive ml-1">⚠ Comprimento incorreto</span>
                  )}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="region">Região AWS</Label>
                  <select
                    id="region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    {REGIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="senderEmail">E-mail do remetente</Label>
                  <Input
                    id="senderEmail"
                    type="email"
                    placeholder="contato@suaempresa.com"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Deve estar verificado no AWS SES</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => { if (canAdvanceToStep2()) setStep(2); }}>
                  Próximo: Validar
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 2 — Validação */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Passo 2 — Validação com a AWS</CardTitle>
              <CardDescription>Vamos checar se as credenciais funcionam, a região é válida, o remetente está verificado e o usuário IAM tem permissão para enviar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ValidationItem label="1. Credenciais válidas" result={checks.credentials} />
              <ValidationItem label="2. Região acessível" result={checks.region} />
              <ValidationItem label="3. E-mail remetente verificado" result={checks.identity} />
              <ValidationItem label="4. Permissão de envio (IAM)" result={checks.quota} />

              {checks.region.state === "ok" && checks.region.detail?.includes("Sandbox") && (
                <div className="flex gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-900">Sua conta está em modo Sandbox</p>
                    <p className="text-yellow-800 text-xs mt-1">Você só consegue enviar para e-mails verificados. Solicite saída do sandbox no console AWS para enviar para qualquer destinatário.</p>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <div className="flex gap-2">
                  <Button onClick={runValidation} disabled={isValidating}>
                    {isValidating ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Validando...</> : <><RefreshCw className="h-4 w-4 mr-1" /> {validationCompleted ? "Revalidar" : "Iniciar validação"}</>}
                  </Button>
                  {validationCompleted && allChecksPassed && (
                    <Button onClick={() => setStep(3)}>
                      Próximo: Teste
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 3 — Teste & Ativar */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Passo 3 — Teste e Ativação</CardTitle>
              <CardDescription>Envie um e-mail de teste para você mesmo e ative a integração.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-secondary/30 rounded-lg space-y-2">
                <p className="text-sm"><strong>Destinatário do teste:</strong> {user?.email}</p>
                <p className="text-sm"><strong>Remetente:</strong> {senderEmail}</p>
                <p className="text-sm"><strong>Região:</strong> {region}</p>
              </div>

              <Button onClick={sendTestEmail} disabled={isSendingTest} className="w-full" variant="outline">
                {isSendingTest ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</> : <><Send className="h-4 w-4 mr-2" /> Enviar e-mail de teste para {user?.email}</>}
              </Button>

              <div className="flex justify-between pt-4 border-t">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button onClick={saveAndActivate} disabled={isSaving}>
                  {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="h-4 w-4 mr-2" /> {isConnected ? "Atualizar integração" : "Salvar e ativar integração"}</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active integration management */}
        {isConnected && step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Integração ativa</CardTitle>
              <CardDescription>Você já tem uma integração AWS SES salva. Você pode revalidar, testar novamente ou desativar.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                <RefreshCw className="h-4 w-4 mr-1" /> Revalidar
              </Button>
              <Button variant="outline" size="sm" onClick={sendTestEmail} disabled={isSendingTest}>
                <Send className="h-4 w-4 mr-1" /> {isSendingTest ? "Enviando..." : "Enviar teste"}
              </Button>
              <Button variant="outline" size="sm" onClick={deactivate} className="text-destructive hover:text-destructive">
                Desativar
              </Button>
            </CardContent>
          </Card>
        )}

        {/* IAM policy hint */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Permissões IAM mínimas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">Anexe esta policy ao usuário IAM (ou use a managed policy <code className="text-xs bg-muted px-1 rounded">AmazonSESFullAccess</code>):</p>
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
        {result.state === "ok" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
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
