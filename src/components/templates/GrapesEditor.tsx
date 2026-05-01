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

    // ===== CONTENT BLOCKS =====
    const ico = (svg: string) => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`;

    e.BlockManager.add("mxf-text", {
      label: "Text",
      category: "Content",
      media: ico('<path d="M4 7V5h16v2"/><path d="M9 5v14"/><path d="M15 5v14"/><path d="M7 19h10"/>'),
      content: '<div data-gjs-type="text" style="padding: 10px; font-family: Inter, sans-serif; font-size: 16px; color: #333;">Insira seu texto aqui. Clique duas vezes para editar.</div>',
    });

    e.BlockManager.add("mxf-button", {
      label: "Button",
      category: "Content",
      media: ico('<rect x="3" y="8" width="18" height="8" rx="2"/>'),
      content: '<a href="#" style="display: inline-block; padding: 12px 28px; background: #ED2B75; color: white; border-radius: 8px; font-family: Inter, sans-serif; font-weight: 600; text-decoration: none; cursor: pointer;">Clique aqui</a>',
    });

    e.BlockManager.add("mxf-image", {
      label: "Image",
      category: "Content",
      media: ico('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
      select: true,
      content: { type: "image" },
      activate: true,
    });

    e.BlockManager.add("mxf-divider", {
      label: "Divider",
      category: "Content",
      media: ico('<line x1="3" y1="12" x2="21" y2="12"/>'),
      content: '<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />',
    });

    e.BlockManager.add("mxf-social", {
      label: "Social",
      category: "Content",
      media: ico('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/>'),
      content: `
        <div style="display: flex; gap: 12px; justify-content: center; padding: 16px;">
          <a href="#" style="width: 40px; height: 40px; border-radius: 50%; background: #1877F2; display: inline-flex; align-items: center; justify-content: center; color: white; text-decoration: none; font-weight: 700;">f</a>
          <a href="#" style="width: 40px; height: 40px; border-radius: 50%; background: #E4405F; display: inline-flex; align-items: center; justify-content: center; color: white; text-decoration: none; font-weight: 700;">i</a>
          <a href="#" style="width: 40px; height: 40px; border-radius: 50%; background: #25D366; display: inline-flex; align-items: center; justify-content: center; color: white; text-decoration: none; font-weight: 700;">w</a>
          <a href="#" style="width: 40px; height: 40px; border-radius: 50%; background: #000; display: inline-flex; align-items: center; justify-content: center; color: white; text-decoration: none; font-weight: 700;">x</a>
        </div>
      `,
    });

    e.BlockManager.add("mxf-social-element", {
      label: "Social Element",
      category: "Content",
      media: ico('<circle cx="12" cy="12" r="9"/><path d="M12 3a14 14 0 0 0 0 18M12 3a14 14 0 0 1 0 18M3 12h18"/>'),
      content: '<a href="#" style="display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: #ED2B75; color: white; text-decoration: none; font-weight: 700; font-family: Inter, sans-serif;">in</a>',
    });

    e.BlockManager.add("mxf-spacer", {
      label: "Spacer",
      category: "Content",
      media: ico('<line x1="12" y1="3" x2="12" y2="21"/><polyline points="8 7 12 3 16 7"/><polyline points="8 17 12 21 16 17"/>'),
      content: '<div style="height: 40px; width: 100%;"></div>',
    });

    e.BlockManager.add("mxf-navbar", {
      label: "Navbar",
      category: "Content",
      media: ico('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'),
      content: `
        <nav style="display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background: white; border-bottom: 1px solid #e2e8f0; font-family: Inter, sans-serif;">
          <div style="font-weight: 700; font-size: 18px; color: #ED2B75;">Logo</div>
          <div style="display: flex; gap: 24px;">
            <a href="#" style="color: #333; text-decoration: none; font-weight: 500;">Home</a>
            <a href="#" style="color: #333; text-decoration: none; font-weight: 500;">Sobre</a>
            <a href="#" style="color: #333; text-decoration: none; font-weight: 500;">Contato</a>
          </div>
        </nav>
      `,
    });

    e.BlockManager.add("mxf-hero", {
      label: "Hero",
      category: "Content",
      media: ico('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>'),
      content: `
        <section style="padding: 60px 30px; text-align: center; background: linear-gradient(135deg, #FCE4EF 0%, #ffffff 100%); font-family: Inter, sans-serif;">
          <h1 style="font-size: 36px; font-weight: 800; color: #1A1A2E; margin: 0 0 16px;">Título Impactante</h1>
          <p style="font-size: 18px; color: #666; margin: 0 0 28px; max-width: 560px; margin-left: auto; margin-right: auto;">Subtítulo claro e direto que explica o valor da sua oferta em uma frase.</p>
          <a href="#" style="display: inline-block; padding: 14px 32px; background: #ED2B75; color: white; border-radius: 8px; font-weight: 700; text-decoration: none;">Começar Agora</a>
        </section>
      `,
    });

    e.BlockManager.add("mxf-html-block", {
      label: "HTML block",
      category: "Content",
      media: ico('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
      content: '<div data-gjs-type="default"><!-- Cole seu HTML aqui --><div style="padding: 20px; border: 1px dashed #e2e8f0; text-align: center; color: #999; font-family: Inter, sans-serif;">Bloco HTML — edite via código</div></div>',
    });

    // ===== LAYOUT BLOCKS =====
    const colCss = "padding: 10px; min-height: 80px; flex-grow: 1; flex-basis: 100%;";

    e.BlockManager.add("mxf-col-1", {
      label: "1 Column",
      category: "Layout",
      media: ico('<rect x="3" y="5" width="18" height="14" rx="1"/>'),
      content: `<div style="display: flex; padding: 10px;"><div style="${colCss}"></div></div>`,
    });

    e.BlockManager.add("mxf-col-2-50", {
      label: "2 Columns 50/50",
      category: "Layout",
      media: ico('<rect x="3" y="5" width="8" height="14" rx="1"/><rect x="13" y="5" width="8" height="14" rx="1"/>'),
      content: `<div style="display: flex; padding: 10px; gap: 10px;"><div style="${colCss} flex-basis: 50%;"></div><div style="${colCss} flex-basis: 50%;"></div></div>`,
    });

    e.BlockManager.add("mxf-col-2-25-75", {
      label: "2 Columns 25/75",
      category: "Layout",
      media: ico('<rect x="3" y="5" width="4" height="14" rx="1"/><rect x="9" y="5" width="12" height="14" rx="1"/>'),
      content: `<div style="display: flex; padding: 10px; gap: 10px;"><div style="${colCss} flex-basis: 25%;"></div><div style="${colCss} flex-basis: 75%;"></div></div>`,
    });

    e.BlockManager.add("mxf-col-2-33-67", {
      label: "2 Columns 33/67",
      category: "Layout",
      media: ico('<rect x="3" y="5" width="6" height="14" rx="1"/><rect x="11" y="5" width="10" height="14" rx="1"/>'),
      content: `<div style="display: flex; padding: 10px; gap: 10px;"><div style="${colCss} flex-basis: 33%;"></div><div style="${colCss} flex-basis: 67%;"></div></div>`,
    });

    e.BlockManager.add("mxf-col-3", {
      label: "3 Columns",
      category: "Layout",
      media: ico('<rect x="3" y="5" width="5" height="14" rx="1"/><rect x="9.5" y="5" width="5" height="14" rx="1"/><rect x="16" y="5" width="5" height="14" rx="1"/>'),
      content: `<div style="display: flex; padding: 10px; gap: 10px;"><div style="${colCss} flex-basis: 33.33%;"></div><div style="${colCss} flex-basis: 33.33%;"></div><div style="${colCss} flex-basis: 33.33%;"></div></div>`,
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
    <div className="gjs-wrapper" style={{ height: "100%", width: "100%", minHeight: 700, display: "flex", flexDirection: "column" }}>
      <style>{`
        .gjs-wrapper .gjs-editor { height: 100% !important; }
        .gjs-wrapper .gjs-cv-canvas { background: #f1f5f9; }
        .gjs-wrapper .gjs-block { width: calc(50% - 10px); min-height: 80px; }
      `}</style>
      <div ref={editorRef} style={{ flex: 1, minHeight: 700 }} />
    </div>
  );
};
