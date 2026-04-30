import { useEffect, useRef, useState } from "react";
import grapesjs, { Editor } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import pluginWebpage from "grapesjs-preset-webpage";
import pluginForms from "grapesjs-plugin-forms";

interface GrapesEditorProps {
  initialDesign?: any;
  initialHtml?: string;
  onSave: (data: { html: string; design: any }) => void;
  minHeight?: string;
}

export const GrapesEditor = ({ initialDesign, initialHtml, onSave, minHeight = "600px" }: GrapesEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const e = grapesjs.init({
      container: editorRef.current,
      height: minHeight,
      width: "auto",
      storageManager: false,
      plugins: [pluginWebpage, pluginForms],
      pluginsOpts: {
        [pluginWebpage as any]: {},
        [pluginForms as any]: {},
      },
      canvas: {
        styles: [
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
        ],
      },
    });

    // Add Lead Capture Blocks
    e.BlockManager.add("lead-form", {
      label: "Formulário de Lead",
      category: "Maxfem",
      content: `
        <form style="padding: 20px; display: flex; flex-direction: column; gap: 15px;">
          <div style="display: flex; flex-direction: column; gap: 5px;">
            <label style="font-size: 14px; font-weight: 600;">Nome</label>
            <input type="text" name="name" placeholder="Seu nome" style="padding: 10px; border: 1px solid #ddd; border-radius: 4px;" required />
          </div>
          <div style="display: flex; flex-direction: column; gap: 5px;">
            <label style="font-size: 14px; font-weight: 600;">E-mail</label>
            <input type="email" name="email" placeholder="Seu e-mail" style="padding: 10px; border: 1px solid #ddd; border-radius: 4px;" required />
          </div>
          <div style="display: flex; flex-direction: column; gap: 5px;">
            <label style="font-size: 14px; font-weight: 600;">Telefone</label>
            <input type="tel" name="phone" placeholder="(00) 00000-0000" style="padding: 10px; border: 1px solid #ddd; border-radius: 4px;" />
          </div>
          <button type="submit" style="padding: 12px; background: #ED2B75; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Cadastrar Agora</button>
        </form>
      `,
    });

    e.BlockManager.add("lead-input-name", {
      label: "Campo: Nome",
      category: "Campos",
      content: '<input type="text" name="name" placeholder="Nome" style="padding: 10px; border: 1px solid #ddd; border-radius: 4px; width: 100%;" required />',
    });

    e.BlockManager.add("lead-input-email", {
      label: "Campo: E-mail",
      category: "Campos",
      content: '<input type="email" name="email" placeholder="E-mail" style="padding: 10px; border: 1px solid #ddd; border-radius: 4px; width: 100%;" required />',
    });

    e.BlockManager.add("lead-input-phone", {
      label: "Campo: Telefone",
      category: "Campos",
      content: '<input type="tel" name="phone" placeholder="(00) 00000-0000" style="padding: 10px; border: 1px solid #ddd; border-radius: 4px; width: 100%;" />',
    });

    e.BlockManager.add("lead-button", {
      label: "Botão de Envio",
      category: "Maxfem",
      content: '<button type="submit" style="padding: 12px 24px; background: #ED2B75; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; width: 100%;">ENVIAR</button>',
    });

    if (initialDesign && typeof initialDesign === "object" && Object.keys(initialDesign).length > 0) {
      try {
        e.loadProjectData(initialDesign);
      } catch (err) {
        console.error("Error loading design:", err);
      }
    } else if (initialHtml) {
      e.setComponents(initialHtml);
    } else {
      // Default blank state for popup
      e.setComponents(`
        <div class="mxf-popup-wrapper" style="padding: 40px; text-align: center; font-family: 'Inter', sans-serif;">
          <h2 style="margin-bottom: 10px;">Título do seu Pop-up</h2>
          <p style="margin-bottom: 20px; color: #666;">Uma descrição atraente para captar o lead.</p>
          <form style="display: flex; flex-direction: column; gap: 10px; max-width: 320px; margin: 0 auto;">
            <input type="text" name="name" placeholder="Seu nome" style="padding: 12px; border: 1px solid #ddd; border-radius: 6px;" required />
            <input type="email" name="email" placeholder="Seu e-mail" style="padding: 12px; border: 1px solid #ddd; border-radius: 6px;" required />
            <button type="submit" style="padding: 12px; background-color: #ED2B75; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Cadastrar</button>
          </form>
        </div>
      `);
    }

    setEditor(e);

    return () => {
      e.destroy();
    };
  }, []);

  useEffect(() => {
    if (editor) {
      (window as any).grapesEditor = editor; 
    }
  }, [editor]);

  return (
    <div className="h-full w-full">
      <style>{`
        .gjs-cv-canvas {
          top: 0;
          width: 100%;
          height: 100%;
        }
        .gjs-one-bg {
          background-color: #f8fafc;
        }
        .gjs-two-color {
          color: #334155;
        }
        .gjs-three-color {
          color: #64748b;
        }
        .gjs-four-color, .gjs-four-color-h:hover {
          color: #ED2B75;
        }
      `}</style>
      <div ref={editorRef} />
    </div>
  );
};
