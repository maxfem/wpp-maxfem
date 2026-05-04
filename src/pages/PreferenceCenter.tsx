import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Shield, CheckCircle2 } from "lucide-react";

type Pref = { channel: "whatsapp" | "email"; category: string; opted_in: boolean };

const CATEGORIES = [
  { key: "marketing", label: "Promoções e ofertas" },
  { key: "news", label: "Novidades e novidades de produtos" },
  { key: "recovery", label: "Recuperação de carrinho" },
  { key: "transactional", label: "Transacionais (pedidos, rastreio)", locked: true },
];

export default function PreferenceCenter() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [tokenData, setTokenData] = useState<any>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [unsubAll, setUnsubAll] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const { data: tk } = await supabase.from("unsubscribe_tokens").select("*").eq("token", token).maybeSingle();
      if (!tk) { setLoading(false); return; }
      setTokenData(tk);
      const { data: existing } = await supabase.from("customer_preferences")
        .select("channel, category, opted_in").eq("customer_id", tk.customer_id);
      const map: Record<string, boolean> = {};
      ["whatsapp", "email"].forEach(ch => CATEGORIES.forEach(c => { map[`${ch}:${c.key}`] = true; }));
      (existing || []).forEach((p: Pref) => { map[`${p.channel}:${p.category}`] = p.opted_in; });
      setPrefs(map);
      setLoading(false);
    })();
  }, [token]);

  const save = async () => {
    if (!tokenData) return;
    const rows = Object.entries(prefs).map(([k, v]) => {
      const [channel, category] = k.split(":");
      return {
        tenant_id: tokenData.tenant_id, customer_id: tokenData.customer_id,
        channel, category, opted_in: unsubAll && category !== "transactional" ? false : v,
      };
    });
    await supabase.from("customer_preferences").upsert(rows, { onConflict: "tenant_id,customer_id,channel,category" });
    if (unsubAll) {
      if (tokenData.email) await supabase.from("contact_blocklist").upsert({
        tenant_id: tokenData.tenant_id, channel: "email", identifier: tokenData.email.toLowerCase(),
        reason: "opt_out", source: "preference_center", customer_id: tokenData.customer_id,
      }, { onConflict: "tenant_id,channel,identifier" });
      if (tokenData.phone) await supabase.from("contact_blocklist").upsert({
        tenant_id: tokenData.tenant_id, channel: "whatsapp", identifier: tokenData.phone,
        reason: "opt_out", source: "preference_center", customer_id: tokenData.customer_id,
      }, { onConflict: "tenant_id,channel,identifier" });
    }
    setSaved(true);
    toast({ title: "Preferências salvas" });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!tokenData) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Link inválido ou expirado</div>;

  return (
    <div className="min-h-screen bg-muted/30 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <Shield className="w-12 h-12 text-primary mx-auto mb-2" />
          <h1 className="text-3xl font-bold">Suas preferências</h1>
          <p className="text-muted-foreground">Escolha quais mensagens deseja receber</p>
        </div>

        {saved && (
          <Card className="border-green-500/50 bg-green-500/5">
            <CardContent className="pt-6 flex items-center gap-3">
              <CheckCircle2 className="text-green-500" />
              <div>Preferências atualizadas com sucesso</div>
            </CardContent>
          </Card>
        )}

        {(["whatsapp", "email"] as const).map(ch => (
          <Card key={ch}>
            <CardHeader>
              <CardTitle className="capitalize">{ch === "whatsapp" ? "WhatsApp" : "E-mail"}</CardTitle>
              <CardDescription>{ch === "whatsapp" ? tokenData.phone : tokenData.email}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {CATEGORIES.map(c => (
                <div key={c.key} className="flex items-center justify-between">
                  <Label className={c.locked ? "text-muted-foreground" : ""}>{c.label}</Label>
                  <Switch
                    disabled={c.locked || unsubAll}
                    checked={c.locked ? true : (prefs[`${ch}:${c.key}`] ?? true)}
                    onCheckedChange={v => setPrefs(p => ({ ...p, [`${ch}:${c.key}`]: v }))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        <Card className="border-destructive/50">
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <Label className="font-semibold">Descadastrar de tudo</Label>
              <p className="text-xs text-muted-foreground">Continuará recebendo apenas mensagens transacionais (pedidos)</p>
            </div>
            <Switch checked={unsubAll} onCheckedChange={setUnsubAll} />
          </CardContent>
        </Card>

        <Button onClick={save} className="w-full" size="lg">Salvar preferências</Button>
      </div>
    </div>
  );
}
