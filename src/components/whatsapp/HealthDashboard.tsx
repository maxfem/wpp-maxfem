import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Activity, AlertTriangle, CheckCircle2, Clock, Info, Loader2, RefreshCw, Send, XCircle, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useRef, useState } from "react";

type HealthData = {
  account: { active: boolean; display_phone: string; quality: string; tier: string; name_status: string; };
  token: { valid: boolean; error?: string; source: string; };
  webhooks: { healthy: boolean; };
  queue: { pending: number; oldest_pending_hours: number; };
  templates: { approved: number; draft: number; rejected: number; };
  errors: Array<{ error_message: string; created_at: string; customer_id: string; }>;
  recommendations: Array<{ code: string; level: "info" | "warning" | "error" | "critical"; message: string; action: string; }>;
};

export function WhatsAppHealthDashboard() {
  const { currentTenant } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStartedAt, setProcessStartedAt] = useState<Date | null>(null);
  const [initialPending, setInitialPending] = useState<number | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const stopTimerRef = useRef<number | null>(null);

  const { data: health, isLoading, refetch, isRefetching } = useQuery<HealthData>({
    queryKey: ["whatsapp-health", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-healthcheck", {
        body: { tenant_id: currentTenant?.id }
      });
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant?.id,
    refetchInterval: isProcessing ? 3000 : 60000,
  });

  // Live count of recently sent/failed during processing
  useEffect(() => {
    if (!isProcessing || !currentTenant?.id || !processStartedAt) return;
    let cancelled = false;
    const tick = async () => {
      const sinceIso = processStartedAt.toISOString();
      const [{ count: sent }, { count: failed }] = await Promise.all([
        supabase.from("campaign_activities")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("channel", "whatsapp")
          .eq("status", "sent")
          .gte("sent_at", sinceIso),
        supabase.from("campaign_activities")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", currentTenant.id)
          .eq("channel", "whatsapp")
          .eq("status", "failed")
          .gte("created_at", sinceIso),
      ]);
      if (!cancelled) {
        setSentCount(sent || 0);
        setFailedCount(failed || 0);
      }
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [isProcessing, currentTenant?.id, processStartedAt]);

  // Auto-stop processing view when queue drains or after 3 minutes idle
  useEffect(() => {
    if (!isProcessing) return;
    if (health?.queue.pending === 0) {
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = window.setTimeout(() => setIsProcessing(false), 5000);
    }
    return () => { if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current); };
  }, [isProcessing, health?.queue.pending]);

  const triggerProcessQueue = async () => {
    if (!currentTenant?.id) return;
    setProcessStartedAt(new Date());
    setInitialPending(health?.queue.pending ?? 0);
    setSentCount(0);
    setFailedCount(0);
    setIsProcessing(true);
    const { error } = await supabase.functions.invoke("automation-trigger-now", {
      body: { tenant_id: currentTenant.id }
    });
    if (error) {
      toast.error("Erro ao disparar fila");
      setIsProcessing(false);
    } else {
      toast.success("Processamento iniciado — acompanhe o progresso abaixo");
      setTimeout(() => refetch(), 1500);
    }
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader><div className="h-6 w-32 bg-muted rounded" /></CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-10 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!health) return null;

  const pending = health.queue.pending;
  const processed = initialPending !== null ? Math.max(0, initialPending - pending) : 0;
  const progressPct = initialPending && initialPending > 0
    ? Math.min(100, (processed / initialPending) * 100)
    : 0;
  const elapsedSec = processStartedAt ? Math.max(1, Math.floor((Date.now() - processStartedAt.getTime()) / 1000)) : 1;
  const ratePerMin = sentCount > 0 ? Math.round((sentCount / elapsedSec) * 60) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Diagnóstico de Integração
        </h2>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Live Send Progress */}
      {isProcessing && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Processando fila em tempo real
              {pending === 0 && (
                <Badge className="ml-2 bg-green-500/15 text-green-600 border-green-500/20">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Concluído
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {processed} de {initialPending ?? 0} processadas
                </span>
                <span className="font-mono font-medium">{progressPct.toFixed(0)}%</span>
              </div>
              <Progress value={progressPct} className="h-2" />
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border bg-background p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground mb-1">
                  <Clock className="h-3 w-3" /> Pendentes
                </div>
                <div className="text-xl font-bold tabular-nums">{pending}</div>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground mb-1">
                  <Send className="h-3 w-3" /> Enviadas
                </div>
                <div className="text-xl font-bold tabular-nums text-green-600">{sentCount}</div>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground mb-1">
                  <XCircle className="h-3 w-3" /> Falhas
                </div>
                <div className="text-xl font-bold tabular-nums text-red-500">{failedCount}</div>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground mb-1">
                  <Zap className="h-3 w-3" /> Taxa
                </div>
                <div className="text-xl font-bold tabular-nums">{ratePerMin}<span className="text-xs font-normal text-muted-foreground">/min</span></div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-muted-foreground">
                Iniciado há {elapsedSec}s · atualiza a cada 3s
              </span>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setIsProcessing(false)}>
                Ocultar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status da Conta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs">Meta Token</span>
                {health.token.valid
                  ? <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Válido</Badge>
                  : <Badge variant="destructive">Inválido</Badge>}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs">Qualidade</span>
                <Badge variant="outline" className={
                  health.account.quality === 'GREEN' ? 'text-green-500 border-green-500/20 bg-green-500/5' :
                  health.account.quality === 'YELLOW' ? 'text-yellow-500 border-yellow-500/20 bg-yellow-500/5' :
                  'text-red-500 border-red-500/20 bg-red-500/5'
                }>
                  {health.account.quality}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs">Tier/Limite</span>
                <span className="text-xs font-mono">{health.account.tier}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fila Pendente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold tabular-nums">{pending}</span>
                <span className="text-xs text-muted-foreground">mensagens</span>
              </div>
              <Progress value={Math.min(100, (pending / 500) * 100)} className="h-1.5" />
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                Mais antiga há {health.queue.oldest_pending_hours}h
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Templates HSM</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-1">
              <div className="flex flex-col items-center p-1 rounded bg-green-500/5 border border-green-500/10">
                <span className="text-sm font-bold text-green-500">{health.templates.approved}</span>
                <span className="text-[10px] text-muted-foreground uppercase">OK</span>
              </div>
              <div className="flex flex-col items-center p-1 rounded bg-yellow-500/5 border border-yellow-500/10">
                <span className="text-sm font-bold text-yellow-500">{health.templates.draft}</span>
                <span className="text-[10px] text-muted-foreground uppercase">Draft</span>
              </div>
              <div className="flex flex-col items-center p-1 rounded bg-red-500/5 border border-red-500/10">
                <span className="text-sm font-bold text-red-500">{health.templates.rejected}</span>
                <span className="text-[10px] text-muted-foreground uppercase">Err</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Manual trigger always available when there's a pending queue */}
      {pending > 0 && !isProcessing && (
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
          <div className="flex items-center gap-2 text-sm">
            <Send className="h-4 w-4 text-primary" />
            <span>{pending} mensagens aguardando envio</span>
          </div>
          <Button size="sm" onClick={triggerProcessQueue}>
            <Zap className="h-4 w-4 mr-2" />
            Processar agora
          </Button>
        </div>
      )}

      {health.recommendations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Ações Recomendadas
          </h3>
          <div className="grid gap-2">
            {health.recommendations.map((rec, i) => (
              <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${
                rec.level === 'critical' ? 'bg-red-500/5 border-red-500/20' :
                rec.level === 'error' ? 'bg-red-500/5 border-red-500/10' :
                'bg-yellow-500/5 border-yellow-500/10'
              }`}>
                <div className="flex items-center gap-3">
                  {rec.level === 'critical' ? <XCircle className="h-4 w-4 text-red-500" /> : <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                  <span className="text-sm">{rec.message}</span>
                </div>
                {rec.code === 'QUEUE_STUCK' ? (
                  <Button size="sm" variant="outline" onClick={triggerProcessQueue} disabled={isProcessing}>
                    {rec.action}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="text-xs h-8">{rec.action}</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {health.errors.length > 0 && (
        <Card className="border-red-500/10">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              Logs de Erro Recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {health.errors.map((err, i) => (
                <div key={i} className="px-4 py-2 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {format(new Date(err.created_at), "HH:mm:ss 'em' dd/MM", { locale: ptBR })}
                    </span>
                    <Badge variant="outline" className="text-[9px] h-4">WHATSAPP_API_ERROR</Badge>
                  </div>
                  <p className="text-xs text-foreground/80 line-clamp-1">{err.error_message}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
