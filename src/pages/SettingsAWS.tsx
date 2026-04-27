import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ShieldCheck, Mail, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";

export default function SettingsAWS() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [senderEmail, setSenderEmail] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [region, setRegion] = useState("sa-east-1");
  const [isValidating, setIsValidating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const { data: integration, isLoading } = useQuery({
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
      const config = integration.config as any;
      setSenderEmail(config.sender_email || "");
      setAccessKey(config.access_key || "");
      setSecretKey(config.secret_key || "");
      setRegion(config.region || "sa-east-1");
    }
  }, [integration]);

  const validateAndSaveMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) return;
      setIsValidating(true);
      
      try {
        // Validation via Edge Function
        const { data: validationData, error: validationError } = await supabase.functions.invoke("send-email-ses", {
          body: { 
            validate_only: true,
            accessKey,
            secretKey,
            region,
            fromEmail: senderEmail
          }
        });

        if (validationError || validationData?.error) {
          throw new Error(validationError?.message || validationData?.error || "Falha na validação das credenciais");
        }

        const config = {
          ...(integration?.config as object || {}),
          sender_email: senderEmail,
          access_key: accessKey,
          secret_key: secretKey,
          region: region,
          updated_at: new Date().toISOString()
        };

        if (integration) {
          const { error } = await supabase
            .from("integrations")
            .update({ 
              config,
              is_active: true 
            })
            .eq("id", integration.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("integrations")
            .insert({
              tenant_id: currentTenant.id,
              provider: "aws",
              config,
              is_active: true
            });
          if (error) throw error;
        }
      } finally {
        setIsValidating(false);
      }
    },
    onSuccess: () => {
      toast.success("Configuração AWS validada e salva com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["aws-integration"] });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (error: any) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    }
  });

  const isConnected = integration?.is_active;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings/integrations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold text-lg bg-[#FF9900]">
              A
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Amazon AWS</h1>
              <p className="text-sm text-muted-foreground">Gerencie sua infraestrutura AWS SES para envios de e-mail</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Configuração de Remetente</CardTitle>
                <CardDescription>Defina o e-mail que será utilizado para enviar suas campanhas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="accessKey">AWS Access Key ID</Label>
                    <Input 
                      id="accessKey" 
                      type="password"
                      placeholder="AKIA..."
                      value={accessKey}
                      onChange={(e) => setAccessKey(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secretKey">AWS Secret Access Key</Label>
                    <Input 
                      id="secretKey" 
                      type="password"
                      placeholder="Sua Secret Key"
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region">Região AWS</Label>
                    <Input 
                      id="region" 
                      placeholder="sa-east-1"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="senderEmail">E-mail do Remetente (Verificado no SES)</Label>
                    <Input 
                      id="senderEmail" 
                      placeholder="exemplo@suaempresa.com.br"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="pt-4 flex justify-end">
                  <Button 
                    onClick={() => validateAndSaveMutation.mutate()}
                    disabled={validateAndSaveMutation.isPending || isValidating}
                    className="w-full md:w-auto"
                  >
                    {isValidating ? (
                      "Validando..."
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Validar e Salvar Configurações
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  As credenciais serão validadas com a AWS antes de serem salvas.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Segurança das Credenciais</CardTitle>
                <CardDescription>Como suas chaves são gerenciadas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-secondary/30 rounded-lg">
                  <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Armazenamento Seguro</p>
                    <p className="text-xs text-muted-foreground">
                      Suas chaves AWS (Access Key e Secret Key) são armazenadas criptografadas no Lovable Secrets e nunca são expostas no navegador do usuário.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Status</CardTitle>
                  {isConnected ? (
                    <Badge className="bg-green-600 text-white">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Ativo
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Inativo</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">SES Bridge:</span>
                    <span className="font-medium text-green-500">Pronto</span>
                  </div>
                  <div className="pt-4 border-t border-border">
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Para desativar completamente, remova as credenciais dos Secrets do projeto.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recursos SES</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {["Alta entregabilidade", "Relatórios de Bounce", "E-mails Transacionais", "E-mails de Marketing"].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
