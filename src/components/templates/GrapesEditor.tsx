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
        [pluginForms as any]: {},
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
        <div style="display: flex; flex-wrap: wrap; align-items: center; background: white; border-radius: 12px; overflow: hidden;">
          <div style="flex: 1; min-width: 250px; padding: 40px;">
            <h2 style="font-size: 24px; margin-bottom: 15px;">Ganhe um Ebook Grátis</h2>
            <p style="color: #666; margin-bottom: 20px;">Tudo o que você precisa saber sobre marketing digital em um só lugar.</p>
            <form style="display: flex; flex-direction: column; gap: 10px;">
              <input type="email" name="email" placeholder="Seu e-mail" style="padding: 12px; border: 1px solid #ddd; border-radius: 6px;" required />
              <button type="submit" style="padding: 12px; background: #111; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Baixar Agora</button>
            </form>
          </div>
          <div style="flex: 1; min-width: 250px; background: #f0f2f5; height: 350px; display: flex; align-items: center; justify-content: center;">
             <span style="color: #999; font-style: italic;">Imagem do Produto Aqui</span>
          </div>
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
          background-color: #1e293b;
        }
        .gjs-two-color {
          color: #e2e8f0;
        }
        .gjs-three-color {
          color: #94a3b8;
        }
        .gjs-four-color, .gjs-four-color-h:hover {
          color: #ED2B75;
        }
        .gjs-pn-panels {
          padding: 5px;
        }
        .gjs-block {
          width: calc(50% - 10px);
          margin: 5px;
          border-radius: 6px;
          border: 1px solid #334155;
          background-color: #0f172a;
          transition: all 0.2s;
        }
        .gjs-block:hover {
          border-color: #ED2B75;
          color: #ED2B75;
        }
        .gjs-field {
          background-color: #0f172a;
          border: 1px solid #334155;
          border-radius: 4px;
        }
        .gjs-sm-sector-title {
          background-color: #334155;
          border-bottom: 1px solid #1e293b;
          text-transform: uppercase;
          font-weight: 700;
          font-size: 11px;
        }
      `}</style>
      <div ref={editorRef} />
    </div>
  );
};
