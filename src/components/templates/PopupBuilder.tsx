// Editor de pop-up: textarea HTML + preview lado a lado (desktop + mobile).
// Drag-and-drop (GrapesJS) removido a pedido — fluxo agora é HTML puro com pré-visualização ao vivo.

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Smartphone, Monitor, Settings, Power, PowerOff, Rocket, Copy, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface PopupBuilderProps {
  initialDesign?: any | null;
  initialHtml?: string;
  initialDesignMobile?: any | null;
  initialHtmlMobile?: string;
  initialSettings?: any;
  isActive?: boolean;
  onSave: (payload: {
    html?: string;
    design?: any;
    html_mobile?: string;
    design_mobile?: any;
    settings: any;
    is_active?: boolean;
  }) => void;
  onToggleActive?: (isActive: boolean) => void;
  isLoading?: boolean;
}

const DEFAULT_HTML = `<div style="background:#fff;border-radius:16px;padding:32px;max-width:420px;text-align:center;font-family:Inter,system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.15);">
  <h2 style="font-size:24px;font-weight:700;margin:0 0 12px;color:#111;">Seu título aqui</h2>
  <p style="font-size:15px;color:#555;margin:0 0 24px;line-height:1.5;">Coloque sua mensagem de impacto. Edite o HTML à esquerda e veja a preview ao vivo à direita.</p>
  <a href="#" style="display:inline-block;background:#D54B82;color:#fff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px;">Quero aproveitar</a>
</div>`;

export const PopupBuilder = ({
  initialDesign,
  initialHtml,
  initialDesignMobile,
  initialHtmlMobile,
  initialSettings,
  isActive = true,
  onSave,
  onToggleActive,
  isLoading,
}: PopupBuilderProps) => {
  const { currentTenant } = useAuth();
  const [activeTab, setActiveTab] = useState<"desktop" | "mobile">("desktop");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Mobile espelha desktop se vier vazio
  const initialDesktopHtml = (initialHtml && initialHtml.trim()) || DEFAULT_HTML;
  const initialMobileHtml = (initialHtmlMobile && initialHtmlMobile.length > 50)
    ? initialHtmlMobile
    : initialDesktopHtml;

  const [htmlDesktop, setHtmlDesktop] = useState(initialDesktopHtml);
  const [htmlMobile, setHtmlMobile] = useState(initialMobileHtml);

  const [settings, setSettings] = useState({
    delay: 2000,
    trigger: "timer",
    scrollPercentage: 50,
    position: "center",
    showCloseButton: true,
    overlayClose: true,
    ...(initialSettings || {}),
  });

  const updateSettings = (next: any) => {
    setSettings(next);
    setHasUnsavedChanges(true);
  };

  const onEditHtml = (value: string) => {
    if (activeTab === "desktop") setHtmlDesktop(value);
    else setHtmlMobile(value);
    setHasUnsavedChanges(true);
  };

  // Upload de qualquer imagem base64 inline pra Supabase Storage antes de salvar
  const dataUrlToBlob = (dataUrl: string): { blob: Blob; ext: string } | null => {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mime = match[1];
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ext = (mime.split("/")[1] || "png").split("+")[0];
    return { blob: new Blob([bytes], { type: mime }), ext };
  };

  const uploadBase64 = async (dataUrl: string): Promise<string | null> => {
    const parsed = dataUrlToBlob(dataUrl);
    if (!parsed || !currentTenant) return null;
    const path = `${currentTenant.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${parsed.ext}`;
    const { error } = await supabase.storage
      .from("popup-assets")
      .upload(path, parsed.blob, { contentType: parsed.blob.type, upsert: false });
    if (error) return null;
    const { data } = supabase.storage.from("popup-assets").getPublicUrl(path);
    return data.publicUrl;
  };

  const replaceBase64Images = async (html: string): Promise<string> => {
    const matches = Array.from(new Set(html.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g) || []));
    if (matches.length === 0) return html;
    let out = html;
    for (const dataUrl of matches) {
      const url = await uploadBase64(dataUrl);
      if (!url) continue;
      const escaped = dataUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(escaped, "g"), url);
    }
    return out;
  };

  const handleSave = async (publish = false) => {
    if (!htmlDesktop.trim()) {
      toast.error("HTML do desktop está vazio.");
      return;
    }
    let finalDesktop = htmlDesktop;
    let finalMobile = htmlMobile.trim() && htmlMobile.length > 50 ? htmlMobile : htmlDesktop;

    if (finalDesktop.includes("data:image/") || finalMobile.includes("data:image/")) {
      setIsUploading(true);
      try {
        if (finalDesktop.includes("data:image/")) finalDesktop = await replaceBase64Images(finalDesktop);
        if (finalMobile.includes("data:image/")) finalMobile = await replaceBase64Images(finalMobile);
      } finally {
        setIsUploading(false);
      }
    }

    onSave({
      html: finalDesktop,
      design: null,           // sem design GrapesJS — fluxo HTML puro
      html_mobile: finalMobile,
      design_mobile: null,
      settings,
      ...(publish ? { is_active: true } : {}),
    });
    setHasUnsavedChanges(false);
  };

  const handleCopyDesktopToMobile = () => {
    if (!htmlDesktop.trim()) {
      toast.error("Preencha o desktop primeiro.");
      return;
    }
    setHtmlMobile(htmlDesktop);
    setHasUnsavedChanges(true);
    toast.success("HTML do desktop copiado para mobile.");
  };

  const showPublishButton = !isActive;
  const currentHtml = activeTab === "desktop" ? htmlDesktop : htmlMobile;

  // Wrap o HTML do user num documento completo pro iframe renderizar limpo (com reset básico)
  const wrap = (html: string, isMobile = false) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; min-height: 100%; font-family: Inter, system-ui, sans-serif; background: #f8fafc; }
  body { display: flex; align-items: center; justify-content: center; padding: ${isMobile ? '12px' : '24px'}; }
