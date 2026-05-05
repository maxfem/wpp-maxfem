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
import { Checkbox } from "@/components/ui/checkbox";
import { Key, Copy, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const SCOPES = [
  { id: "customers:read", label: "Read Customers" },
  { id: "customers:write", label: "Write Customers" },
  { id: "campaigns:read", label: "Read Campaigns" },
  { id: "campaigns:write", label: "Write Campaigns" },
  { id: "lists:read", label: "Read Lists" },
  { id: "lists:write", label: "Write Lists" },
  { id: "templates:read", label: "Read Templates" },
  { id: "templates:write", label: "Write Templates" },
  { id: "chat:read", label: "Read Chat" },
  { id: "chat:write", label: "Write Chat" },
];

export function CreateKeyDialog({ onKeyCreated }: { onKeyCreated: () => void }) {
  const { currentTenant } = useAuth();
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["customers:read", "campaigns:read"]);
  const [isCreating, setIsCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const handleCreate = async () => {
    if (!name || !currentTenant) return;
    setIsCreating(true);

    try {
      // Generate a random key
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      const keyString = "mcp_" + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Hash the key for storage
      const encoder = new TextEncoder();
      const data = encoder.encode(keyString);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const { error } = await supabase.from("mcp_api_keys").insert({
        tenant_id: currentTenant.id,
        name,
        key_hash: keyHash,
        key_prefix: keyString.substring(0, 12) + "...",
        scopes: selectedScopes,
      });

      if (error) throw error;

      setNewKey(keyString);
      toast.success("API Key created successfully");
      onKeyCreated();
    } catch (error: any) {
      console.error(error);
      toast.error("Error creating API key: " + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const copyToClipboard = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const reset = () => {
    setName("");
    setSelectedScopes(["customers:read", "campaigns:read"]);
    setNewKey(null);
    setCopied(false);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <Key className="mr-2 h-4 w-4" />
          Nova API Key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        {!newKey ? (
          <>
            <DialogHeader>
              <DialogTitle>Criar Nova API Key MCP</DialogTitle>
              <DialogDescription>
                Esta chave permitirá que LLMs externas (como Claude ou Cursor) acessem seu CRM.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome da Chave</Label>
                <Input
                  id="name"
                  placeholder="Ex: Claude Desktop"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Permissões (Scopes)</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {SCOPES.map((scope) => (
                    <div key={scope.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={scope.id}
                        checked={selectedScopes.includes(scope.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedScopes([...selectedScopes, scope.id]);
                          else setSelectedScopes(selectedScopes.filter(s => s !== scope.id));
                        }}
                      />
                      <label htmlFor={scope.id} className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {scope.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={!name || isCreating}>
                {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar Chave
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Chave Gerada com Sucesso!</DialogTitle>
              <DialogDescription className="text-destructive font-bold">
                IMPORTANTE: Copie sua chave agora. Por segurança, ela não será exibida novamente.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-sm break-all">
                {newKey}
                <Button size="icon" variant="ghost" className="shrink-0" onClick={copyToClipboard}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Concluir</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
