import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Smartphone, Monitor, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  onSave: (payload: { html: string; design: any; settings: any }) => void;
  isLoading?: boolean;
}

export const PopupBuilder = ({ initialDesign, initialHtml, initialSettings, onSave, isLoading }: PopupBuilderProps) => {
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  
  const [settings, setSettings] = useState({
    delay: 2000,
    trigger: "timer", // timer, exit, scroll
    scrollPercentage: 50,
    position: "center", // center, bottom-right, bottom-left, top
    showCloseButton: true,
    overlayClose: true,
    ...(initialSettings || {})
  });

  const exportHtml = () => {
    const editor = (window as any).grapesEditor;
    if (!editor) return;

    const html = editor.getHtml();
    const css = editor.getCss();
    const design = editor.getProjectData();
    
    // Combine HTML and CSS
    const combinedHtml = `<style>${css}</style>${html}`;

    if (!html || html.length < 50) {
      alert("O design está vazio. Adicione conteúdo antes de salvar.");
      return;
    }
    
    onSave({ html: combinedHtml, design, settings });
  };

  const setGjsPreviewMode = (mode: "desktop" | "mobile") => {
    setPreviewMode(mode);
    const editor = (window as any).grapesEditor;
    if (editor) {
      editor.setDevice(mode === "desktop" ? "desktop" : "mobile");
    }
  };

  return (
    <div className="flex flex-col h-[700px] border rounded-md overflow-hidden bg-white">
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={previewMode === "desktop" ? "default" : "outline"}
            size="sm"
            onClick={() => setGjsPreviewMode("desktop")}
          >
            <Monitor className="h-4 w-4 mr-1" /> Desktop
          </Button>
          <Button
            type="button"
            variant={previewMode === "mobile" ? "default" : "outline"}
            size="sm"
            onClick={() => setGjsPreviewMode("mobile")}
          >
            <Smartphone className="h-4 w-4 mr-1" /> Mobile
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
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
                    <Select 
                      value={settings.trigger} 
                      onValueChange={(val) => setSettings({...settings, trigger: val})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                      <Input 
                        type="number" 
                        value={settings.delay / 1000} 
                        onChange={(e) => setSettings({...settings, delay: Number(e.target.value) * 1000})}
                      />
                    </div>
                  )}

                  {settings.trigger === "scroll" && (
                    <div className="space-y-2">
                      <Label>Porcentagem de rolagem (%)</Label>
                      <Input 
                        type="number" 
                        value={settings.scrollPercentage} 
                        onChange={(e) => setSettings({...settings, scrollPercentage: Number(e.target.value)})}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold border-b pb-2">Layout e Comportamento</h3>
                  
                  <div className="space-y-2">
                    <Label>Posição</Label>
                    <Select 
                      value={settings.position} 
                      onValueChange={(val) => setSettings({...settings, position: val})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                    <Switch 
                      id="close-btn"
                      checked={settings.showCloseButton}
                      onCheckedChange={(val) => setSettings({...settings, showCloseButton: val})}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="overlay-close">Fechar ao clicar fora</Label>
                    <Switch 
                      id="overlay-close"
                      checked={settings.overlayClose}
                      onCheckedChange={(val) => setSettings({...settings, overlayClose: val})}
                    />
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Button type="button" onClick={exportHtml} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Pop-up
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <GrapesEditor 
          initialDesign={initialDesign} 
          initialHtml={initialHtml}
          onSave={(data) => onSave({ ...data, settings })}
          minHeight="100%"
        />
      </div>
    </div>
  );
};
