import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  customerId: string;
  customerName?: string;
  phone?: string;          // pra resolver conversation_id no backend (WA)
  igAccountId?: string;    // pra resolver conversation_id no IG
  igUserId?: string;
  channel: "whatsapp" | "instagram" | "email" | "manual";
  defaultDescription?: string;
}

const CATEGORY_OPTIONS = [
  { value: "reembolso", label: "Reembolso" },
  { value: "defeito", label: "Defeito de produto" },
  { value: "atraso_entrega", label: "Atraso de entrega" },
  { value: "duvida_produto", label: "Dúvida de produto" },
  { value: "outros", label: "Outros" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

export function CreateTicketDialog({
  open, onOpenChange, tenantId, customerId, customerName,
  phone, igAccountId, igUserId, channel, defaultDescription,
}: CreateTicketDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(defaultDescription || "");
  const [category, setCategory] = useState("outros");
  const [priority, setPriority] = useState("normal");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke("ticket-create", {
        body: {
          tenant_id: tenantId,
          customer_id: customerId,
          phone,
          ig_account_id: igAccountId,
          ig_user_id: igUserId,
          channel,
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
          opened_by: user?.id,
        },
      });
      if (error) throw error;
      if (data?.clickup_error) {
        toast({
          title: `Ticket ${data.ticket_number} criado, mas ClickUp falhou`,
          description: data.clickup_error,
          variant: "destructive",
        });
      } else {
        toast({
          title: `Ticket ${data.ticket_number} criado`,
          description: data.clickup_url ? "Task no ClickUp + e-mail + notificação enviados" : "Ticket criado",
        });
      }
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setCategory("outros");
      setPriority("normal");
    } catch (e: any) {
      toast({
        title: "Falha ao criar ticket",
        description: e?.message || String(e),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            Criar ticket
          </DialogTitle>
          <DialogDescription>
            Abre uma task em <strong>SAC → Gestão de Reclamações → Painel - Atendimento</strong> no ClickUp,
            envia e-mail pro cliente e notifica na conversa.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Cliente</Label>
            <div className="text-sm font-medium">{customerName || "—"}</div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticket-title" className="text-xs uppercase tracking-wider text-muted-foreground">Título *</Label>
            <Input id="ticket-title" placeholder="Ex: Produto chegou com defeito"
              value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} disabled={submitting}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Categoria</Label>
              <Select value={category} onValueChange={setCategory} disabled={submitting}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Prioridade</Label>
              <Select value={priority} onValueChange={setPriority} disabled={submitting}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticket-desc" className="text-xs uppercase tracking-wider text-muted-foreground">Descrição</Label>
            <Textarea id="ticket-desc" placeholder="Detalhes do caso, pedidos relacionados, etc."
              value={description} onChange={(e) => setDescription(e.target.value)}
              rows={5} disabled={submitting}/>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || !title.trim()}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin"/>Criando…</> : <>Criar ticket</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
