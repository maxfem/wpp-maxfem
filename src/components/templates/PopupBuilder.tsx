import { useRef, useState } from "react";
import type { Editor } from "grapesjs";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Smartphone, Monitor, Settings, Power, PowerOff, Rocket } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GrapesEditor } from "./GrapesEditor";

interface PopupBuilderProps {
  initialDesign?: any | null;
  initialHtml?: string;
  initialSettings?: any;
  isActive?: boolean;
  onSave: (payload: { html: string; design: any; settings: any; is_active?: boolean }) => void;
  onToggleActive?: (isActive: boolean) => void;
  isLoading?: boolean;
}

export const PopupBuilder = ({
  initialDesign,
  initialHtml,
  initialSettings,
  isActive = true,
  onSave,
  onToggleActive,
  isLoading,
}: PopupBuilderProps) => {
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const editorRef = useRef<Editor | null>(null);

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

  const normalizeGrapesHtml = (rawHtml: string) => {
    const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const html = bodyMatch ? bodyMatch[1] : rawHtml;
    return html
      .replace(/<html[^>]*>|<\/html>/gi, "")
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
      .trim();
  };

  const collectPayload = () => {
    const editor = editorRef.current;
    if (!editor) return null;

    try { editor.runCommand?.("core:component-exit"); } catch {}

    const html = normalizeGrapesHtml(editor.getHtml());
    const css = editor.getCss();
    const design = editor.getProjectData();
    const combinedHtml = `<style>${css}</style>${html}`;

    if (!html || !/<(form|input|button|h1|h2|h3|p|img|a|div|section)\b/i.test(html)) {
      toast.error("O design está vazio. Adicione conteúdo antes de salvar.");
      return null;
    }
    return { html: combinedHtml, design };
  };

  const handleSave = () => {
    const payload = collectPayload();
    if (!payload) return;
    onSave({ ...payload, settings });
    setHasUnsavedChanges(false);
  };

  const handlePublish = () => {
    const payload = collectPayload();
    if (!payload) return;
    onSave({ ...payload, settings, is_active: true });
    setHasUnsavedChanges(false);
  };

  const handleToggleActive = () => {
    onToggleActive?.(!isActive);
  };

  const setGjsPreviewMode = (mode: "desktop" | "mobile") => {
    setPreviewMode(mode);
    const editor = editorRef.current;
    if (editor) editor.setDevice(mode === "desktop" ? "desktop" : "mobile");
  };

  // If popup was never published yet (treat as draft), keep "Publicar".
  // After it's active, only show "Salvar".
  const showPublishButton = !isActive;

  return (
    <div className="flex flex-col h-[800px] border rounded-md overflow-hidden bg-white shadow-xl">
      <div className="flex items-center justify-between p-3 border-b border-slate-200 bg-white text-slate-900 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={previewMode === "desktop" ? "default" : "secondary"}
            size="sm"
            onClick={() => setGjsPreviewMode("desktop")}
            className={previewMode === "desktop" ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}
          >
            <Monitor className="h-4 w-4 mr-1" /> Desktop
          </Button>
          <Button
            type="button"
            variant={previewMode === "mobile" ? "default" : "secondary"}
            size="sm"
            onClick={() => setGjsPreviewMode("mobile")}
            className={previewMode === "mobile" ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}
          >
            <Smartphone className="h-4 w-4 mr-1" /> Mobile
          </Button>

          {hasUnsavedChanges && (
            <span className="text-xs text-amber-600 font-medium ml-2">
              ● Alterações não salvas
            </span>
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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleToggleActive}
              disabled={isLoading}
              className={isActive
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"}
            >
              {isActive ? <Power className="h-4 w-4 mr-1" /> : <PowerOff className="h-4 w-4 mr-1" />}
              {isActive ? "Ativo" : "Inativo"}
            </Button>
          )}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleSave}
            disabled={isLoading}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            {isLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Salvar
          </Button>

          {showPublishButton && (
            <Button
              type="button"
              onClick={handlePublish}
              disabled={isLoading}
              className="bg-[#ED2B75] hover:bg-[#C2185B] text-white border-none shadow-lg shadow-pink-500/20 px-6"
            >
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
              Publicar
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <GrapesEditor
          initialDesign={initialDesign}
          initialHtml={initialHtml}
          onReady={(ed) => { editorRef.current = ed; }}
          onChange={() => setHasUnsavedChanges(true)}
          minHeight="100%"
        />
      </div>
    </div>
  );
};
