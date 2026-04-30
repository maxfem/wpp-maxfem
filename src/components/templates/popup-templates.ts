
export const POPUP_TEMPLATES = [
  {
    name: "Newsletter Simples",
    design: {
      body: {
        rows: [
          {
            cells: [1],
            columns: [
              {
                contents: [
                  {
                    type: "text",
                    values: {
                      color: "#000000",
                      text: "<h2 style=\"text-align: center;\">Assine nossa Newsletter</h2><p style=\"text-align: center;\">Receba novidades e promoções exclusivas diretamente no seu e-mail.</p>"
                    }
                  },
                  {
                    type: "html",
                    values: {
                      html: `
                        <form style="display: flex; flex-direction: column; gap: 10px; padding: 20px;">
                          <input type="text" name="name" placeholder="Seu nome" style="padding: 10px; border: 1px solid #ccc; border-radius: 4px;" required />
                          <input type="email" name="email" placeholder="Seu e-mail" style="padding: 10px; border: 1px solid #ccc; border-radius: 4px;" required />
                          <button type="submit" style="padding: 10px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Inscrever-se</button>
                          <div data-mxf-success style="display: none; color: green; text-align: center; margin-top: 10px;">Inscrição realizada com sucesso!</div>
                        </form>
                      `
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  },
  {
    name: "Cupom de Desconto",
    design: {
      body: {
        rows: [
          {
            cells: [1],
            columns: [
              {
                contents: [
                  {
                    type: "text",
                    values: {
                      color: "#000000",
                      text: "<h2 style=\"text-align: center; color: #e74c3c;\">Ganhe 10% OFF!</h2><p style=\"text-align: center;\">Cadastre-se agora e receba um cupom de desconto para sua primeira compra.</p>"
                    }
                  },
                  {
                    type: "html",
                    values: {
                      html: `
                        <form style="display: flex; flex-direction: column; gap: 10px; padding: 20px;">
                          <input type="email" name="email" placeholder="Seu melhor e-mail" style="padding: 10px; border: 1px solid #ccc; border-radius: 4px;" required />
                          <button type="submit" style="padding: 10px; background-color: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer;">Quero meu desconto!</button>
                          <div data-mxf-success style="display: none; text-align: center; margin-top: 10px;">
                            <p style="color: green; font-weight: bold;">Sucesso!</p>
                            <p>Use o cupom: <strong>BEMVINDO10</strong></p>
                          </div>
                        </form>
                      `
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  },
  {
    name: "Captura de WhatsApp",
    design: {
      body: {
        rows: [
          {
            cells: [1],
            columns: [
              {
                contents: [
                  {
                    type: "text",
                    values: {
                      color: "#000000",
                      text: "<h2 style=\"text-align: center;\">Fale Conosco no WhatsApp</h2><p style=\"text-align: center;\">Deixe seu número e nossa equipe entrará em contato em breve.</p>"
                    }
                  },
                  {
                    type: "html",
                    values: {
                      html: `
                        <form style="display: flex; flex-direction: column; gap: 10px; padding: 20px;">
                          <input type="text" name="name" placeholder="Seu nome" style="padding: 10px; border: 1px solid #ccc; border-radius: 4px;" required />
                          <input type="tel" name="phone" placeholder="(00) 00000-0000" style="padding: 10px; border: 1px solid #ccc; border-radius: 4px;" required />
                          <button type="submit" style="padding: 10px; background-color: #25d366; color: white; border: none; border-radius: 4px; cursor: pointer;">Enviar Contato</button>
                          <div data-mxf-success style="display: none; color: green; text-align: center; margin-top: 10px;">Recebemos seu contato!</div>
                        </form>
                      `
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  },
  {
    name: "Download de E-book",
    design: {
      body: {
        rows: [
          {
            cells: [1],
            columns: [
              {
                contents: [
                  {
                    type: "text",
                    values: {
                      color: "#000000",
                      text: "<h2 style=\"text-align: center;\">E-book Gratuito</h2><p style=\"text-align: center;\">Guia completo sobre Maxfem. Preencha os campos para baixar agora.</p>"
                    }
                  },
                  {
                    type: "html",
                    values: {
                      html: `
                        <form style="display: flex; flex-direction: column; gap: 10px; padding: 20px;">
                          <input type="text" name="name" placeholder="Seu nome" style="padding: 10px; border: 1px solid #ccc; border-radius: 4px;" required />
                          <input type="email" name="email" placeholder="Seu e-mail" style="padding: 10px; border: 1px solid #ccc; border-radius: 4px;" required />
                          <button type="submit" style="padding: 10px; background-color: #6c5ce7; color: white; border: none; border-radius: 4px; cursor: pointer;">Baixar E-book</button>
                          <div data-mxf-success style="display: none; color: green; text-align: center; margin-top: 10px;">Link enviado para seu e-mail!</div>
                        </form>
                      `
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  },
  {
    name: "Aviso Urgente",
    design: {
      body: {
        rows: [
          {
            cells: [1],
            columns: [
              {
                contents: [
                  {
                    type: "text",
                    values: {
                      color: "#000000",
                      text: "<h2 style=\"text-align: center; color: #d63031;\">ÚLTIMAS UNIDADES!</h2><p style=\"text-align: center;\">O estoque está acabando. Deixe seu e-mail para ser avisado da reposição ou garantir a sua agora.</p>"
                    }
                  },
                  {
                    type: "html",
                    values: {
                      html: `
                        <form style="display: flex; flex-direction: column; gap: 10px; padding: 20px;">
                          <input type="email" name="email" placeholder="Seu e-mail" style="padding: 10px; border: 1px solid #ccc; border-radius: 4px;" required />
                          <button type="submit" style="padding: 10px; background-color: #d63031; color: white; border: none; border-radius: 4px; cursor: pointer;">Avise-me</button>
                          <div data-mxf-success style="display: none; color: green; text-align: center; margin-top: 10px;">Avisaremos você assim que chegar!</div>
                        </form>
                      `
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  }
];
