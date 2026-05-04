import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Brain, TrendingDown, TrendingUp, RefreshCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function PredictiveAnalytics() {
  const { currentTenant } = useAuth();
  const [isScoring, setIsScoring] = useState(false);

  const { data: scores = [], isLoading, refetch } = useQuery({
    queryKey: ["predictive_scores", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, churn_probability, predicted_clv, last_scoring_at")
        .eq("tenant_id", currentTenant.id)
        .order("churn_probability", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const runScoring = useMutation({
    mutationFn: async () => {
      setIsScoring(true);
      const { data, error } = await supabase.functions.invoke("predictive-analytics");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Scoring concluído com sucesso!");
      refetch();
    },
    onError: (e) => {
      toast.error("Erro ao processar scoring: " + e.message);
    },
    onSettled: () => setIsScoring(false)
  });

  const getChurnStatus = (prob: number) => {
    if (prob > 0.7) return { label: "Alto Risco", color: "bg-destructive text-destructive-foreground", icon: AlertTriangle };
    if (prob > 0.4) return { label: "Médio Risco", color: "bg-warning text-warning-foreground", icon: TrendingDown };
    return { label: "Seguro", color: "bg-success text-success-foreground", icon: TrendingUp };
  };

  const formatCurrency = (v: number | null) =>
    v ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ 0,00";

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              Inteligência Preditiva
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Análise de comportamento e previsões de Churn e CLV via IA
            </p>
          </div>
          <Button 
            onClick={() => runScoring.mutate()} 
            disabled={isScoring}
            variant="outline"
            className="gap-2"
          >
            <RefreshCcw className={`h-4 w-4 ${isScoring ? 'animate-spin' : ''}`} />
            {isScoring ? "Processando..." : "Recalcular Scores"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                Churn Rate Projetado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(scores.reduce((acc, curr) => acc + (curr.churn_probability || 0), 0) / (scores.length || 1) * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">Média de probabilidade de saída</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success" />
                CLV Potencial Médio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(scores.reduce((acc, curr) => acc + (Number(curr.predicted_clv) || 0), 0) / (scores.length || 1))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Valor vitalício previsto por cliente</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                Último Processamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {scores[0]?.last_scoring_at ? new Date(scores[0].last_scoring_at).toLocaleDateString("pt-BR") : "Nunca"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Baseado em histórico de pedidos e cliques</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Clientes em Risco de Churn</CardTitle>
            <CardDescription>Principais clientes que pararam de interagir ou comprar recentemente</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Prob. de Churn</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>CLV Projetado</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">Carregando previsões...</TableCell>
                  </TableRow>
                ) : scores.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">Sem dados suficientes para previsões.</TableCell>
                  </TableRow>
                ) : (
                  scores.map((s) => {
                    const status = getChurnStatus(s.churn_probability || 0);
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{s.email}</div>
                        </TableCell>
                        <TableCell className="w-[200px]">
                          <div className="flex items-center gap-2">
                            <Progress value={(s.churn_probability || 0) * 100} className="h-2" />
                            <span className="text-xs font-mono">{((s.churn_probability || 0) * 100).toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${status.color} gap-1`}>
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatCurrency(Number(s.predicted_clv))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">Engajar</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
