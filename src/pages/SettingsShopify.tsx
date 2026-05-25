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
  Store,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

export default function SettingsShopify() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
  const redirectUri = useMemo(
    () => `${supabaseUrl}/functions/v1/shopify-auth?action=callback`,
    [supabaseUrl]
  );

  useEffect(() => {
    const status = searchParams.get("connected");
    const err = searchParams.get("error");
    if (status === "true") {
      toast.success("Shopify conectado com sucesso!");
      window.history.replaceState({}, "", "/settings/integrations/shopify");
    } else if (err) {
      toast.error("Falha na conexão Shopify: " + decodeURIComponent(err));
      window.history.replaceState({}, "", "/settings/integrations/shopify");
    }
  }, [searchParams]);

  const { data: integration, isLoading } = useQuery({
    queryKey: ["shopify-integration", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("provider", "shopify")
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
      setShopDomain(cfg?.shop_domain || "");
    }
  }, [integration]);

  const config = (integration?.config || {}) as any;
  const hasCredentials = Boolean(config?.client_id && config?.client_secret);
  const hasShopDomain = Boolean(config?.shop_domain);
  const hasTokens = Boolean(config?.access_token);
  const isConnected = Boolean(integration?.is_active && hasTokens);
  const connectedAt = config?.connected_at ? new Date(config.connected_at) : null;

  function normalizeShop(raw: string): string {
    let s = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (s && !s.endsWith(".myshopify.com") && /^[a-z0-9][a-z0-9-]*$/.test(s)) {
      s = `${s}.myshopify.com`;
    }
    return s;
  }

  const saveCredentialsMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("Sem tenant ativo");
      if (!clientId.trim() || !clientSecret.trim()) {
        throw new Error("Preencha client_id e client_secret");
      }
      const normShop = normalizeShop(shopDomain);
      if (!normShop || !normShop.endsWith(".myshopify.com")) {
        throw new Error("Domínio inválido (use algo como maxfem.myshopify.com)");
      }
      const baseConfig = {
        ...(config || {}),
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        shop_domain: normShop,
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
          provider: "shopify",
          config: baseConfig,
          is_active: false,
          sync_status: "idle",
        });
        if (error) throw error;
      }
      setShopDomain(normShop);
    },
    onSuccess: () => {
      toast.success("Credenciais salvas. Agora clica em \"Conectar Shopify\".");
      queryClient.invalidateQueries({ queryKey: ["shopify-integration"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleConnect = () => {
    if (!currentTenant) return;
    if (!hasCredentials || !hasShopDomain) {
      toast.error("Salva client_id, client_secret e o domínio da loja antes de conectar");
      return;
    }
    const fnUrl = `${supabaseUrl}/functions/v1/shopify-auth?action=authorize&tenant_id=${currentTenant.id}`;
    window.location.href = fnUrl;
  };

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${supabaseUrl}/functions/v1/shopify-auth?action=test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: currentTenant?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha no teste");
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`OK · Loja: ${data?.shop?.name || data?.shop?.domain || "conectada"}`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${supabaseUrl}/functions/v1/shopify-auth?action=disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: currentTenant?.id }),
      });
      if (!res.ok) throw new Error("Erro ao desconectar");
    },
    onSuccess: () => {
      toast.success("Shopify desconectado");
      queryClient.invalidateQueries({ queryKey: ["shopify-integration"] });
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold text-lg bg-[#96BF48]">
              S
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Shopify</h1>
              <p className="text-sm text-muted-foreground">
                Plataforma global de e-commerce — pedidos, clientes, produtos
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
              1. Cadastrar redirect URI no Shopify Partner
            </CardTitle>
            <CardDescription className="text-xs">
              Crie um Custom App em{" "}
              <a
                href="https://partners.shopify.com/"
                target="_blank"
                rel="noreferrer"
                className="underline inline-flex items-center gap-1"
              >
                partners.shopify.com <ExternalLink className="h-3 w-3" />
              </a>{" "}
              e cole o redirect URI abaixo em "Allowed redirection URL(s)".
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

        {/* Step 2 — Credentials + Shop Domain */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              2. Cole credenciais e domínio da loja
            </CardTitle>
            <CardDescription className="text-xs">
              client_id e secret aparecem no app criado no Partner Dashboard. Domínio é o `.myshopify.com`
              da sua loja (não o domínio customizado).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="shopify-shop-domain" className="flex items-center gap-2">
                <Store className="h-3.5 w-3.5" />
                Domínio da loja
              </Label>
              <Input
                id="shopify-shop-domain"
                placeholder="maxfem.myshopify.com"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Aceita só o subdomínio também (ex: "maxfem") — completamos o `.myshopify.com`.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shopify-client-id">client_id (API key)</Label>
              <Input
                id="shopify-client-id"
                placeholder="7f346ab30461edbbb28c5ba4d8e7ce0a"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shopify-client-secret">client_secret</Label>
              <div className="relative">
                <Input
                  id="shopify-client-secret"
                  type={showSecret ? "text" : "password"}
                  placeholder="shpss_••••••••"
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
              disabled={saveCredentialsMutation.isPending || !clientId || !clientSecret || !shopDomain}
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
                    ? "Token offline ativo. Shopify não expira access_token — não precisa renovar."
                    : hasCredentials && hasShopDomain
                      ? "Pronto pra autorizar — clique em Conectar."
                      : "Salve credenciais e domínio primeiro."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isConnected && (
              <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Loja</span>
                  <span className="font-medium font-mono text-xs">{config.shop_domain}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Conectado em</span>
                  <span className="font-medium">
                    {connectedAt?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scopes</span>
                  <span className="font-medium text-xs max-w-[300px] truncate">{config.scope || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">API version</span>
                  <span className="font-medium font-mono text-xs">{config.api_version || "2025-01"}</span>
                </div>
                {integration?.sync_error && (
                  <div className="flex justify-between text-destructive">
                    <span>Último erro</span>
                    <span className="font-medium text-xs max-w-[300px] truncate">{integration.sync_error}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {!isConnected ? (
                <Button onClick={handleConnect} disabled={!hasCredentials || !hasShopDomain} className="gap-2">
                  <Link2 className="h-4 w-4" />
                  Conectar Shopify
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handleConnect} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Reconectar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => testMutation.mutate()}
                    disabled={testMutation.isPending}
                    className="gap-2"
                  >
                    {testMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Testar conexão
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (confirm("Desconectar Shopify? O access token será removido.")) {
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
            <CardDescription className="text-xs">
              Recursos disponíveis com Shopify Admin API {SHOPIFY_API_VERSION_LABEL}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {["Clientes", "Pedidos", "Produtos", "Estoque", "Carrinhos abandonados", "Fulfillments"].map((f) => (
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

const SHOPIFY_API_VERSION_LABEL = "2025-01";
