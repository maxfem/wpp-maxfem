import { useRef, useState, useEffect } from "react";
import EmailEditor, { EditorRef } from "react-email-editor";
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

interface PopupBuilderProps {
  initialDesign?: any | null;
  initialHtml?: string;
  initialSettings?: any;
  onSave: (payload: { html: string; design: any; settings: any }) => void;
  isLoading?: boolean;
}

export const PopupBuilder = ({ initialDesign, initialSettings, onSave, isLoading }: PopupBuilderProps) => {
  const emailEditorRef = useRef<EditorRef>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [isReady, setIsReady] = useState(false);
  const designLoadedRef = useRef(false);
  
  const [settings, setSettings] = useState({
    delay: 2000,
    trigger: "timer", // timer, exit, scroll
    scrollPercentage: 50,
    position: "center", // center, bottom-right, bottom-left, top
    showCloseButton: true,
    overlayClose: true,
    ...(initialSettings || {})
  });

  const loadDesignSafely = () => {
    const unlayer = emailEditorRef.current?.editor;
    if (!unlayer || designLoadedRef.current) return;

    if (initialDesign && typeof initialDesign === "object" && Object.keys(initialDesign).length > 0) {
      try {
        unlayer.loadDesign(initialDesign as any);
        designLoadedRef.current = true;
      } catch (e) {
        console.warn("Could not load saved design", e);
      }
    }
  };

  useEffect(() => {
    if (isReady) {
      loadDesignSafely();
    }
  }, [isReady, initialDesign]);

  const exportHtml = () => {
    const unlayer = emailEditorRef.current?.editor;
    if (!unlayer) return;
    unlayer.exportHtml((data) => {
      const { html, design } = data;
      onSave({ html, design, settings });
    });
  };

  const onReady = () => {
    setIsReady(true);
  };

  return (
    <div className="flex flex-col h-[700px] border rounded-md overflow-hidden bg-white">
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={previewMode === "desktop" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setPreviewMode("desktop");
              emailEditorRef.current?.editor?.setDisplayMode?.("desktop" as any);
            }}
          >
            <Monitor className="h-4 w-4 mr-1" /> Desktop
          </Button>
          <Button
            type="button"
            variant={previewMode === "mobile" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setPreviewMode("mobile");
              emailEditorRef.current?.editor?.setDisplayMode?.("mobile" as any);
            }}
          >
            <Smartphone className="h-4 w-4 mr-1" /> Mobile
          </Button>
        </div>
        <Button type="button" onClick={exportHtml} disabled={isLoading || !isReady}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Pop-up
        </Button>
      </div>
      <div className="flex-1">
        <EmailEditor
          ref={emailEditorRef}
          onReady={onReady}
          minHeight="100%"
          appearance={{
            theme: "light",
          }}
          options={{
            displayMode: "email", // Keeping as email for compatibility with current Unlayer integration, but we will use it for pop-up design
            locale: "pt-BR",
            customJS: [
              "https://cdnjs.cloudflare.com/ajax/libs/jquery.mask/1.14.16/jquery.mask.min.js"
            ]
          }}
        />
      </div>
    </div>
  );
};
