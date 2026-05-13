import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Link2,
  Unlink,
  RefreshCw,
  CheckCircle2,
  Eye,
  EyeOff,
  Save,
  Loader2,
  Copy,
  ExternalLink,
  KeyRound,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

export default function SettingsBling() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
  const redirectUri = useMemo(
    () => `${supabaseUrl}/functions/v1/bling-auth?action=callback`,
    [supabaseUrl]
  );

  useEffect(() => {
    const status = searchParams.get("connected");
    const err = searchParams.get("error");
    if (status === "true") {
      toast.success("Bling conectado com sucesso!");
      window.history.replaceState({}, "", "/settings/integrations/bling");
    } else if (err) {
      toast.error("Falha na conexão Bling: " + decodeURIComponent(err));
      window.history.replaceState({}, "", "/settings/integrations/bling");
    }
  }, [searchParams]);

  const { data: integration, isLoading } = useQuery({
    queryKey: ["bling-integration", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("provider", "bling")
        .maybeSingle();
      return data;
    },
    enabled: !!currentTenant,
  });

  useEffect(() => {
    if (integration) {
      const cfg = integration.config as any;
      setClientId(cfg?.client_id || "");
      setClientSecret(cfg?.client_secret || "");
    }
  }, [integration]);

  const config = (integration?.config || {}) as any;
  const hasCredentials = Boolean(config?.client_id && config?.client_secret);
  const hasTokens = Boolean(config?.access_token);
  const isConnected = Boolean(integration?.is_active && hasTokens);

  const accessExpiresAt = config?.access_expires_at ? new Date(config.access_expires_at) : null;
  const refreshExpiresAt = config?.refresh_expires_at ? new Date(config.refresh_expires_at) : null;

  const saveCredentialsMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("Sem tenant ativo");
      if (!clientId.trim() || !clientSecret.trim()) {
        throw new Error("Preencha client_id e client_secret");
      }
      const baseConfig = { ...(config || {}), client_id: clientId.trim(), client_secret: clientSecret.trim() };
      if (integration) {
        const { error } = await supabase
          .from("integrations")
          .update({ config: baseConfig, updated_at: new Date().toISOString() })
          .eq("id", integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("integrations").insert({
          tenant_id: currentTenant.id,
          provider: "bling",
          config: baseConfig,
          is_active: false,
          sync_status: "idle",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Credenciais salvas. Agora clica em \"Conectar Bling\".");
      queryClient.invalidateQueries({ queryKey: ["bling-integration"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleConnect = () => {
    if (!currentTenant) return;
    if (!hasCredentials) {
      toast.error("Salva client_id e client_secret antes de conectar");
      return;
    }
    const fnUrl = `${supabaseUrl}/functions/v1/bling-auth?action=authorize&tenant_id=${currentTenant.id}`;
    window.location.href = fnUrl;
  };

  const refreshNowMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${supabaseUrl}/functions/v1/bling-auth?action=refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: currentTenant?.id }),
      });
      if (!res.ok) throw new Error("Falha ao renovar token");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Renovado: ${data.refreshed} · Erros: ${data.errors}`);
      queryClient.invalidateQueries({ queryKey: ["bling-integration"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${supabaseUrl}/functions/v1/bling-auth?action=disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: currentTenant?.id }),
      });
      if (!res.ok) throw new Error("Erro ao desconectar");
    },
    onSuccess: () => {
      toast.success("Bling desconectado");
      queryClient.invalidateQueries({ queryKey: ["bling-integration"] });
    },
    onError: () => toast.error("Erro ao desconectar"),
  });

  const copyRedirect = () => {
    navigator.clipboard.writeText(redirectUri);
    toast.success("Redirect URI copiado!");
  };

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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold text-lg bg-[#0055AA]">
              B
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Bling</h1>
              <p className="text-sm text-muted-foreground">
                ERP completo — pedidos, produtos, NF-e, estoque
              </p>
            </div>
            {isConnected && (
              <Badge className="ml-2 bg-green-600 text-white">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
              </Badge>
            )}
          </div>
        </div>

        {/* Step 1 — Redirect URI */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              1. Cadastrar redirect URI no Bling
            </CardTitle>
            <CardDescription className="text-xs">
              Crie um app em <a href="https://developer.bling.com.br/aplicativos" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">developer.bling.com.br/aplicativos <ExternalLink className="h-3 w-3" /></a> e cole o redirect URI abaixo no campo "Link de redirecionamento".
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input value={redirectUri} readOnly className="font-mono text-xs" />
              <Button onClick={copyRedirect} variant="outline" className="shrink-0 gap-2">
                <Copy className="h-4 w-4" />
                Copiar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Step 2 — Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              2. Cole client_id e client_secret
            </CardTitle>
            <CardDescription className="text-xs">
              Esses valores aparecem após criar o app no painel Bling. Ficam armazenados no Supabase
              vinculados ao seu tenant — nunca expostos no front.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="bling-client-id">client_id</Label>
              <Input
                id="bling-client-id"
                placeholder="abc1234..."
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bling-client-secret">client_secret</Label>
              <div className="relative">
                <Input
                  id="bling-client-secret"
                  type={showSecret ? "text" : "password"}
                  placeholder="••••••••"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
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
            <Button
              onClick={() => saveCredentialsMutation.mutate()}
              disabled={saveCredentialsMutation.isPending || !clientId || !clientSecret}
            >
              {saveCredentialsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar credenciais
            </Button>
          </CardContent>
        </Card>

        {/* Step 3 — Connect */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  3. Conectar via OAuth
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  {isConnected
                    ? "Token ativo. Renovação automática rodando a cada hora."
                    : hasCredentials
                      ? "Pronto pra autorizar — clique em Conectar."
                      : "Salve as credenciais primeiro."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isConnected && accessExpiresAt && (
              <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Access token expira em</span>
                  <span className="font-medium">
                    {accessExpiresAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Refresh token expira em</span>
                  <span className="font-medium">
                    {refreshExpiresAt?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) || "—"}
                  </span>
                </div>
                {integration?.sync_error && (
                  <div className="flex justify-between text-destructive">
                    <span>Último erro</span>
                    <span className="font-medium text-xs max-w-[300px] truncate">{integration.sync_error}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Cron horário renova access_token quando faltam menos de 2h pra expirar.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {!isConnected ? (
                <Button onClick={handleConnect} disabled={!hasCredentials} className="gap-2">
                  <Link2 className="h-4 w-4" />
                  Conectar Bling
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handleConnect} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Reconectar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => refreshNowMutation.mutate()}
                    disabled={refreshNowMutation.isPending}
                    className="gap-2"
                  >
                    {refreshNowMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Renovar agora
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (confirm("Desconectar Bling? Os tokens serão removidos.")) {
                        disconnectMutation.mutate();
                      }
                    }}
                    disabled={disconnectMutation.isPending}
                    className="gap-2"
                  >
                    <Unlink className="h-4 w-4" />
                    Desconectar
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Funcionalidades */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funcionalidades</CardTitle>
            <CardDescription className="text-xs">Recursos disponíveis com Bling V3</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {["Clientes", "Pedidos", "Produtos", "NF-e", "Estoque", "Financeiro"].map((f) => (
                <div key={f} className="flex items-center gap-2 rounded-lg border border-border p-3">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm">{f}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
