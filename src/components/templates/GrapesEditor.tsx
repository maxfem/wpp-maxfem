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
        [pluginWebpage as any]: {
          modalImportTitle: "Importar Template",
          modalImportLabel: "Cole seu HTML/CSS aqui",
        },
        [pluginForms as any]: {
          blocks: ['form', 'input', 'textarea', 'select', 'button', 'label', 'checkbox', 'radio'],
        },
      },
      styleManager: {
        sectors: [
          {
            name: "Layout",
            open: true,
            buildProps: ["display", "flex-direction", "justify-content", "align-items", "gap", "margin", "padding"],
          },
          {
            name: "Dimensões",
            open: true,
            buildProps: ["width", "height", "max-width", "min-height"],
          },
          {
            name: "Tipografia",
            open: true,
            buildProps: ["font-family", "font-size", "font-weight", "letter-spacing", "color", "line-height", "text-align", "text-shadow"],
          },
          {
            name: "Decoração",
            open: false,
            buildProps: ["background-color", "border-radius", "border", "box-shadow", "background"],
          },
          {
            name: "Extra",
            open: false,
            buildProps: ["opacity", "transition", "transform"],
          },
        ],
      },
      canvas: {
        styles: [
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@400;700&family=Poppins:wght@400;600&display=swap",
        ],
      },
    });

    // Elementor-style Lead Capture Blocks
    e.BlockManager.add("section-hero", {
      label: "Seção Hero",
      category: "Estrutura",
      content: `
        <section style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 50px 20px; text-align: center; background-color: #fff; border-radius: 12px; font-family: 'Inter', sans-serif;">
          <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 10px; color: #111;">Oferta Irresistível!</h1>
          <p style="font-size: 18px; color: #666; margin-bottom: 30px; max-width: 500px;">Capture a atenção do seu visitante com um título poderoso e um formulário direto.</p>
          <form style="width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 15px;">
            <input type="email" name="email" placeholder="Seu melhor e-mail" style="padding: 15px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px;" required />
            <button type="submit" style="padding: 15px; background-color: #ED2B75; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 16px; cursor: pointer;">QUERO MEU DESCONTO</button>
          </form>
        </section>
      `,
    });

    e.BlockManager.add("lead-form-modern", {
      label: "Forms Moderno",
      category: "Maxfem Lead",
      content: `
        <form style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 20px;">
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="font-size: 14px; font-weight: 600; color: #334155;">Nome Completo</label>
            <input type="text" name="name" placeholder="Ex: Maria Silva" style="padding: 12px; border: 1.5px solid #e2e8f0; border-radius: 10px; transition: border-color 0.2s;" required />
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="font-size: 14px; font-weight: 600; color: #334155;">E-mail Principal</label>
            <input type="email" name="email" placeholder="maria@email.com" style="padding: 12px; border: 1.5px solid #e2e8f0; border-radius: 10px;" required />
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="font-size: 14px; font-weight: 600; color: #334155;">WhatsApp (Opcional)</label>
            <input type="tel" name="phone" placeholder="(11) 99999-9999" style="padding: 12px; border: 1.5px solid #e2e8f0; border-radius: 10px;" />
          </div>
          <button type="submit" style="padding: 16px; background: linear-gradient(135deg, #ED2B75 0%, #C2185B 100%); color: white; border: none; border-radius: 10px; font-weight: 700; font-size: 16px; cursor: pointer; box-shadow: 0 4px 15px rgba(237, 43, 117, 0.3);">CADASTRAR AGORA</button>
        </form>
      `,
    });

    e.BlockManager.add("modern-input", {
      label: "Input Elementor",
      category: "Maxfem Lead",
      content: '<input type="text" name="field" placeholder="Digite aqui..." style="padding: 12px 15px; border: 1px solid #e2e8f0; border-radius: 8px; width: 100%; font-size: 14px; transition: all 0.3s; background-color: #f8fafc;" />',
    });

    e.BlockManager.add("modern-button", {
      label: "Botão Gradient",
      category: "Maxfem Lead",
      content: '<button type="submit" style="padding: 15px 30px; background: linear-gradient(90deg, #ED2B75 0%, #FF6B6B 100%); color: white; border: none; border-radius: 30px; font-weight: 700; font-size: 15px; cursor: pointer; width: 100%; text-transform: uppercase; letter-spacing: 1px;">Enviar Agora</button>',
    });

    e.BlockManager.add("split-content", {
      label: "Lado a Lado",
      category: "Estrutura",
      content: `
        <div style="display: flex; flex-wrap: wrap; align-items: stretch; background: white; border-radius: 12px; overflow: hidden; min-height: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
          <div style="flex: 1; min-width: 300px; background-image: url('https://images.unsplash.com/photo-1493723843671-1d655e7d987d?auto=format&fit=crop&q=80&w=800'); background-size: cover; background-position: center;"></div>
          <div style="flex: 1.2; min-width: 300px; padding: 40px; display: flex; flex-direction: column; justify-content: center;">
            <h2 style="font-size: 28px; font-weight: 700; margin-bottom: 15px; color: #1e293b; line-height: 1.2;">Oferta de Lançamento!</h2>
            <p style="color: #64748b; margin-bottom: 25px; font-size: 16px;">Assine agora e ganhe 50% de desconto no primeiro mês. Não perca!</p>
            <form style="display: flex; flex-direction: column; gap: 12px;">
              <input type="email" name="email" placeholder="Seu e-mail" style="padding: 14px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" required />
              <button type="submit" style="padding: 14px; background: #ED2B75; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; transition: all 0.3s; transform: scale(1);" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">APROVEITAR AGORA</button>
            </form>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 15px; text-align: center;">Válido por tempo limitado.</p>
          </div>
        </div>
      `,
    });

    e.BlockManager.add("slide-in-form", {
      label: "Slide-in (Canto)",
      category: "Estrutura",
      content: `
        <div style="width: 350px; padding: 25px; background: white; border-radius: 15px; box-shadow: 0 15px 50px rgba(0,0,0,0.15); border-left: 5px solid #ED2B75; font-family: 'Inter', sans-serif;">
          <h3 style="font-size: 20px; font-weight: 700; margin-bottom: 10px; color: #1e293b;">Precisa de ajuda?</h3>
          <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">Deixe seu contato e um de nossos especialistas falará com você.</p>
          <form style="display: flex; flex-direction: column; gap: 12px;">
            <input type="text" name="name" placeholder="Nome" style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px;" />
            <input type="tel" name="phone" placeholder="WhatsApp" style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px;" />
            <button type="submit" style="padding: 12px; background: #1e293b; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">SOLICITAR CONTATO</button>
          </form>
        </div>
      `,
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
        /* GrapesJS UI Theme - Elementor Style */
        .gjs-cv-canvas {
          top: 0;
          width: 100%;
          height: 100%;
          background-color: #f1f5f9;
        }
        .gjs-one-bg {
          background-color: #ffffff;
        }
        .gjs-two-color {
          color: #334155;
        }
        .gjs-three-color {
          color: #64748b;
        }
        .gjs-four-color, .gjs-four-color-h:hover {
          color: #2563eb;
        }
        .gjs-pn-panels {
          padding: 5px;
          border-bottom: 1px solid #e2e8f0;
          background-color: #f8fafc;
        }
        .gjs-pn-views-container {
          background-color: #ffffff;
          border-left: 1px solid #e2e8f0;
        }
        .gjs-block {
          width: calc(50% - 10px);
          margin: 5px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background-color: #f8fafc;
          transition: all 0.2s;
          color: #475569;
        }
        .gjs-block:hover {
          border-color: #2563eb;
          color: #2563eb;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        }
        .gjs-field {
          background-color: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          color: #1e293b;
        }
        .gjs-sm-sector-title {
          background-color: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          text-transform: capitalize;
          font-weight: 600;
          font-size: 13px;
          color: #1e293b;
        }
        .gjs-sm-properties {
          background-color: #ffffff;
        }
        .gjs-sm-label {
          color: #475569;
        }
        .gjs-sm-property {
          border-bottom: 1px solid #f1f5f9;
        }
        .gjs-clm-tags-field {
          background-color: #f1f5f9;
        }
        .gjs-am-assets-header {
          background-color: #f8fafc;
        }
        .gjs-pn-btn.gjs-pn-active {
          background-color: #eff6ff;
          color: #2563eb;
          box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
        }
        .gjs-pn-btn {
          color: #64748b;
        }
      `}</style>
      <div ref={editorRef} />
    </div>
  );
};
