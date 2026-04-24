import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Instagram, Plus, Trash2, ExternalLink, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CommentRulesPanel } from "@/components/instagram/CommentRulesPanel";

interface IgAccount {
  id: string;
  ig_user_id: string;
  username: string;
  page_name: string | null;
  profile_picture_url: string | null;
  followers_count: number | null;
  is_active: boolean;
  auto_reply_dms: boolean;
  auto_reply_comments: boolean;
  auto_reply_lives: boolean;
  token_expires_at: string | null;
  created_at: string;
}

interface StartDiagnostics {
  meta_app_id?: string;
  meta_app_id_length?: number;
  meta_app_id_is_numeric?: boolean;
  redirect_uri?: string;
  scopes?: string[];
  meta_app_id_preview?: string | null;
  meta_app_id_present?: boolean;
  meta_app_secret_present?: boolean;
  meta_app_secret_length?: number;
}

const EXPECTED_APP_ID = "877027558735996";

export default function SettingsInstagram() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tenantId = currentTenant?.id;
  const [connecting, setConnecting] = useState(false);
  const [diagnostics, setDiagnostics] = useState<StartDiagnostics | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (code && state && tenantId) {
      handleOAuthCallback(code, state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    const refreshAccounts = () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
    };

    window.addEventListener("focus", refreshAccounts);
    return () => window.removeEventListener("focus", refreshAccounts);
  }, [queryClient]);

  async function handleOAuthCallback(code: string, state: string) {
    setConnecting(true);
    try {
      const redirect_uri = `${window.location.origin}/settings/instagram`;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-register?action=callback`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ code, state, redirect_uri }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Falha ao conectar");

      toast.success(`${result.accounts_connected} conta(s) conectada(s)!`);
      if (result.pages_without_ig?.length > 0) {
        toast.warning(`${result.pages_without_ig.length} página(s) sem conta IG vinculada foram ignoradas`);
      }
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
      navigate("/settings/instagram", { replace: true });
    } catch (e: any) {
      toast.error("Erro ao conectar Instagram", { description: e.message });
    } finally {
      setConnecting(false);
    }
  }

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["instagram-accounts", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("instagram_accounts")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as IgAccount[];
    },
    enabled: !!tenantId,
  });

  const startConnect = async () => {
    if (!tenantId) return;
    setConnecting(true);
    setStartError(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-register?action=start`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          redirect_uri: `${window.location.origin}/settings/instagram`,
        }),
      });
      const data = await res.json();
      if (data?.diagnostics) setDiagnostics(data.diagnostics);
      if (!res.ok) {
        const msg = data.error || "Falha ao iniciar conexão";
        setStartError(msg);
        throw new Error(msg);
      }

      const isEmbeddedPreview = window.self !== window.top;
      if (isEmbeddedPreview) {
        const popup = window.open(data.oauth_url, "_blank", "noopener,noreferrer");
        if (!popup) {
          throw new Error("O navegador bloqueou a abertura da Meta em nova aba. Libere pop-ups e tente novamente.");
        }
        toast.success("Autorização aberta em nova aba");
        return;
      }

      window.location.href = data.oauth_url;
    } catch (e: any) {
      toast.error("Erro ao iniciar conexão", { description: e.message });
    } finally {
      setConnecting(false);
    }
  };

  const toggleMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: "auto_reply_dms" | "auto_reply_comments" | "auto_reply_lives" | "is_active"; value: boolean }) => {
      const update: Record<string, boolean> = { [field]: value };
      const { error } = await supabase
        .from("instagram_accounts")
        .update(update as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
    },
    onError: (e: any) => toast.error("Erro ao atualizar", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("instagram_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta desconectada");
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
    },
    onError: (e: any) => toast.error("Erro ao desconectar", { description: e.message }),
  });

  const daysUntilExpiry = (iso: string | null) => {
    if (!iso) return null;
    const days = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
    return days;
  };

  return (
    <AppLayout>
      <div className="container max-w-4xl py-8 space-y-6 animate-fade-in">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#FCB045] flex items-center justify-center">
              <Instagram className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Instagram</h1>
          </div>
          <p className="text-muted-foreground">
            Conecte contas do Instagram para responder DMs, comentários e Lives via Copilot.
          </p>
        </div>

        <Tabs defaultValue="accounts" className="w-full">
          <TabsList>
            <TabsTrigger value="accounts">Contas e auto-resposta</TabsTrigger>
            <TabsTrigger value="rules">Regras Comentário → Direct</TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="space-y-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Conectar conta</CardTitle>
            <CardDescription>
              Você será redirecionado para o Facebook para autorizar o acesso. Sua conta IG precisa ser{" "}
              <strong>Business ou Creator</strong> e estar vinculada a uma Página do Facebook.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={startConnect} disabled={connecting} className="gap-2">
              <Plus className="h-4 w-4" />
              {connecting ? "Conectando..." : "Conectar Instagram"}
            </Button>

            {(diagnostics || startError) && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-2">
                <div className="font-semibold text-sm flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Diagnóstico do backend
                </div>
                {startError && (
                  <div className="text-destructive font-medium">{startError}</div>
                )}
                {diagnostics && (
                  <div className="grid grid-cols-1 gap-1 font-mono">
                    <div>
                      App ID em runtime:{" "}
                      <span className={diagnostics.meta_app_id === EXPECTED_APP_ID ? "text-emerald-600" : "text-destructive"}>
                        {diagnostics.meta_app_id ?? diagnostics.meta_app_id_preview ?? "—"}
                      </span>
                    </div>
                    <div>
                      App ID esperado:{" "}
                      <span className="text-muted-foreground">{EXPECTED_APP_ID}</span>
                    </div>
                    <div>
                      Comprimento: {diagnostics.meta_app_id_length ?? "—"} ·{" "}
                      Numérico: {String(diagnostics.meta_app_id_is_numeric ?? "—")}
                    </div>
                    {diagnostics.meta_app_secret_length !== undefined && (
                      <div>App Secret length: {diagnostics.meta_app_secret_length}</div>
                    )}
                    {diagnostics.redirect_uri && (
                      <div className="break-all">redirect_uri: {diagnostics.redirect_uri}</div>
                    )}
                    {diagnostics.meta_app_id && diagnostics.meta_app_id !== EXPECTED_APP_ID && (
                      <div className="text-destructive mt-1">
                        ⚠️ App ID em runtime difere do esperado. Atualize a secret META_APP_ID.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <h2 className="text-xl font-semibold mb-4">Contas conectadas</h2>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : accounts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhuma conta conectada ainda.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {accounts.map((acc) => {
                const expDays = daysUntilExpiry(acc.token_expires_at);
                const tokenWarning = expDays !== null && expDays < 7;

                return (
                  <Card key={acc.id}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          {acc.profile_picture_url ? (
                            <img
                              src={acc.profile_picture_url}
                              alt={acc.username}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#FCB045] flex items-center justify-center">
                              <Instagram className="h-5 w-5 text-white" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold truncate">@{acc.username}</span>
                              {acc.is_active ? (
                                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                                  Ativa
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Inativa</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {acc.page_name && `Página: ${acc.page_name} · `}
                              {acc.followers_count != null && `${acc.followers_count.toLocaleString("pt-BR")} seguidores`}
                            </p>
                            {tokenWarning && (
                              <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                                <AlertCircle className="h-3 w-3" />
                                Token expira em {expDays} dia(s)
                              </div>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Desconectar @${acc.username}?`)) deleteMutation.mutate(acc.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>

                      <div className="mt-4 pt-4 border-t space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">Auto-resposta em DMs</p>
                            <p className="text-xs text-muted-foreground">Copilot responde automaticamente novas mensagens diretas</p>
                          </div>
                          <Switch
                            checked={acc.auto_reply_dms}
                            onCheckedChange={(v) =>
                              toggleMutation.mutate({ id: acc.id, field: "auto_reply_dms", value: v })
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">Auto-resposta em comentários</p>
                            <p className="text-xs text-muted-foreground">Responde comentários em posts e Reels</p>
                          </div>
                          <Switch
                            checked={acc.auto_reply_comments}
                            onCheckedChange={(v) =>
                              toggleMutation.mutate({ id: acc.id, field: "auto_reply_comments", value: v })
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">Auto-resposta em Lives</p>
                            <p className="text-xs text-muted-foreground">Responde comentários durante transmissões ao vivo (com filtros anti-spam)</p>
                          </div>
                          <Switch
                            checked={acc.auto_reply_lives}
                            onCheckedChange={(v) =>
                              toggleMutation.mutate({ id: acc.id, field: "auto_reply_lives", value: v })
                            }
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <Card className="bg-amber-500/5 border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Configuração obrigatória no Meta App
            </CardTitle>
            <CardDescription>
              Antes de conectar, você precisa cadastrar este URL como <strong>Valid OAuth Redirect URI</strong> no painel da Meta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="bg-background border rounded-md p-3 font-mono text-xs break-all select-all">
              {window.location.origin}/settings/instagram
            </div>
            <div className="text-muted-foreground space-y-1">
              <p>📍 Caminho no Meta Dashboard:</p>
              <p className="pl-4">
                <strong>Meu App</strong> → <strong>Login do Facebook para empresas</strong> → <strong>Configurações</strong> → <strong>URIs de redirecionamento OAuth válidos</strong>
              </p>
            </div>
            <a
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Abrir painel Meta for Developers <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>

        <Card className="bg-muted/40">
          <CardHeader>
            <CardTitle className="text-base">Pré-requisitos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Sua conta IG deve ser <strong>Business ou Creator</strong>.</p>
            <p>2. A conta IG precisa estar <strong>vinculada a uma Página do Facebook</strong>.</p>
            <p>3. As permissões da Meta precisam estar aprovadas: <code className="text-xs">instagram_basic</code>, <code className="text-xs">instagram_manage_messages</code>, <code className="text-xs">instagram_manage_comments</code>.</p>
            <p>4. O produto <strong>Login do Facebook para empresas</strong> precisa estar adicionado ao app.</p>
            <a
              href="https://www.facebook.com/business/help/898752960195806"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Como vincular IG à Página <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="rules" className="mt-6">
            {tenantId && (
              <CommentRulesPanel
                tenantId={tenantId}
                accounts={accounts.map((a) => ({ id: a.id, username: a.username }))}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
