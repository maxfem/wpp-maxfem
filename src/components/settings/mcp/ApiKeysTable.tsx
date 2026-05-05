import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatSP } from "@/lib/utils";

export function ApiKeysTable({ keys, onRefresh }: { keys: any[], onRefresh: () => void }) {
  const revokeKey = async (id: string) => {
    if (!confirm("Tem certeza que deseja revogar esta chave? O acesso será interrompido imediatamente.")) return;

    const { error } = await supabase
      .from("mcp_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao revogar chave");
    } else {
      toast.success("Chave revogada");
      onRefresh();
    }
  };

  if (keys.length === 0) {
    return (
      <div className="text-center py-8 border rounded-lg bg-muted/20">
        <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground">Nenhuma API Key configurada.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Prefixo</TableHead>
            <TableHead>Permissões</TableHead>
            <TableHead>Criada em</TableHead>
            <TableHead>Último Uso</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((key) => (
            <TableRow key={key.id}>
              <TableCell className="font-medium">{key.name}</TableCell>
              <TableCell className="font-mono text-xs">{key.key_prefix}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {(key.scopes || []).slice(0, 3).map((s: string) => (
                    <Badge key={s} variant="secondary" className="text-[10px] py-0">
                      {s}
                    </Badge>
                  ))}
                  {key.scopes?.length > 3 && (
                    <Badge variant="outline" className="text-[10px] py-0">
                      +{key.scopes.length - 3}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs">{formatSP(new Date(key.created_at))}</TableCell>
              <TableCell className="text-xs">
                {key.last_used_at ? formatSP(new Date(key.last_used_at)) : "-"}
              </TableCell>
              <TableCell>
                {key.revoked_at ? (
                  <Badge variant="destructive">Revogada</Badge>
                ) : key.expires_at && new Date(key.expires_at) < new Date() ? (
                  <Badge variant="outline">Expirada</Badge>
                ) : (
                  <Badge variant="outline" className="text-green-500 border-green-500">Ativa</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-destructive"
                  disabled={!!key.revoked_at}
                  onClick={() => revokeKey(key.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
