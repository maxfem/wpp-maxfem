import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type Props = {
  onAdded: () => void;
};

export function AddWhatsAppDialog({ onAdded }: Props) {
  const { currentTenant } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [verifiedName, setVerifiedName] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setLabel("");
    setPhoneNumberId("");
    setWabaId("");
    setAccessToken("");
    setDisplayPhone("");
    setVerifiedName("");
    setNotes("");
  };

  const handleSave = async () => {
    if (!currentTenant?.id) {
      toast.error("Sem tenant ativo");
      return;
    }
    if (!phoneNumberId.trim()) {
      toast.error("Phone Number ID é obrigatório");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("whatsapp_accounts").insert({
        tenant_id: currentTenant.id,
        phone_number_id: phoneNumberId.trim(),
        label: label.trim() || null,
        whatsapp_business_account_id: wabaId.trim() || null,
        access_token: accessToken.trim() || null,
        display_phone: displayPhone.trim() || null,
        verified_name: verifiedName.trim() || null,
        notes: notes.trim() || null,
        is_active: true,
      });

      if (error) throw error;

      toast.success("Número adicionado");
      reset();
      setOpen(false);
      onAdded();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Adicionar número
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar número WhatsApp</DialogTitle>
          <DialogDescription>
            Cadastre um Phone Number ID da Meta Cloud API. Apelido e demais
            campos são opcionais.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="wa-label">Apelido</Label>
            <Input
              id="wa-label"
              placeholder="Ex.: Atendimento principal"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wa-pnid">Phone Number ID *</Label>
            <Input
              id="wa-pnid"
              placeholder="Ex.: 123456789012345"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Encontre em Meta Business Suite → WhatsApp → Configurações da API.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wa-waba">WhatsApp Business Account ID</Label>
            <Input
              id="wa-waba"
              placeholder="WABA ID (opcional)"
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wa-token">Access Token</Label>
            <Input
              id="wa-token"
              type="password"
              placeholder="Token específico (deixe vazio pra usar o global)"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="wa-display">Telefone exibido</Label>
              <Input
                id="wa-display"
                placeholder="+55 11 9..."
                value={displayPhone}
                onChange={(e) => setDisplayPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-verified">Nome verificado</Label>
              <Input
                id="wa-verified"
                placeholder="Maxfem"
                value={verifiedName}
                onChange={(e) => setVerifiedName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wa-notes">Observações</Label>
            <Textarea
              id="wa-notes"
              placeholder="Notas internas (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
