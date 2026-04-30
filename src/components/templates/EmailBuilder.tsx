import { useRef, useState, useEffect } from "react";
import EmailEditor, { EditorRef } from "react-email-editor";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Eye, Smartphone, Monitor } from "lucide-react";
import debounce from "lodash.debounce";

interface EmailBuilderProps {
  initialHtml?: string;
  onSave: (html: string) => void;
  isLoading?: boolean;
}

export const EmailBuilder = ({ initialHtml, onSave, isLoading }: EmailBuilderProps) => {
  const emailEditorRef = useRef<EditorRef>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");

  const exportHtml = () => {
    const unlayer = emailEditorRef.current?.editor;
    unlayer?.exportHtml((data) => {
      const { html } = data;
      onSave(html);
    });
  };

  const onReady = () => {
    const unlayer = emailEditorRef.current?.editor;
    if (initialHtml && initialHtml.trim() !== "") {
      try {
        // Attempt to load design if it's JSON, or just clear if it's raw HTML
        // Note: react-email-editor works best with its own JSON design format.
        // If we only have HTML, we might not be able to "edit" it easily.
        // For now, we'll try to load it.
        // unlayer?.loadDesign(JSON.parse(initialHtml));
      } catch (e) {
        console.warn("Could not load design", e);
      }
    }
  };

  return (
    <div className="flex flex-col h-[600px] border rounded-md overflow-hidden bg-white">
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button
            variant={previewMode === "desktop" ? "default" : "outline"}
            size="sm"
            onClick={() => setPreviewMode("desktop")}
          >
            <Monitor className="h-4 w-4 mr-1" /> Desktop
          </Button>
          <Button
            variant={previewMode === "mobile" ? "default" : "outline"}
            size="sm"
            onClick={() => setPreviewMode("mobile")}
          >
            <Smartphone className="h-4 w-4 mr-1" /> Mobile
          </Button>
        </div>
        <Button onClick={exportHtml} disabled={isLoading}>
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
            theme: "modern",
          }}
          locale="pt-BR"
        />
      </div>
    </div>
  );
};
