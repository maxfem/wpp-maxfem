import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  RefreshCw,
  ShoppingCart,
  Users,
  Package,
  CreditCard,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";

export default function SettingsYampi() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();

  const [alias, setAlias] = useState("");
  const [userToken, setUserToken] = useState("");
  const [userSecretKey, setUserSecretKey] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [syncCustomers, setSyncCustomers] = useState(true);
  const [syncOrders, setSyncOrders] = useState(true);
  const [syncAbandonedCarts, setSyncAbandonedCarts] = useState(true);

  const { data: integration, isLoading } = useQuery({
    queryKey: ["integration-yampi", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("provider", "yampi")
        .maybeSingle();
      return data;
    },
    enabled: !!currentTenant,
  });

  useEffect(() => {
    if (integration) {
      const config = integration.config as any;
      setAlias(config?.alias || "");
      setUserToken(config?.user_token || "");
      setUserSecretKey(config?.user_secret_key || "");
      const syncSettings = integration.sync_settings as any;
      setSyncCustomers(syncSettings?.customers ?? true);
      setSyncOrders(syncSettings?.orders ?? true);
      setSyncAbandonedCarts(syncSettings?.abandoned_carts ?? true);
    }
  }, [integration]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("Sem tenant");
      const payload = {
        tenant_id: currentTenant.id,
        provider: "yampi",
        is_active: true,
        config: { alias, user_token: userToken, user_secret_key: userSecretKey },
        sync_settings: { customers: syncCustomers, orders: syncOrders, abandoned_carts: syncAbandonedCarts },
      };

      if (integration) {
        const { error } = await supabase
          .from("integrations")
          .update(payload)
          .eq("id", integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("integrations")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-yampi"] });
      toast.success("Integração Yampi salva com sucesso!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("Sem tenant");
      const { data, error } = await supabase.functions.invoke("yampi-sync", {
        body: { tenant_id: currentTenant.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["integration-yampi"] });
      toast.success(
        `Sincronização concluída! ${data?.customers_synced || 0} clientes, ${data?.orders_synced || 0} pedidos, ${data?.carts_synced || 0} carrinhos.`
      );
    },
    onError: (err: any) => toast.error(`Erro na sincronização: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!integration) return;
      const { error } = await supabase.from("integrations").delete().eq("id", integration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-yampi"] });
      toast.success("Integração removida");
      navigate("/settings/integrations");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const isConfigured = !!alias && !!userToken && !!userSecretKey;
  const syncStatus = (integration as any)?.sync_status;
  const syncError = (integration as any)?.sync_error;
  const lastSynced = (integration as any)?.last_synced_at;

  const SYNC_DATA_TYPES = [
    {
      key: "customers",
      label: "Clientes",
      description: "Nome, email, telefone, endereço, data de nascimento, CPF",
      icon: Users,
      value: syncCustomers,
      onChange: setSyncCustomers,
    },
    {
      key: "orders",
      label: "Pedidos",
      description: "Status, valor, produtos, rastreamento, forma de pagamento, Pix não pago",
      icon: Package,
      value: syncOrders,
      onChange: setSyncOrders,
    },
    {
      key: "abandoned_carts",
      label: "Carrinhos Abandonados",
      description: "Produtos no carrinho, valor, URL de recuperação, dados do cliente",
      icon: ShoppingCart,
      value: syncAbandonedCarts,
      onChange: setSyncAbandonedCarts,
    },
  ];

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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold text-lg bg-[#6C5CE7]">
              Y
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Yampi</h1>
              <p className="text-sm text-muted-foreground">
                Checkout transparente e gestão de e-commerce
              </p>
            </div>
          </div>
        </div>

        {/* Status Banner */}
        {integration && (
          <Card className={`border ${syncStatus === "failed" ? "border-destructive/50 bg-destructive/5" : syncStatus === "success" ? "border-green-500/30 bg-green-500/5" : "border-border"}`}>
            <CardContent className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {syncStatus === "success" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                {syncStatus === "failed" && <AlertTriangle className="h-4 w-4 text-destructive" />}
                {syncStatus === "syncing" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {syncStatus === "pending" && <Clock className="h-4 w-4 text-muted-foreground" />}
                <span className="text-sm text-foreground">
                  {syncStatus === "success" && "Última sincronização concluída"}
                  {syncStatus === "failed" && "Erro na última sincronização"}
                  {syncStatus === "syncing" && "Sincronizando..."}
                  {syncStatus === "pending" && "Aguardando primeira sincronização"}
                </span>
                {lastSynced && (
                  <span className="text-xs text-muted-foreground">
                    · {new Date(lastSynced).toLocaleString("pt-BR")}
                  </span>
                )}
              </div>
              {syncError && (
                <span className="text-xs text-destructive max-w-xs truncate" title={syncError}>
                  {syncError}
                </span>
              )}
            </CardContent>
          </Card>
        )}

        {/* Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credenciais da API</CardTitle>
            <CardDescription className="text-xs">
              Encontre em Yampi → Perfil → Credenciais de API. O alias é o identificador da sua loja na URL.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="alias">Alias da loja</Label>
              <Input
                id="alias"
                placeholder="minha-loja"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                O alias aparece na URL: api.dooki.com.br/v2/<strong>{alias || "sua-loja"}</strong>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="token">User Token</Label>
              <div className="relative">
                <Input
                  id="token"
                  type={showToken ? "text" : "password"}
                  placeholder="Seu User Token"
                  value={userToken}
                  onChange={(e) => setUserToken(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secret">User Secret Key</Label>
              <div className="relative">
                <Input
                  id="secret"
                  type={showSecret ? "text" : "password"}
                  placeholder="Sua User Secret Key"
                  value={userSecretKey}
                  onChange={(e) => setUserSecretKey(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sync Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados para Sincronizar</CardTitle>
            <CardDescription className="text-xs">
              Selecione quais dados importar da Yampi para usar em automações e campanhas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {SYNC_DATA_TYPES.map((item) => (
              <div key={item.key} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
                    <item.icon className="h-4 w-4 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <Switch checked={item.value} onCheckedChange={item.onChange} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Data Capabilities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que você poderá fazer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: Users, text: "Importar base de clientes completa" },
                { icon: Package, text: "Sincronizar status de pedidos em tempo real" },
                { icon: ShoppingCart, text: "Recuperar carrinhos abandonados via WhatsApp" },
                { icon: CreditCard, text: "Disparar lembretes de Pix não pago" },
                { icon: Truck, text: "Enviar notificação de rastreio automático" },
                { icon: AlertTriangle, text: "Acionar automação por evento de compra" },
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
            disabled={!isConfigured || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Configuração
          </Button>

          {integration && (
            <Button
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={!isConfigured || syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sincronizar Agora
            </Button>
          )}

          {integration && (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("Tem certeza que deseja remover a integração Yampi?")) {
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
