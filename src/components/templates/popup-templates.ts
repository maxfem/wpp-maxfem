// Standalone HTML templates for popups.
// Each template provides a ready-to-render `html` string (used by popup-manager)
// plus a matching `design` object so the visual editor can also load it.

const baseFormStyle = `
  <style>
    .mxf-pop { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 28px; max-width: 420px; box-sizing: border-box; }
    .mxf-pop h2 { margin: 0 0 8px; font-size: 22px; }
    .mxf-pop p { margin: 0 0 16px; color: #555; font-size: 14px; line-height: 1.4; }
    .mxf-pop form { display: flex; flex-direction: column; gap: 10px; }
    .mxf-pop input { padding: 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; outline: none; }
    .mxf-pop input:focus { border-color: #ED2B75; }
    .mxf-pop button { padding: 12px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; color: #fff; }
    .mxf-pop [data-mxf-success] { text-align: center; padding: 16px; color: #16a34a; font-weight: 600; }
  </style>
`;

const designFromHtml = (html: string) => ({
  body: {
    rows: [
      {
        cells: [1],
        columns: [
          {
            contents: [
              { type: "html", values: { html } }
            ]
          }
        ]
      }
    ]
  }
});

const TEMPLATES_DEF = [
  {
    name: "Newsletter Simples",
    html: `${baseFormStyle}
      <div class="mxf-pop">
        <h2 style="text-align:center;">Assine nossa Newsletter</h2>
        <p style="text-align:center;">Receba novidades e promoções exclusivas no seu e-mail.</p>
        <form>
          <input type="text" name="name" placeholder="Seu nome" required />
          <input type="email" name="email" placeholder="Seu e-mail" required />
          <button type="submit" style="background:#3b82f6;">Inscrever-se</button>
          <div data-mxf-success style="display:none;">Inscrição realizada com sucesso!</div>
        </form>
      </div>`
  },
  {
    name: "Cupom de Desconto",
    html: `${baseFormStyle}
      <div class="mxf-pop">
        <h2 style="text-align:center; color:#ED2B75;">Ganhe 10% OFF!</h2>
        <p style="text-align:center;">Cadastre-se e receba um cupom para sua primeira compra.</p>
        <form>
          <input type="email" name="email" placeholder="Seu melhor e-mail" required />
          <button type="submit" style="background:#ED2B75;">Quero meu desconto!</button>
          <div data-mxf-success style="display:none;">
            <p style="margin:0;">Sucesso!</p>
            <p style="margin:6px 0 0; color:#111;">Use o cupom: <strong>BEMVINDO10</strong></p>
          </div>
        </form>
      </div>`
  },
  {
    name: "Captura de WhatsApp",
    html: `${baseFormStyle}
      <div class="mxf-pop">
        <h2 style="text-align:center;">Fale Conosco no WhatsApp</h2>
        <p style="text-align:center;">Deixe seu número e nossa equipe entrará em contato em breve.</p>
        <form>
          <input type="text" name="name" placeholder="Seu nome" required />
          <input type="tel" name="phone" placeholder="(00) 00000-0000" required />
          <button type="submit" style="background:#25d366;">Enviar Contato</button>
          <div data-mxf-success style="display:none;">Recebemos seu contato!</div>
        </form>
      </div>`
  },
  {
    name: "Download de E-book",
    html: `${baseFormStyle}
      <div class="mxf-pop">
        <h2 style="text-align:center;">E-book Gratuito</h2>
        <p style="text-align:center;">Guia completo Maxfem. Preencha para baixar agora.</p>
        <form>
          <input type="text" name="name" placeholder="Seu nome" required />
          <input type="email" name="email" placeholder="Seu e-mail" required />
          <button type="submit" style="background:#6c5ce7;">Baixar E-book</button>
          <div data-mxf-success style="display:none;">Link enviado para seu e-mail!</div>
        </form>
      </div>`
  },
  {
    name: "Aviso Urgente",
    html: `${baseFormStyle}
      <div class="mxf-pop">
        <h2 style="text-align:center; color:#d63031;">ÚLTIMAS UNIDADES!</h2>
        <p style="text-align:center;">O estoque está acabando. Deixe seu e-mail para ser avisado.</p>
        <form>
          <input type="email" name="email" placeholder="Seu e-mail" required />
          <button type="submit" style="background:#d63031;">Avise-me</button>
          <div data-mxf-success style="display:none;">Avisaremos você assim que chegar!</div>
        </form>
      </div>`
  },
];

export const POPUP_TEMPLATES = TEMPLATES_DEF.map(t => ({
  name: t.name,
  html: t.html,
  design: designFromHtml(t.html),
}));

export const DEFAULT_POPUP_HTML = TEMPLATES_DEF[1].html; // Cupom as default
