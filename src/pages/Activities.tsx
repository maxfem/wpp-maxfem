import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Activity,
  MessageSquare,
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  MousePointerClick,
  TrendingUp,
  User,
  Search,
  XCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Instagram,
  Megaphone,
  RefreshCw,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { localeSP } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ActivityRow = {
  id: string;
  source: "whatsapp" | "instagram" | "email" | "campaign";
  direction?: "inbound" | "outbound";
  type: string;
  status: string;
  customer_label: string;
  customer_sub?: string;
  campaign_name?: string;
  content_preview?: string;
  error?: string;
  created_at: string;
};

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  sent: { label: "Enviado", icon: Clock, color: "bg-blue-100 text-blue-700 border-blue-200" },
  delivered: { label: "Entregue", icon: CheckCircle2, color: "bg-green-100 text-green-700 border-green-200" },
  read: { label: "Lido", icon: Eye, color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  received: { label: "Recebido", icon: ArrowDownLeft, color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  clicked: { label: "Clicado", icon: MousePointerClick, color: "bg-amber-100 text-amber-700 border-amber-200" },
  converted: { label: "Convertido", icon: TrendingUp, color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  failed: { label: "Falhou", icon: AlertCircle, color: "bg-red-100 text-red-700 border-red-200" },
  bounce: { label: "Bounce", icon: AlertCircle, color: "bg-red-100 text-red-700 border-red-200" },
  complaint: { label: "Reclamação", icon: AlertCircle, color: "bg-orange-100 text-orange-700 border-orange-200" },
  open: { label: "Aberto", icon: Eye, color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  click: { label: "Clicado", icon: MousePointerClick, color: "bg-amber-100 text-amber-700 border-amber-200" },
  rendering_failure: { label: "Erro render", icon: AlertCircle, color: "bg-red-100 text-red-700 border-red-200" },
};

function statusFromEvent(eventType: string | null | undefined): string {
  if (!eventType) return "sent";
  const lower = String(eventType).toLowerCase();
  if (statusConfig[lower]) return lower;
  return lower;
}

export default function Activities() {
  const { currentTenant } = useAuth();
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState<string>("");

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery<ActivityRow[]>({
    queryKey: ["activities-unified", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];

      const tid = currentTenant.id;

      const [waRes, igRes, emailRes, campaignRes] = await Promise.allSettled([
        // WhatsApp messages
        supabase
          .from("whatsapp_messages")
          .select("id, direction, content, message_type, status, phone, created_at, customer_id")
          .eq("tenant_id", tid)
          .order("created_at", { ascending: false })
          .limit(200),
        // Instagram messages
        supabase
          .from("instagram_messages")
          .select("id, direction, content, message_type, status, ig_user_id, username, created_at, customer_id")
          .eq("tenant_id", tid)
          .order("created_at", { ascending: false })
          .limit(200),
        // Email events (SES) — tenant pode ser null em eventos antigos, então usamos fallback de tags
        supabase
          .from("email_events")
          .select("id, event_type, recipient, source_email, timestamp, tenant_id")
          .or(`tenant_id.eq.${tid},tenant_id.is.null`)
          .order("timestamp", { ascending: false })
          .limit(200),
        // Campaign activities
        supabase
          .from("campaign_activities")
          .select("id, channel, status, error_message, sent_at, created_at, customers(name, phone, email), campaigns(name)")
          .eq("tenant_id", tid)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const all: ActivityRow[] = [];

      if (waRes.status === "fulfilled" && waRes.value.data) {
        for (const m of waRes.value.data as any[]) {
          all.push({
            id: `wa_${m.id}`,
            source: "whatsapp",
            direction: m.direction,
            type: m.message_type || "text",
            status: m.status || (m.direction === "inbound" ? "received" : "sent"),
            customer_label: m.phone || "—",
            customer_sub: m.message_type ? `WhatsApp · ${m.message_type}` : "WhatsApp",
            content_preview: m.content?.slice(0, 100) || null,
            created_at: m.created_at,
          });
        }
      }

      if (igRes.status === "fulfilled" && igRes.value.data) {
        for (const m of igRes.value.data as any[]) {
          all.push({
            id: `ig_${m.id}`,
            source: "instagram",
            direction: m.direction,
            type: m.message_type || "text",
            status: m.status || (m.direction === "inbound" ? "received" : "sent"),
            customer_label: m.username ? `@${m.username}` : m.ig_user_id || "—",
            customer_sub: m.message_type ? `Instagram · ${m.message_type}` : "Instagram",
            content_preview: m.content?.slice(0, 100) || null,
            created_at: m.created_at,
          });
        }
      }

      if (emailRes.status === "fulfilled" && emailRes.value.data) {
        for (const e of emailRes.value.data as any[]) {
          all.push({
            id: `em_${e.id}`,
            source: "email",
            direction: "outbound",
            type: e.event_type || "email",
            status: statusFromEvent(e.event_type),
            customer_label: e.recipient || "—",
            customer_sub: `de ${e.source_email || "—"}`,
            content_preview: null,
            created_at: e.timestamp || e.created_at,
          });
        }
      }

      if (campaignRes.status === "fulfilled" && campaignRes.value.data) {
        for (const a of campaignRes.value.data as any[]) {
          all.push({
            id: `cp_${a.id}`,
            source: "campaign",
            direction: "outbound",
            type: a.channel || "campaign",
            status: a.status || "sent",
            customer_label: a.customers?.name || a.customers?.phone || a.customers?.email || "Cliente",
            customer_sub: a.campaigns?.name || "Campanha",
            campaign_name: a.campaigns?.name,
            error: a.error_message,
            created_at: a.sent_at || a.created_at,
          });
        }
      }

      // Ordena por created_at desc
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return all;
    },
    enabled: !!currentTenant,
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const filteredRows = useMemo(() => {
    let list = rows;
    if (sourceFilter !== "all") list = list.filter((r) => r.source === sourceFilter);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (searchFilter.trim()) {
      const lower = searchFilter.toLowerCase();
      list = list.filter(
        (r) =>
          r.customer_label.toLowerCase().includes(lower) ||
          (r.customer_sub || "").toLowerCase().includes(lower) ||
          (r.content_preview || "").toLowerCase().includes(lower) ||
          (r.campaign_name || "").toLowerCase().includes(lower),
      );
    }
    return list;
  }, [rows, sourceFilter, statusFilter, searchFilter]);

  const counts = useMemo(() => {
    const c = { all: rows.length, whatsapp: 0, instagram: 0, email: 0, campaign: 0 };
    for (const r of rows) c[r.source]++;
    return c;
  }, [rows]);

  const clearFilters = () => {
    setSourceFilter("all");
    setStatusFilter("all");
    setSearchFilter("");
  };

  const sourceBadge = (s: ActivityRow["source"]) => {
    if (s === "whatsapp")
      return (
        <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 gap-1">
          <MessageSquare className="h-3 w-3" /> WhatsApp
        </Badge>
      );
    if (s === "instagram")
      return (
        <Badge variant="outline" className="text-pink-700 bg-pink-50 border-pink-200 gap-1">
          <Instagram className="h-3 w-3" /> Instagram
        </Badge>
      );
    if (s === "email")
      return (
        <Badge variant="outline" className="text-blue-700 bg-blue-50 border-blue-200 gap-1">
          <Mail className="h-3 w-3" /> E-mail
        </Badge>
      );
    return (
      <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 gap-1">
        <Megaphone className="h-3 w-3" /> Campanha
      </Badge>
    );
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Atividades</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Timeline em tempo real de todas as interações WhatsApp, Instagram, E-mail e campanhas
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Quick stats por canal */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { key: "all", label: "Total", count: counts.all, icon: Activity, color: "text-foreground" },
            { key: "whatsapp", label: "WhatsApp", count: counts.whatsapp, icon: MessageSquare, color: "text-emerald-700" },
            { key: "instagram", label: "Instagram", count: counts.instagram, icon: Instagram, color: "text-pink-700" },
            { key: "email", label: "E-mail", count: counts.email, icon: Mail, color: "text-blue-700" },
            { key: "campaign", label: "Campanhas", count: counts.campaign, icon: Megaphone, color: "text-amber-700" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setSourceFilter(s.key)}
              className={`text-left p-3 rounded-lg border transition ${
                sourceFilter === s.key
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-muted-foreground/30"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <s.icon className={`h-4 w-4 ${s.color}`} />
                <span className="text-2xl font-bold">{s.count}</span>
              </div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-end bg-card p-4 rounded-lg border">
          <div className="space-y-1.5 flex-1 min-w-[240px]">
            <label className="text-xs font-medium text-muted-foreground ml-1">
              Buscar (cliente, conteúdo, campanha)
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ex: anderson, Imunofem, +5521..."
                className="pl-9"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5 w-[180px]">
            <label className="text-xs font-medium text-muted-foreground ml-1">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(statusConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <config.icon className="h-4 w-4" />
                      {config.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(sourceFilter !== "all" || statusFilter !== "all" || searchFilter) && (
            <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground hover:text-foreground">
              <XCircle className="mr-2 h-4 w-4" />
              Limpar filtros
            </Button>
          )}
        </div>

        {/* Timeline */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="text-sm text-muted-foreground mt-4">Carregando atividades...</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="p-12 text-center">
                <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-foreground mb-1">Sem atividades</p>
                <p className="text-sm text-muted-foreground">
                  {rows.length > 0 ? "Nenhum item bate com os filtros." : "Mensagens, e-mails e campanhas aparecerão aqui."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Cliente / Destinatário</TableHead>
                    <TableHead>Conteúdo</TableHead>
                    <TableHead className="w-[140px]">Canal</TableHead>
                    <TableHead className="w-[120px]">Direção</TableHead>
                    <TableHead className="w-[140px]">Status</TableHead>
                    <TableHead className="w-[170px]">Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.slice(0, 300).map((r) => {
                    const status = statusConfig[r.status] || {
                      label: r.status,
                      icon: Clock,
                      color: "bg-muted text-foreground border-border",
                    };
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                              <User className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-medium truncate">{r.customer_label}</span>
                              {r.customer_sub && (
                                <span className="text-xs text-muted-foreground truncate">
                                  {r.customer_sub}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            {r.content_preview && (
                              <span className="text-sm text-foreground truncate max-w-[360px]" title={r.content_preview}>
                                {r.content_preview}
                              </span>
                            )}
                            {r.campaign_name && (
                              <span className="text-xs text-muted-foreground">
                                Campanha: {r.campaign_name}
                              </span>
                            )}
                            {r.error && (
                              <span className="text-xs text-destructive truncate max-w-[300px]" title={r.error}>
                                {r.error}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{sourceBadge(r.source)}</TableCell>
                        <TableCell>
                          {r.direction === "inbound" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                              <ArrowDownLeft className="h-3 w-3" /> Recebido
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-700">
                              <ArrowUpRight className="h-3 w-3" /> Enviado
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={`gap-1 border ${status.color}`} variant="outline">
                            <status.icon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {localeSP(r.created_at)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
