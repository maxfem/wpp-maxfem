import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import {
  Plug,
  MessageCircle,
  Headphones,
  Tags,
  UsersRound,
  SlidersHorizontal,
  Map,
  Key,
  Webhook,
} from "lucide-react";

const sections = [
  { title: "Integrações", desc: "Conectores com e-commerces, ERPs e canais", icon: Plug, path: null },
  { title: "WhatsApp", desc: "Números e modelos de mensagem HSM", icon: MessageCircle, path: "/settings/whatsapp" },
  { title: "WhatsApp", desc: "Números e modelos de mensagem HSM", icon: MessageCircle },
  { title: "Atendimento", desc: "Configurações do inbox de suporte", icon: Headphones, path: null },
  { title: "Tags de Clientes", desc: "Tags para segmentação de clientes", icon: Tags, path: null },
  { title: "Colaboradores", desc: "Gerenciar equipe e permissões", icon: UsersRound, path: null },
  { title: "Atributos Customizados", desc: "Campos extras no perfil do cliente", icon: SlidersHorizontal, path: null },
  { title: "Mapeamento de Status", desc: "Mapear status de pedidos da plataforma", icon: Map, path: null },
  { title: "Chaves de Acesso", desc: "API Keys para integração externa", icon: Key, path: null },
  { title: "Webhooks", desc: "Endpoints para notificações push", icon: Webhook, path: null },
];

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie integrações e preferências da loja
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sections.map((s) => (
            <Card
              key={s.title}
              className="border border-border hover:border-primary/30 transition-colors cursor-pointer"
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                    <s.icon className="h-4 w-4 text-secondary-foreground" />
                  </div>
                  <CardTitle className="text-sm">{s.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs">{s.desc}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
