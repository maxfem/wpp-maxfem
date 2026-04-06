import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

export default function Chat() {
  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Atendimento</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inbox centralizado de mensagens
          </p>
        </div>
        <Card className="border border-border">
          <CardContent className="p-12 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium text-foreground mb-1">Chat em breve</p>
            <p className="text-sm text-muted-foreground">
              O módulo de atendimento via WhatsApp será ativado após configurar a integração.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
