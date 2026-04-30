import { useRef, useState, useEffect } from "react";
import EmailEditor, { EditorRef } from "react-email-editor";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Smartphone, Monitor } from "lucide-react";

interface EmailBuilderProps {
  initialDesign?: any | null;
  initialHtml?: string;
  onSave: (payload: { html: string; design: any }) => void;
  isLoading?: boolean;
}

export const EmailBuilder = ({ initialDesign, initialHtml, onSave, isLoading }: EmailBuilderProps) => {
  const emailEditorRef = useRef<EditorRef>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [isReady, setIsReady] = useState(false);
  const designLoadedRef = useRef(false);

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

  // Load design when editor is ready
  useEffect(() => {
    if (isReady) {
      loadDesignSafely();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, initialDesign]);

  const exportHtml = () => {
    const unlayer = emailEditorRef.current?.editor;
    if (!unlayer) return;
    unlayer.exportHtml((data) => {
      const { html, design } = data;
      onSave({ html, design });
    });
  };

  const onReady = () => {
    setIsReady(true);
  };

  return (
    <div className="flex flex-col h-[600px] border rounded-md overflow-hidden bg-white">
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
          Salvar Design
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
            mergeTags: {
              customer_name: { name: "Nome do Cliente", value: "{{customer.name}}" },
              customer_first_name: { name: "Primeiro Nome", value: "{{customer.first_name}}" },
              unsubscribe_url: { name: "Link de Descadastro", value: "{{unsubscribe_url}}" },
            },
            locale: "pt-BR",
          }}
        />
      </div>
    </div>
  );
};
