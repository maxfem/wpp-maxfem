import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Link2, Unlink, RefreshCw, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect } from "react";

export default function SettingsBling() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("connected") === "true") {
      toast.success("Bling conectado com sucesso!");
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

  const isConnected = integration?.is_active;

  const handleConnect = () => {
    if (!currentTenant) return;
    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bling-auth?action=authorize&tenant_id=${currentTenant.id}`;
    window.location.href = fnUrl;
  };

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("bling-auth", {
        body: { tenant_id: currentTenant?.id },
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      // Pass action via query param workaround: call directly
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bling-auth?action=disconnect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenant_id: currentTenant?.id }),
        }
      );
      if (!res.ok) throw new Error("Erro ao desconectar");
    },
    onSuccess: () => {
      toast.success("Bling desconectado");
      queryClient.invalidateQueries({ queryKey: ["bling-integration"] });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: () => toast.error("Erro ao desconectar o Bling"),
  });

  const config = integration?.config as any;
  const accessExpiresAt = config?.access_expires_at ? new Date(config.access_expires_at) : null;
  const refreshExpiresAt = config?.refresh_expires_at ? new Date(config.refresh_expires_at) : null;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
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
              <p className="text-sm text-muted-foreground">ERP completo com emissão de NF-e, controle de estoque e financeiro</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Status da Conexão</CardTitle>
                <CardDescription>
                  {isConnected
                    ? "Sua conta Bling está conectada via OAuth2 com renovação automática de token."
                    : "Conecte sua conta Bling para sincronizar dados."}
                </CardDescription>
              </div>
              {isConnected ? (
                <Badge className="bg-green-600 text-white">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="secondary">Desconectado</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isConnected && accessExpiresAt && (
              <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Token expira em</span>
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
                <p className="text-xs text-muted-foreground mt-2">
                  <RefreshCw className="inline h-3 w-3 mr-1" />
                  O token é renovado automaticamente a cada 4 horas. Você não precisa reconectar.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              {!isConnected ? (
                <Button onClick={handleConnect} className="gap-2">
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
                    variant="destructive"
                    onClick={() => disconnectMutation.mutate()}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Funcionalidades</CardTitle>
            <CardDescription>Recursos disponíveis com a integração Bling V3</CardDescription>
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
