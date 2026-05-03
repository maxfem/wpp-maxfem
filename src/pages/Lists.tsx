import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  Plus, Search, Upload, Users, MoreHorizontal, Trash2, Edit, UserPlus, ListFilter, FileSpreadsheet, Download, Sparkles, Webhook, Copy, Check, Loader2, AlertCircle
} from "lucide-react";
import { toast } from "sonner";

type BackgroundJob = {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  total: number;
  error_message: string | null;
};

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
  const navigate = useNavigate();
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
  const [copied, setCopied] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data: activeJobs = [], refetch: refetchJobs } = useQuery({
    queryKey: ["active_background_jobs", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await supabase
        .from("background_jobs")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .in("status", ["pending", "processing"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BackgroundJob[];
    },
    enabled: !!currentTenant,
    refetchInterval: (query) => {
      return query.state.data?.length ? 2000 : false;
    },
  });

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

  useEffect(() => {
    // Refresh lists when a job completes (activeJobs becomes empty or changes)
    if (activeJobs.length === 0) {
      queryClient.invalidateQueries({ queryKey: ["contact_lists"] });
    }
  }, [activeJobs.length, queryClient]);

  // Count-only query for total contacts (no data transfer)
  const { data: totalContacts = 0 } = useQuery({
    queryKey: ["customers_count", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return 0;
      const { count, error } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!currentTenant,
  });

  // Server-side search for add members dialog (lazy, only when open)
  const { data: searchedCustomers = [], isLoading: isSearchingCustomers } = useQuery({
    queryKey: ["customers_search", currentTenant?.id, customerSearch, addMembersOpen],
    queryFn: async () => {
      if (!currentTenant) return [];
      let query = supabase
        .from("customers")
        .select("id, name, email, phone")
        .eq("tenant_id", currentTenant.id)
        .order("name")
        .limit(100);
      if (customerSearch.trim()) {
        query = query.or(`name.ilike.%${customerSearch}%,email.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant && addMembersOpen,
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
    setImporting(true);
    try {
      const rows = await parseFileToRows(file);
      if (rows.length < 2) {
        toast.error("Arquivo vazio ou sem dados");
        return;
      }
      const headers = rows[0].map((h) => h.toLowerCase());
      
      // Map common headers to internal names
      const headerMap: Record<string, string> = {
        nome: "name", name: "name",
        email: "email", "e-mail": "email",
        telefone: "phone", phone: "phone", celular: "phone", whatsapp: "phone",
        cpf: "document", cnpj: "document", documento: "document", document: "document"
      };

      const mappedHeaders = headers.map(h => headerMap[h] || h);
      const nameIdx = mappedHeaders.indexOf("name");

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

      // Create background job
      const { data: job, error: jobErr } = await supabase
        .from("background_jobs")
        .insert({
          tenant_id: currentTenant.id,
          type: "contact_import",
          status: "pending",
          total: rows.length - 1,
          progress: 0,
          payload: {
            list_id: newListData.id,
            headers: mappedHeaders,
            rows: rows.slice(1)
          }
        })
        .select("id")
        .single();

      if (jobErr) { toast.error(jobErr.message); return; }

      // Trigger background processing (fire and forget)
      supabase.functions.invoke("background-import", {
        body: { job_id: job.id }
      });

      setCsvOpen(false);
      setCsvListName("");
      toast.success("Importação iniciada em segundo plano!");
      refetchJobs();
    } catch (error: any) {
      toast.error("Erro ao processar arquivo: " + error.message);
    } finally {
      setImporting(false);
    }
  };

  const filtered = lists.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCustomers = searchedCustomers.filter(
    (c) => !listMembers.some((m: any) => m.customer_id === c.id)
  );

  const typeLabels: Record<string, string> = {
    manual: "Manual",
    csv_import: "Importação CSV",
    dynamic: "Dinâmica",
    rfm: "RFM",
    webhook: "Webhook",
  };

  const isRfmList = (list: ContactList) => list.type === "rfm";

  if (selectedList) {
    const isRfm = isRfmList(selectedList);
    const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contact-list-webhook?list_id=${selectedList.id}`;
    
    const copyWebhookUrl = () => {
      navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      toast.success("URL do Webhook copiada!");
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <AppLayout>
        <div className="p-6 space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <button onClick={() => setSelectedList(null)} className="text-sm text-primary hover:underline mb-1">
                ← Voltar para listas
              </button>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">{selectedList.name}</h1>
                {isRfm && <Badge variant="secondary" className="text-xs">Auto RFM</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {listMembers.length} contatos • {typeLabels[selectedList.type] || selectedList.type}
                {isRfm && " • Atualizada automaticamente"}
              </p>
            </div>
            {!isRfm && (
              <Button onClick={() => { setAddMembersOpen(true); setSelectedCustomers([]); }}>
                <UserPlus className="h-4 w-4 mr-2" />
                Adicionar contatos
              </Button>
            )}
          </div>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Webhook className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Webhook de População Automática</p>
                  <p className="text-xs text-muted-foreground max-w-xl">
                    Use esta URL para adicionar contatos a esta lista automaticamente de outros sistemas. 
                    Envie um JSON POST com <code>email</code> ou <code>phone</code> e <code>name</code>.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-background border px-2 py-1 rounded text-xs truncate max-w-[200px] md:max-w-[400px] text-muted-foreground">
                  {webhookUrl}
                </code>
                <Button variant="outline" size="sm" className="shrink-0" onClick={copyWebhookUrl}>
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </CardContent>
          </Card>

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
                          {!isRfm && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMember.mutate(m.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
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
            <Button variant="outline" className="border-primary/50 hover:bg-primary/5" onClick={() => navigate("/listas")}>
              <Sparkles className="h-4 w-4 mr-2 text-primary" />
              Arquiteto CRM
            </Button>
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
                    <Label>Tipo</Label>
                    <Select
                      value={newList.type}
                      onValueChange={(val) => setNewList({ ...newList, type: val })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="webhook">Webhook (População Automática)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                <p className="text-2xl font-bold">{totalContacts.toLocaleString("pt-BR")}</p>
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

        {/* Progress for background jobs */}
        {activeJobs.length > 0 && (
          <div className="space-y-4">
            {activeJobs.map((job) => (
              <Card key={job.id} className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-sm font-medium">
                        Importando contatos...
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {job.progress} de {job.total} ({Math.round((job.progress / job.total) * 100)}%)
                    </span>
                  </div>
                  <Progress value={(job.progress / job.total) * 100} className="h-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

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
              <p className="text-lg font-bold mt-2">{totalContacts.toLocaleString("pt-BR")} contatos</p>
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
                        {!isRfmList(list) && (
                          <>
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
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">
                      {typeLabels[list.type] || list.type}
                    </Badge>
                    {isRfmList(list) && (
                      <Badge variant="secondary" className="text-xs">Auto</Badge>
                    )}
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
              <div className="space-y-2">
                <Label>Selecionar arquivo</Label>
                <div className="relative">
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    disabled={importing}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                    className={importing ? "opacity-50" : ""}
                  />
                  {importing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span className="text-xs">Processando...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Rename Dialog */}
        <Dialog open={!!renamingList} onOpenChange={(open) => { if (!open) setRenamingList(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Renomear lista</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Novo nome</Label>
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="Nome da lista"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && renameValue.trim() && renamingList) {
                      renameList.mutate({ id: renamingList.id, name: renameValue.trim() });
                    }
                  }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRenamingList(null)}>Cancelar</Button>
                <Button
                  disabled={!renameValue.trim() || renameList.isPending}
                  onClick={() => renamingList && renameList.mutate({ id: renamingList.id, name: renameValue.trim() })}
                >
                  Salvar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
