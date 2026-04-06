import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Activity } from "lucide-react";

export default function Activities() {
  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Atividades</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Log de execuções de campanhas
          </p>
        </div>
        <Card className="border border-border">
          <CardContent className="p-12 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground mb-1">Sem atividades</p>
            <p className="text-sm text-muted-foreground">
              Atividades aparecerão aqui conforme campanhas forem executadas.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