</style></head><body>${html}</body></html>`;

  return (
    <div className="flex flex-col h-[800px] border rounded-md overflow-hidden bg-white shadow-xl">
      {/* TOPO */}
      <div className="flex items-center justify-between p-3 border-b border-slate-200 bg-white text-slate-900 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            type="button" size="sm"
            variant={activeTab === "desktop" ? "default" : "secondary"}
            onClick={() => setActiveTab("desktop")}
            className={activeTab === "desktop" ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}
          >
            <Monitor className="h-4 w-4 mr-1" /> Editando: Desktop
          </Button>
          <Button
            type="button" size="sm"
            variant={activeTab === "mobile" ? "default" : "secondary"}
            onClick={() => setActiveTab("mobile")}
            className={activeTab === "mobile" ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}
          >
            <Smartphone className="h-4 w-4 mr-1" /> Editando: Mobile
          </Button>
          {activeTab === "mobile" && (
            <Button type="button" size="sm" variant="secondary"
              onClick={handleCopyDesktopToMobile}
              className="bg-slate-100 text-slate-700 hover:bg-slate-200"
              title="Copia o HTML do desktop pro mobile">
              <Copy className="h-4 w-4 mr-1" /> Copiar do Desktop
            </Button>
          )}
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-600 font-medium ml-2">● Alterações não salvas</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary" size="sm" className="bg-slate-100 text-slate-700 hover:bg-slate-200">
                <Settings className="h-4 w-4 mr-1" /> Configurações
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Configurações do Pop-up</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 py-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold border-b pb-2">Gatilho de Exibição</h3>
                  <div className="space-y-2">
                    <Label>Quando mostrar?</Label>
                    <Select value={settings.trigger} onValueChange={(val) => updateSettings({ ...settings, trigger: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="timer">Tempo na página</SelectItem>
                        <SelectItem value="exit">Intenção de saída (Exit Intent)</SelectItem>
                        <SelectItem value="scroll">Ao rolar a página</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {settings.trigger === "timer" && (
                    <div className="space-y-2">
                      <Label>Aguardar quantos segundos?</Label>
                      <Input type="number" value={settings.delay / 1000} onChange={(e) => updateSettings({ ...settings, delay: Number(e.target.value) * 1000 })} />
                    </div>
                  )}
                  {settings.trigger === "scroll" && (
                    <div className="space-y-2">
                      <Label>Porcentagem de rolagem (%)</Label>
                      <Input type="number" value={settings.scrollPercentage} onChange={(e) => updateSettings({ ...settings, scrollPercentage: Number(e.target.value) })} />
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold border-b pb-2">Layout e Comportamento</h3>
                  <div className="space-y-2">
                    <Label>Posição</Label>
                    <Select value={settings.position} onValueChange={(val) => updateSettings({ ...settings, position: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="center">Centro da tela</SelectItem>
                        <SelectItem value="bottom-right">Canto inferior direito</SelectItem>
                        <SelectItem value="bottom-left">Canto inferior esquerdo</SelectItem>
                        <SelectItem value="top">Topo (Banner)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="close-btn">Botão de fechar (X)</Label>
                    <Switch id="close-btn" checked={settings.showCloseButton} onCheckedChange={(val) => updateSettings({ ...settings, showCloseButton: val })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="overlay-close">Fechar ao clicar fora</Label>
                    <Switch id="overlay-close" checked={settings.overlayClose} onCheckedChange={(val) => updateSettings({ ...settings, overlayClose: val })} />
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {onToggleActive && (
            <Button type="button" variant="secondary" size="sm"
              onClick={() => onToggleActive?.(!isActive)}
              disabled={isLoading}
              className={isActive
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"}>
              {isActive ? <Power className="h-4 w-4 mr-1" /> : <PowerOff className="h-4 w-4 mr-1" />}
              {isActive ? "Ativo" : "Inativo"}
            </Button>
          )}

          <Button type="button" variant="secondary" size="sm"
            onClick={() => handleSave(false)}
            disabled={isLoading || isUploading}
            className="bg-slate-900 text-white hover:bg-slate-800">
            {(isLoading || isUploading) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            {isUploading ? "Enviando imagens..." : "Salvar"}
          </Button>

          {showPublishButton && (
            <Button type="button"
              onClick={() => handleSave(true)}
              disabled={isLoading || isUploading}
              className="bg-[#ED2B75] hover:bg-[#C2185B] text-white border-none shadow-lg shadow-pink-500/20 px-6">
              {(isLoading || isUploading) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
              {isUploading ? "Enviando..." : "Publicar"}
            </Button>
          )}
        </div>
      </div>

      {/* CORPO: HTML à esquerda, preview à direita */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_640px] overflow-hidden">
        {/* HTML editor */}
        <div className="flex flex-col border-r border-slate-200 bg-slate-950 text-slate-100 min-h-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900 text-xs">
            <span className="font-mono uppercase tracking-wider text-slate-400">
              HTML · {activeTab === "desktop" ? "desktop" : "mobile"}
            </span>
            <span className="text-slate-500">{currentHtml.length} chars</span>
          </div>
          <Textarea
            value={currentHtml}
            onChange={(e) => onEditHtml(e.target.value)}
            placeholder="Cole ou edite seu HTML aqui. Use <style> inline se precisar de CSS específico."
            className="flex-1 font-mono text-xs leading-relaxed resize-none border-0 rounded-none bg-slate-950 text-slate-100 placeholder:text-slate-600 focus-visible:ring-0 focus-visible:ring-offset-0 p-4"
            spellCheck={false}
          />
          <div className="px-4 py-2 border-t border-slate-800 bg-slate-900 text-[11px] text-slate-500">
            Tip: edite Desktop primeiro, depois clique <strong>Copiar do Desktop</strong> em Mobile e ajuste larguras/paddings.
          </div>
        </div>

        {/* Preview lado a lado: desktop + mobile sempre visíveis */}
        <div className="bg-slate-100 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <Sparkles className="h-3.5 w-3.5" /> Pré-visualização ao vivo
          </div>

          <PreviewCard label="Desktop" icon={<Monitor className="h-3.5 w-3.5" />} width={580} height={420}>
            <iframe
              title="preview-desktop"
              srcDoc={wrap(htmlDesktop, false)}
              className="w-full h-full border-0"
              sandbox="allow-same-origin"
            />
          </PreviewCard>

          <PreviewCard label="Mobile" icon={<Smartphone className="h-3.5 w-3.5" />} width={360} height={640}>
            <iframe
              title="preview-mobile"
              srcDoc={wrap(htmlMobile, true)}
              className="w-full h-full border-0"
              sandbox="allow-same-origin"
            />
          </PreviewCard>
        </div>
      </div>
    </div>
  );
};

function PreviewCard({ label, icon, width, height, children }: {
  label: string;
  icon: React.ReactNode;
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        {icon} {label} <span className="ml-auto text-[10px] font-normal text-slate-400">{width}×{height}</span>
      </div>
      <div style={{ width: "100%", height: `${height}px` }} className="bg-slate-50">
        {children}
      </div>
    </div>
  );
}
