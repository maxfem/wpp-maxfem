import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Send, Search, Users, List, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface BulkSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: {
    id: string;
    name: string;
    status: string;
    body: string;
    language: string;
  } | null;
}

export function BulkSendDialog({ open, onOpenChange, template }: BulkSendDialogProps) {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;

  const [tab, setTab] = useState<"customers" | "list">("customers");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sendResult, setSendResult] = useState<{
    total: number;
    sent: number;
    failed: number;
    errors: string[];
  } | null>(null);

  // Fetch customers
  const { data: customers = [] } = useQuery({
    queryKey: ["bulk-send-customers", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, email, tags")
        .eq("tenant_id", tenantId)
        .order("name");
      return data || [];
    },
    enabled: !!tenantId && open,
  });

  // Fetch contact lists
  const { data: contactLists = [] } = useQuery({
    queryKey: ["bulk-send-lists", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from("contact_lists")
        .select("id, name, customer_count")
        .eq("tenant_id", tenantId)
        .order("name");
      return data || [];
    },
    enabled: !!tenantId && open,
  });

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    const term = searchTerm.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone?.includes(term) ||
        c.email?.toLowerCase().includes(term)
    );
  }, [customers, searchTerm]);

  const customersWithPhone = useMemo(
    () => customers.filter((c) => c.phone?.trim()),
    [customers]
  );

  const selectedCount = tab === "list"
    ? contactLists.find((l) => l.id === selectedListId)?.customer_count || 0
    : selectedCustomerIds.size;

  const toggleCustomer = (id: string) => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedCustomerIds.size === filteredCustomers.filter((c) => c.phone).length) {
      setSelectedCustomerIds(new Set());
    } else {
      setSelectedCustomerIds(new Set(filteredCustomers.filter((c) => c.phone).map((c) => c.id)));
    }
  };

  const bulkSendMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId || !template) throw new Error("Dados incompletos");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      const payload: Record<string, unknown> = {
        tenant_id: tenantId,
        template_id: template.id,
      };

      if (tab === "list") {
        payload.list_id = selectedListId;
      } else {
        payload.customer_ids = Array.from(selectedCustomerIds);
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-send-bulk`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Erro ao enviar");
      }
      return result;
    },
    onSuccess: (result) => {
      setSendResult(result);
      if (result.failed === 0) {
        toast.success(`${result.sent} mensagem(ns) enviada(s) com sucesso!`);
      } else {
        toast.warning(`${result.sent} enviada(s), ${result.failed} falha(s)`);
      }
    },
    onError: (err: Error) => {
      toast.error("Erro no envio em massa: " + err.message);
    },
  });

  const handleClose = () => {
    setSelectedCustomerIds(new Set());
    setSelectedListId("");
    setSearchTerm("");
    setSendResult(null);
    onOpenChange(false);
  };

  const canSend =
    template?.status === "approved" &&
    ((tab === "customers" && selectedCustomerIds.size > 0) ||
      (tab === "list" && selectedListId));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Envio em massa
          </DialogTitle>
          <DialogDescription>
            Envie o template <span className="font-medium text-foreground">{template?.name}</span> para
            múltiplos contatos
          </DialogDescription>
        </DialogHeader>

        {/* Template status warning */}
        {template?.status !== "approved" && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive">
              Este template precisa ser aprovado pela Meta antes de poder ser enviado em massa.
            </p>
          </div>
        )}

        {/* Result view */}
        {sendResult ? (
          <div className="flex-1 space-y-4 py-4">
            <div className="text-center space-y-3">
              {sendResult.failed === 0 ? (
                <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
              ) : (
                <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
              )}
              <h3 className="text-lg font-semibold text-foreground">Envio concluído</h3>
              <div className="flex justify-center gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{sendResult.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{sendResult.sent}</p>
                  <p className="text-xs text-muted-foreground">Enviados</p>
                </div>
                {sendResult.failed > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-destructive">{sendResult.failed}</p>
                    <p className="text-xs text-muted-foreground">Falhas</p>
                  </div>
                )}
              </div>
              <Progress
                value={(sendResult.sent / sendResult.total) * 100}
                className="h-2 max-w-xs mx-auto"
              />
            </div>

            {sendResult.errors.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-destructive">Erros:</Label>
                <ScrollArea className="h-32 rounded border border-border p-2">
                  {sendResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1 mb-1">
                      <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                      {err}
                    </p>
                  ))}
                </ScrollArea>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleClose}>Fechar</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Selection tabs */}
            <Tabs value={tab} onValueChange={(v) => setTab(v as "customers" | "list")}>
              <TabsList className="w-full">
                <TabsTrigger value="customers" className="flex-1 gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Selecionar contatos
                </TabsTrigger>
                <TabsTrigger value="list" className="flex-1 gap-1.5">
                  <List className="h-3.5 w-3.5" />
                  Usar lista
                </TabsTrigger>
              </TabsList>

              <TabsContent value="customers" className="space-y-3 mt-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome, telefone ou email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 h-9 text-sm"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={toggleAll} className="text-xs shrink-0">
                    {selectedCustomerIds.size === filteredCustomers.filter((c) => c.phone).length
                      ? "Desmarcar todos"
                      : "Selecionar todos"}
                  </Button>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px]">
                    {selectedCustomerIds.size} selecionado(s)
                  </Badge>
                  <span>de {customersWithPhone.length} com telefone</span>
                </div>

                <ScrollArea className="h-[300px] rounded-lg border border-border">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-6 text-center">
                      <Users className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Nenhum contato encontrado</p>
                    </div>
                  ) : (
                    filteredCustomers.map((customer) => {
                      const hasPhone = !!customer.phone?.trim();
                      return (
                        <label
                          key={customer.id}
                          className={`flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer border-b border-border/50 last:border-0 ${
                            !hasPhone ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                        >
                          <Checkbox
                            checked={selectedCustomerIds.has(customer.id)}
                            onCheckedChange={() => toggleCustomer(customer.id)}
                            disabled={!hasPhone}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {customer.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {customer.phone || "Sem telefone"}
                              {customer.email && ` · ${customer.email}`}
                            </p>
                          </div>
                          {customer.tags && customer.tags.length > 0 && (
                            <div className="flex gap-1">
                              {(customer.tags as string[]).slice(0, 2).map((tag, i) => (
                                <Badge key={i} variant="outline" className="text-[9px] h-4">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </label>
                      );
                    })
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="list" className="space-y-3 mt-3">
                <Label className="text-sm">Selecione uma lista de contatos</Label>
                <Select value={selectedListId} onValueChange={setSelectedListId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha uma lista..." />
                  </SelectTrigger>
                  <SelectContent>
                    {contactLists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        <div className="flex items-center gap-2">
                          <span>{list.name}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {list.customer_count || 0} contatos
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {contactLists.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma lista disponível. Crie uma lista em Listas de Contatos.
                  </p>
                )}
              </TabsContent>
            </Tabs>

            <Separator />

            {/* Summary + Send */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {selectedCount > 0 ? (
                  <span>
                    <span className="font-medium text-foreground">{selectedCount}</span>{" "}
                    destinatário(s) selecionado(s)
                  </span>
                ) : (
                  <span>Nenhum destinatário selecionado</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => bulkSendMutation.mutate()}
                  disabled={!canSend || bulkSendMutation.isPending}
                >
                  {bulkSendMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar para {selectedCount}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
