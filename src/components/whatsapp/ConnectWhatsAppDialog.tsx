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
import { Link2, Loader2, Eye, EyeOff, ExternalLink, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = {
  onConnected: () => void;
};

export function ConnectWhatsAppDialog({ onConnected }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");

  const reset = () => {
    setAccessToken("");
    setPhoneNumberId("");
    setWabaId("");
  };

  const handleConnect = async () => {
    if (!accessToken.trim() || !phoneNumberId.trim() || !wabaId.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-set-credentials`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
          },
          body: JSON.stringify({
            access_token: accessToken.trim(),
            phone_number_id: phoneNumberId.trim(),
            business_account_id: wabaId.trim(),
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const msg = data?.user_message || data?.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      toast.success(
        `Conectado: ${data.phone?.verified_name || data.phone?.display_phone_number || "número WhatsApp"}`,
        {
          description: `Quality: ${data.phone?.quality_rating || "-"} · Status: ${data.phone?.status || "-"}`,
          duration: 6000,
        },
      );
      reset();
      setOpen(false);
      onConnected();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao conectar";
      toast.error(msg, { duration: 10000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Link2 className="h-4 w-4" />
          Conectar Meta Cloud API
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp Cloud API</DialogTitle>
          <DialogDescription>
            Cole o token de acesso e os IDs do app do Meta. O sistema valida via Graph API e salva nos secrets do Supabase automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1.5">
            <p className="font-medium text-foreground inline-flex items-center gap-1">
              Onde pegar
              <a
                href="https://developers.facebook.com/apps"
                target="_blank"
                rel="noreferrer"
                className="underline inline-flex items-center gap-0.5"
              >
                developers.facebook.com <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <p className="text-muted-foreground">
              App → WhatsApp → <strong>Configuração da API</strong> → "Gerar token de acesso", depois copia <strong>Phone Number ID</strong> e <strong>WABA ID</strong> que aparecem abaixo.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wa-conn-token">Token de acesso</Label>
            <div className="relative">
              <Input
                id="wa-conn-token"
                type={showToken ? "text" : "password"}
                placeholder="EAA..."
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="font-mono text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wa-conn-phone">Phone Number ID</Label>
            <Input
              id="wa-conn-phone"
              placeholder="1081961268341192"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wa-conn-waba">WhatsApp Business Account ID (WABA)</Label>
            <Input
              id="wa-conn-waba"
              placeholder="757428720694260"
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 border border-blue-200 dark:border-blue-900">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <p>
              O token é validado contra o phone_number_id antes de salvar. Se não tiver permissão sobre essa WABA, retorna erro detalhado.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConnect} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            Conectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
