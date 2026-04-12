import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Search, Upload, Users, MoreHorizontal, Trash2, Edit, UserPlus, ListFilter, FileSpreadsheet, Download,
} from "lucide-react";
import { toast } from "sonner";

type ContactList = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  type: string;
  filter_rules: any;
  customer_count: number | null;
  created_at: string;
  updated_at: string;
};

export default function Lists() {
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvListName, setCsvListName] = useState("");
  const [selectedList, setSelectedList] = useState<ContactList | null>(null);
  const [newList, setNewList] = useState({ name: "", description: "", type: "manual" });
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [renamingList, setRenamingList] = useState<ContactList | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ["contact_lists", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("contact_lists")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ContactList[];
    },
    enabled: !!currentTenant,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["all_customers", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, phone")
        .eq("tenant_id", currentTenant.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const { data: listMembers = [] } = useQuery({
    queryKey: ["list_members", selectedList?.id],
    queryFn: async () => {
      if (!selectedList) return [];
      const { data, error } = await supabase
        .from("contact_list_members")
        .select("*, customers:customer_id(id, name, email, phone)")
        .eq("list_id", selectedList.id);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!selectedList,
  });

  const createList = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("No tenant");
      const { error } = await supabase.from("contact_lists").insert({
        tenant_id: currentTenant.id,
        name: newList.name,
        description: newList.description || null,
        type: newList.type,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_lists"] });
      setCreateOpen(false);
      setNewList({ name: "", description: "", type: "manual" });
      toast.success("Lista criada!");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteList = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_lists"] });
      if (selectedList) setSelectedList(null);
      toast.success("Lista excluída!");
    },
    onError: (e) => toast.error(e.message),
  });

  const addMembers = useMutation({
    mutationFn: async () => {
      if (!selectedList) return;
      const rows = selectedCustomers.map((cid) => ({
        list_id: selectedList.id,
        customer_id: cid,
      }));
      const { error } = await supabase.from("contact_list_members").insert(rows);
      if (error) throw error;
      // update count
      await supabase
        .from("contact_lists")
        .update({ customer_count: (selectedList.customer_count || 0) + selectedCustomers.length })
        .eq("id", selectedList.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_lists"] });
      queryClient.invalidateQueries({ queryKey: ["list_members"] });
      setAddMembersOpen(false);
      setSelectedCustomers([]);
      setCustomerSearch("");
      toast.success("Contatos adicionados!");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("contact_list_members").delete().eq("id", memberId);
      if (error) throw error;
      if (selectedList) {
        await supabase
          .from("contact_lists")
          .update({ customer_count: Math.max(0, (selectedList.customer_count || 0) - 1) })
          .eq("id", selectedList.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_lists"] });
      queryClient.invalidateQueries({ queryKey: ["list_members"] });
      toast.success("Contato removido!");
    },
  });

  const renameList = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("contact_lists").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_lists"] });
      setRenamingList(null);
      setRenameValue("");
      toast.success("Lista renomeada!");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDownloadTemplate = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["nome", "email", "telefone"],
      ["Maria Silva", "maria@email.com", "5511999999999"],
      ["João Santos", "joao@email.com", "5521988888888"],
    ]);
    ws["!cols"] = [{ wch: 25 }, { wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, "Contatos");
    XLSX.writeFile(wb, "modelo_importacao_contatos.xlsx");
  }, []);

  const parseFileToRows = async (file: File): Promise<string[][]> => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "xlsx" || ext === "xls") {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      return rows.map((r) => r.map((c) => String(c).trim()));
    }
    const text = await file.text();
    return text.split("\n").filter(Boolean).map((line) => line.split(",").map((c) => c.trim()));
  };

  const handleFileUpload = async (file: File) => {
    if (!currentTenant) return;
    const rows = await parseFileToRows(file);
    if (rows.length < 2) {
      toast.error("Arquivo vazio ou sem dados");
      return;
    }
    const headers = rows[0].map((h) => h.toLowerCase());
    const nameIdx = headers.findIndex((h) => h === "nome" || h === "name");
    const emailIdx = headers.findIndex((h) => h === "email" || h === "e-mail");
    const phoneIdx = headers.findIndex((h) => h === "telefone" || h === "phone" || h === "celular" || h === "whatsapp");

    if (nameIdx === -1) {
      toast.error("Coluna 'nome' não encontrada no arquivo");
      return;
    }

    const listName = csvListName.trim() || file.name.replace(/\.(csv|xlsx|xls)$/i, "");
    const { data: newListData, error: listError } = await supabase
      .from("contact_lists")
      .insert({ tenant_id: currentTenant.id, name: listName, type: "csv_import" })
      .select("id")
      .single();
    if (listError) { toast.error(listError.message); return; }

    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      const name = cols[nameIdx];
      if (!name) continue;

      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .insert({
          tenant_id: currentTenant.id,
          name,
          email: emailIdx >= 0 ? cols[emailIdx] || null : null,
          phone: phoneIdx >= 0 ? cols[phoneIdx] || null : null,
        })
        .select("id")
        .single();
      if (custErr) continue;

      await supabase.from("contact_list_members").insert({
        list_id: newListData.id,
        customer_id: cust.id,
      });
      count++;
    }

    await supabase
      .from("contact_lists")
      .update({ customer_count: count })
      .eq("id", newListData.id);

    queryClient.invalidateQueries({ queryKey: ["contact_lists"] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    setCsvOpen(false);
    setCsvListName("");
    toast.success(`${count} contatos importados!`);
  };

  const filtered = lists.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCustomers = customers.filter(
    (c) =>
      !listMembers.some((m: any) => m.customer_id === c.id) &&
      (c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.email?.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.phone?.includes(customerSearch))
  );

  const typeLabels: Record<string, string> = {
    manual: "Manual",
    csv_import: "Importação CSV",
    dynamic: "Dinâmica",
  };

  if (selectedList) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <button onClick={() => setSelectedList(null)} className="text-sm text-primary hover:underline mb-1">
                ← Voltar para listas
              </button>
              <h1 className="text-2xl font-bold text-foreground">{selectedList.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {listMembers.length} contatos • {typeLabels[selectedList.type] || selectedList.type}
              </p>
            </div>
            <Button onClick={() => { setAddMembersOpen(true); setSelectedCustomers([]); }}>
              <UserPlus className="h-4 w-4 mr-2" />
              Adicionar contatos
            </Button>
          </div>

          <Card className="border border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listMembers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhum contato nesta lista
                      </TableCell>
                    </TableRow>
                  ) : (
                    listMembers.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.customers?.name}</TableCell>
                        <TableCell className="text-muted-foreground">{m.customers?.email || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{m.customers?.phone || "—"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMember.mutate(m.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Add members dialog */}
          <Dialog open={addMembersOpen} onOpenChange={setAddMembersOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Adicionar contatos à lista</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar clientes..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
                  {filteredCustomers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente disponível</p>
                  ) : (
                    filteredCustomers.map((c) => (
                      <label key={c.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-accent cursor-pointer">
                        <Checkbox
                          checked={selectedCustomers.includes(c.id)}
                          onCheckedChange={(checked) => {
                            setSelectedCustomers((prev) =>
                              checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                            );
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{c.email || c.phone || ""}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                <Button
                  className="w-full"
                  disabled={selectedCustomers.length === 0 || addMembers.isPending}
                  onClick={() => addMembers.mutate()}
                >
                  {addMembers.isPending ? "Adicionando..." : `Adicionar ${selectedCustomers.length} contato(s)`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Listas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lists.length} listas de contatos
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCsvOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Importar CSV
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Lista
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Lista</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => { e.preventDefault(); createList.mutate(); }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label>Nome *</Label>
                    <Input
                      value={newList.name}
                      onChange={(e) => setNewList({ ...newList, name: e.target.value })}
                      placeholder="Ex: Clientes VIP"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Textarea
                      value={newList.description}
                      onChange={(e) => setNewList({ ...newList, description: e.target.value })}
                      placeholder="Descrição da lista..."
                      rows={2}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={createList.isPending}>
                    {createList.isPending ? "Criando..." : "Criar"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar listas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{customers.length}</p>
                <p className="text-xs text-muted-foreground">Total de contatos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ListFilter className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{lists.length}</p>
                <p className="text-xs text-muted-foreground">Listas criadas</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {lists.filter((l) => l.type === "csv_import").length}
                </p>
                <p className="text-xs text-muted-foreground">Importações CSV</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lists grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* "All contacts" virtual card */}
          <Card className="border border-border hover:border-primary/30 transition-colors cursor-pointer bg-primary/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Todos os contatos
                </CardTitle>
                <Badge variant="secondary" className="text-xs">Padrão</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Inclui todos os clientes cadastrados</p>
              <p className="text-lg font-bold mt-2">{customers.length} contatos</p>
            </CardContent>
          </Card>

          {isLoading ? (
            <Card className="col-span-full border border-border">
              <CardContent className="p-8 text-center text-muted-foreground">
                Carregando...
              </CardContent>
            </Card>
          ) : (
            filtered.map((list) => (
              <Card
                key={list.id}
                className="border border-border hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => setSelectedList(list)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{list.name}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedList(list); }}>
                          <Edit className="h-3.5 w-3.5 mr-2" />
                          Ver contatos
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRenamingList(list); setRenameValue(list.name); }}>
                          <Edit className="h-3.5 w-3.5 mr-2" />
                          Renomear
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => { e.stopPropagation(); deleteList.mutate(list.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">
                      {typeLabels[list.type] || list.type}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {list.description || "Sem descrição"}
                  </p>
                  <p className="text-lg font-bold mt-2">{list.customer_count || 0} contatos</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Import Dialog */}
        <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Importar Contatos</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da lista *</Label>
                <Input
                  value={csvListName}
                  onChange={(e) => setCsvListName(e.target.value)}
                  placeholder="Ex: Leads Black Friday"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                O arquivo deve conter as colunas: <strong>nome</strong> (obrigatório), email, telefone.
              </p>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Baixar modelo Excel
              </Button>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
