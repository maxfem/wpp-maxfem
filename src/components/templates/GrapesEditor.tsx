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
      fromElement: false,
      storageManager: false,
      plugins: [pluginWebpage, pluginForms],
      pluginsOpts: {
        [pluginWebpage as any]: {
          modalImportTitle: "Importar Template",
          modalImportLabel: "Cole seu HTML/CSS aqui",
          modalImportContent: (editor: any) => {
            return editor.getHtml() + "<style>" + editor.getCss() + "</style>";
          },
          blocksBasicOpts: {
            blocks: ["column1", "column2", "column3", "column3-7", "text", "link", "image", "video"],
            flexGrid: true,
          },
          showStylesOnChange: true,
        },
        [pluginForms as any]: {
          blocks: ["form", "input", "textarea", "select", "button", "label", "checkbox", "radio"],
        },
      },
      canvas: {
        styles: [
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@400;700&family=Poppins:wght@400;600&display=swap",
        ],
      },
    });

    // Add a couple of Maxfem-specific lead form blocks alongside default blocks
    e.BlockManager.add("mxf-lead-form", {
      label: "Form Lead",
      category: "Maxfem",
      media: '<svg viewBox="0 0 24 24" width="40" height="40"><path fill="currentColor" d="M3 3h18v2H3V3zm0 8h18v2H3v-2zm0 8h12v2H3v-2z"/></svg>',
      content: `
        <form style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); display: flex; flex-direction: column; gap: 16px; max-width: 420px; margin: 0 auto; font-family: 'Inter', sans-serif;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #111; text-align: center;">Ganhe 10% de desconto</h2>
          <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">Cadastre-se e receba seu cupom no e-mail.</p>
          <input type="text" name="name" placeholder="Seu nome" style="padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;" required />
          <input type="email" name="email" placeholder="Seu melhor e-mail" style="padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;" required />
          <input type="tel" name="phone" placeholder="WhatsApp (opcional)" style="padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
          <button type="submit" style="padding: 14px; background: #ED2B75; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 15px; cursor: pointer;">QUERO MEU CUPOM</button>
        </form>
      `,
    });

    e.BlockManager.add("mxf-popup-hero", {
      label: "Popup Hero",
      category: "Maxfem",
      media: '<svg viewBox="0 0 24 24" width="40" height="40"><path fill="currentColor" d="M4 4h16v4H4V4zm0 6h16v10H4V10z"/></svg>',
      content: `
        <section style="display: flex; flex-direction: column; align-items: center; padding: 40px 30px; background: white; border-radius: 12px; text-align: center; font-family: 'Inter', sans-serif;">
          <h1 style="font-size: 28px; font-weight: 700; margin: 0 0 12px; color: #111;">Oferta Exclusiva!</h1>
          <p style="font-size: 16px; color: #666; margin: 0 0 24px; max-width: 420px;">Cadastre-se agora e receba ofertas exclusivas em primeira mão.</p>
          <form style="display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 360px;">
            <input type="email" name="email" placeholder="Seu e-mail" style="padding: 14px; border: 1px solid #ddd; border-radius: 8px; font-size: 15px;" required />
            <button type="submit" style="padding: 14px; background: #ED2B75; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 15px; cursor: pointer;">QUERO PARTICIPAR</button>
          </form>
        </section>
      `,
    });

    if (initialDesign && typeof initialDesign === "object" && Object.keys(initialDesign).length > 0) {
      try {
        e.loadProjectData(initialDesign);
      } catch (err) {
        console.error("Error loading design:", err);
        if (initialHtml) e.setComponents(initialHtml);
      }
    } else if (initialHtml) {
      e.setComponents(initialHtml);
    } else {
      e.setComponents(`
        <div style="padding: 40px; text-align: center; font-family: 'Inter', sans-serif; background: white; border-radius: 12px;">
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
    (window as any).grapesEditor = e;

    return () => {
      try { e.destroy(); } catch {}
      (window as any).grapesEditor = null;
    };
  }, []);

  return (
    <div className="h-full w-full">
      <div ref={editorRef} />
    </div>
  );
};
