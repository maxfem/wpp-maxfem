import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Users, UserCheck, BarChart3, UserPlus } from "lucide-react";
import { toast } from "sonner";

const rfmSegments = [
  { name: "Campeões", color: "bg-success text-success-foreground" },
  { name: "Leais", color: "bg-primary text-primary-foreground" },
  { name: "Potenciais", color: "bg-info text-info-foreground" },
  { name: "Em Risco", color: "bg-warning text-warning-foreground" },
  { name: "Hibernando", color: "bg-destructive text-destructive-foreground" },
];

export default function Customers() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "" });
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data: customersData, isLoading } = useQuery({
    queryKey: ["customers", currentTenant?.id, page],
    queryFn: async () => {
      if (!currentTenant) return { rows: [], total: 0 };
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("customers")
        .select("*", { count: "exact" })
        .eq("tenant_id", currentTenant.id)
        .eq("is_lead", false)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: data || [], total: count || 0 };
    },
    enabled: !!currentTenant,
  });

  const customers = customersData?.rows || [];
  const totalCustomers = customersData?.total || 0;
  const totalPages = Math.ceil(totalCustomers / PAGE_SIZE);

  const { data: leads = [] } = useQuery({
    queryKey: ["leads", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .eq("is_lead", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["customer_groups", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("customer_groups")
        .select("*")
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const addCustomer = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("No tenant");
      const { error } = await supabase.from("customers").insert({
        tenant_id: currentTenant.id,
        name: newCustomer.name,
        email: newCustomer.email || null,
        phone: newCustomer.phone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setDialogOpen(false);
      setNewCustomer({ name: "", email: "", phone: "" });
      toast.success("Cliente adicionado!");
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search)
  );

  const formatCurrency = (v: number | null) =>
    v ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("pt-BR") : "—";

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {totalCustomers} clientes • {leads.length} leads
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Cliente</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addCustomer.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={addCustomer.isPending}>
                  {addCustomer.isPending ? "Salvando..." : "Adicionar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all" className="gap-2">
              <Users className="h-3.5 w-3.5" />
              Todos
            </TabsTrigger>
            <TabsTrigger value="groups" className="gap-2">
              <UserCheck className="h-3.5 w-3.5" />
              Grupos
            </TabsTrigger>
            <TabsTrigger value="rfm" className="gap-2">
              <BarChart3 className="h-3.5 w-3.5" />
              RFM
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-2">
              <UserPlus className="h-3.5 w-3.5" />
              Leads
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4 space-y-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar clientes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Card className="border border-border">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Ticket Médio</TableHead>
                      <TableHead>Última Compra</TableHead>
                      <TableHead>Tags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Carregando...
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Nenhum cliente encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((c) => (
                        <TableRow key={c.id} className="cursor-pointer hover:bg-accent/50">
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-muted-foreground">{c.email || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                          <TableCell className="text-right">{c.total_orders || 0}</TableCell>
                          <TableCell className="text-right">{formatCurrency(c.avg_ticket)}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(c.last_order_at)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {c.tags?.slice(0, 2).map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                  Página {page + 1} de {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="groups" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {groups.length === 0 ? (
                <Card className="col-span-full border border-border">
                  <CardContent className="p-8 text-center text-muted-foreground">
                    Nenhum grupo criado. Grupos permitem segmentar seus clientes por regras configuráveis.
                  </CardContent>
                </Card>
              ) : (
                groups.map((g) => (
                  <Card key={g.id} className="border border-border hover:border-primary/30 transition-colors cursor-pointer">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{g.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">{g.description || "Sem descrição"}</p>
                      <p className="text-lg font-bold mt-2">{g.customer_count || 0} clientes</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="rfm" className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {rfmSegments.map((seg) => (
                <Card key={seg.name} className="border border-border">
                  <CardContent className="p-4 text-center">
                    <Badge className={`${seg.color} mb-2`}>{seg.name}</Badge>
                    <p className="text-2xl font-bold">
                      {customers.filter((c) => c.rfm_segment === seg.name).length}
                    </p>
                    <p className="text-xs text-muted-foreground">clientes</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="leads" className="mt-4">
            <Card className="border border-border">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Captado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Nenhum lead encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      leads.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.name}</TableCell>
                          <TableCell className="text-muted-foreground">{l.email || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{l.phone || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(l.created_at)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
