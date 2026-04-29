import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Eye, ShoppingCart, UserCheck, Users, TrendingUp, Package } from "lucide-react";
import { localeSP } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function PixelDashboard() {
  const { currentTenant } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["pixel-stats", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const since1 = new Date(Date.now() - 1 * 86400000).toISOString();

      const [v30, v7, v1, ident, prodViews, abandoned] = await Promise.all([
        supabase.from("pixel_visitors").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id).gte("last_seen_at", since30),
        supabase.from("pixel_visitors").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id).gte("last_seen_at", since7),
        supabase.from("pixel_visitors").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id).gte("last_seen_at", since1),
        supabase.from("pixel_visitors").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id).not("customer_id", "is", null).gte("last_seen_at", since30),
        supabase.from("pixel_events").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id).eq("event_type", "product_view").gte("created_at", since30),
        supabase.from("pixel_sessions").select("*", { count: "exact", head: true }).eq("tenant_id", currentTenant.id).eq("checkout_started", true).eq("purchased", false).gte("last_activity_at", since7),
      ]);

      return {
        unique_30d: v30.count ?? 0,
        unique_7d: v7.count ?? 0,
        unique_1d: v1.count ?? 0,
        identified: ident.count ?? 0,
        product_views: prodViews.count ?? 0,
        abandoned_carts: abandoned.count ?? 0,
      };
    },
    enabled: !!currentTenant,
    refetchInterval: 60_000,
  });

  const { data: topProducts } = useQuery({
    queryKey: ["pixel-top-products", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from("pixel_events")
        .select("product_id, product_name, product_image, product_price")
        .eq("tenant_id", currentTenant.id)
        .eq("event_type", "product_view")
        .gte("created_at", since)
        .not("product_id", "is", null)
        .limit(2000);
      const counts = new Map<string, { name: string; image?: string; price?: number; count: number }>();
      (data || []).forEach((r: any) => {
        const k = r.product_id;
        const ex = counts.get(k);
        if (ex) ex.count++;
        else counts.set(k, { name: r.product_name || k, image: r.product_image, price: r.product_price, count: 1 });
      });
      return Array.from(counts.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([id, v]) => ({ id, ...v }));
    },
    enabled: !!currentTenant,
  });

  const { data: recentEvents } = useQuery({
    queryKey: ["pixel-recent-events", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await supabase
        .from("pixel_events")
        .select("id, event_type, product_name, url, created_at, visitor_id, customer_id")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!currentTenant,
    refetchInterval: 30_000,
  });

  const identRate = stats && stats.unique_30d > 0 ? Math.round((stats.identified / stats.unique_30d) * 100) : 0;

  const kpis = [
    { label: "Visitantes (24h)", value: stats?.unique_1d ?? 0, icon: Users },
    { label: "Visitantes (7d)", value: stats?.unique_7d ?? 0, icon: Users },
    { label: "Visitantes (30d)", value: stats?.unique_30d ?? 0, icon: TrendingUp },
    { label: "Identificados", value: `${stats?.identified ?? 0} (${identRate}%)`, icon: UserCheck },
    { label: "Visualizações produto", value: stats?.product_views ?? 0, icon: Eye },
    { label: "Carrinhos abandonados (7d)", value: stats?.abandoned_carts ?? 0, icon: ShoppingCart },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pixel — Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visitantes do seu site, intenção de compra e abandono em tempo real</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <k.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold">{k.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" /> Produtos mais vistos (30d)</CardTitle>
            </CardHeader>
            <CardContent>
              {topProducts?.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma visualização ainda. Instale o pixel para começar.</p>
              ) : (
                <div className="space-y-2">
                  {topProducts?.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary/50">
                      {p.image && <img src={p.image} alt="" className="h-10 w-10 rounded object-cover" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{p.name}</div>
                        {p.price && <div className="text-xs text-muted-foreground">R$ {Number(p.price).toFixed(2)}</div>}
                      </div>
                      <Badge variant="secondary">{p.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Eventos recentes</CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Detalhe</TableHead>
                    <TableHead className="text-xs">Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentEvents?.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]">{e.event_type}</Badge>
                        {e.customer_id && <Badge className="ml-1 text-[10px] bg-green-600">id</Badge>}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[200px]">{e.product_name || e.url}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{localeSP(e.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
