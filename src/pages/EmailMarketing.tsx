import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Send, History, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const EmailMarketing = () => {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const { currentTenant } = useAuth();

  const { data: awsIntegration } = useQuery({
    queryKey: ["email-marketing-aws", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await supabase
        .from("integrations")
        .select("is_active, config")
        .eq("tenant_id", currentTenant.id)
        .eq("provider", "aws")
        .maybeSingle();
      return data;
    },
    enabled: !!currentTenant,
  });

  const isAwsActive = !!awsIntegration?.is_active;

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to || !subject || !html) {
      toast.error("Por favor, preencha todos os campos.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email-ses", {
        body: { to, subject, html },
      });

      if (error || data?.error) throw new Error(error?.message || data?.error);

      toast.success("E-mail enviado com sucesso!");
      setTo("");
      setSubject("");
      setHtml("");
    } catch (error: any) {
      console.error("Erro ao enviar e-mail:", error);
      toast.error(`Falha ao enviar e-mail: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            <header className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">E-mail Marketing</h1>
                <p className="text-muted-foreground">Envie e-mails transacionais e de marketing via Amazon SES.</p>
              </div>
              <Mail className="h-8 w-8 text-primary" />
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Novo E-mail</CardTitle>
                  <CardDescription>Compose sua mensagem abaixo.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSendEmail} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="to">Destinatário</Label>
                      <Input 
                        id="to" 
                        placeholder="email@exemplo.com" 
                        value={to} 
                        onChange={(e) => setTo(e.target.value)} 
                        required 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subject">Assunto</Label>
                      <Input 
                        id="subject" 
                        placeholder="Assunto do e-mail" 
                        value={subject} 
                        onChange={(e) => setSubject(e.target.value)} 
                        required 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="content">Conteúdo (HTML)</Label>
                      <Textarea 
                        id="content" 
                        placeholder="<h1>Olá!</h1><p>Esta é uma mensagem de teste.</p>" 
                        className="min-h-[200px] font-mono"
                        value={html}
                        onChange={(e) => setHtml(e.target.value)}
                        required
                      />
                    </div>
                    {!isAwsActive && (
                      <p className="text-sm text-destructive">Configure e ative o Amazon SES antes de enviar e-mails.</p>
                    )}
                    <Button type="submit" className="w-full" disabled={loading || !isAwsActive}>
                      {loading ? "Enviando..." : (
                        <>
                          <Send className="mr-2 h-4 w-4" /> Enviar Agora
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center">
                      <SettingsIcon className="mr-2 h-4 w-4" /> Configuração SES
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p><strong>Status:</strong> <span className={isAwsActive ? "text-primary" : "text-destructive"}>{isAwsActive ? "Ativo" : "Inativo"}</span></p>
                    <p><strong>Remetente:</strong> {(awsIntegration?.config as any)?.sender_email || "—"}</p>
                    <p className="text-muted-foreground italic">As credenciais AWS são lidas com segurança pelos secrets do projeto.</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center">
                      <History className="mr-2 h-4 w-4" /> Histórico Recente
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum envio registrado hoje.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default EmailMarketing;
