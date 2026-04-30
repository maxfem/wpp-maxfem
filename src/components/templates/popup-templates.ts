// Predefined HTML templates for popups.
// These are now optimized for GrapesJS and lead capture.

const TEMPLATES_DEF = [
  {
    name: "Newsletter Elegante",
    html: `
      <div style="padding: 40px; text-align: center; font-family: 'Inter', sans-serif; background-color: #ffffff; border-radius: 12px;">
        <h2 style="margin-bottom: 12px; font-size: 24px; color: #111;">Fique por dentro!</h2>
        <p style="margin-bottom: 24px; color: #666; font-size: 16px;">Receba nossas melhores ofertas e novidades diretamente no seu e-mail.</p>
        <form style="display: flex; flex-direction: column; gap: 12px; max-width: 320px; margin: 0 auto;">
          <input type="text" name="name" placeholder="Seu nome completo" style="padding: 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none;" required />
          <input type="email" name="email" placeholder="Seu melhor e-mail" style="padding: 14px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; outline: none;" required />
          <button type="submit" style="padding: 14px; background-color: #ED2B75; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: background-color 0.2s;">Inscrever-se Agora</button>
        </form>
        <p style="margin-top: 16px; font-size: 12px; color: #999;">Prometemos não enviar spam.</p>
      </div>`
  },
  {
    name: "Cupom de Boas-vindas",
    html: `
      <div style="padding: 0; display: flex; overflow: hidden; border-radius: 12px; max-width: 600px; background-color: #ffffff;">
        <div style="flex: 1; padding: 40px; font-family: 'Inter', sans-serif;">
          <h2 style="margin-bottom: 8px; font-size: 28px; color: #ED2B75; font-weight: 800;">10% OFF</h2>
          <h3 style="margin-bottom: 12px; font-size: 20px; color: #111;">Na sua primeira compra!</h3>
          <p style="margin-bottom: 24px; color: #666; line-height: 1.5;">Cadastre-se para receber seu cupom exclusivo e economizar hoje mesmo.</p>
          <form style="display: flex; flex-direction: column; gap: 12px;">
            <input type="email" name="email" placeholder="Seu e-mail" style="padding: 14px; border: 1px solid #e2e8f0; border-radius: 8px; outline: none;" required />
            <button type="submit" style="padding: 14px; background-color: #111; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Quero meu Desconto</button>
          </form>
        </div>
      </div>`
  },
  {
    name: "Captura WhatsApp (VIP)",
    html: `
      <div style="padding: 40px; text-align: center; font-family: 'Inter', sans-serif; background-color: #f0fff4; border: 2px solid #25d366; border-radius: 16px;">
        <div style="background-color: #25d366; width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
           <svg viewBox="0 0 24 24" width="32" height="32" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .004 5.412.001 12.049c0 2.123.554 4.197 1.607 6.037L0 24l6.105-1.602a11.834 11.834 0 005.937 1.598h.005c6.637 0 12.048-5.414 12.051-12.051a11.818 11.818 0 00-3.52-8.513z"/></svg>
        </div>
        <h2 style="margin-bottom: 8px; font-size: 22px; color: #111;">Lista VIP no WhatsApp</h2>
        <p style="margin-bottom: 24px; color: #444;">Receba promoções relâmpago antes de todo mundo diretamente no seu celular.</p>
        <form style="display: flex; flex-direction: column; gap: 12px; max-width: 320px; margin: 0 auto;">
          <input type="text" name="name" placeholder="Seu nome" style="padding: 14px; border: 1px solid #c6f6d5; border-radius: 8px; outline: none;" required />
          <input type="tel" name="phone" placeholder="(00) 00000-0000" style="padding: 14px; border: 1px solid #c6f6d5; border-radius: 8px; outline: none;" required />
          <button type="submit" style="padding: 14px; background-color: #25d366; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Entrar na Lista VIP</button>
        </form>
      </div>`
  },
  {
    name: "Aviso de Frete Grátis",
    html: `
      <div style="padding: 30px; text-align: center; font-family: 'Inter', sans-serif; background-color: #111; color: white; border-radius: 8px;">
        <div style="font-size: 40px; margin-bottom: 10px;">🚚</div>
        <h2 style="margin-bottom: 8px; font-size: 20px; text-transform: uppercase; letter-spacing: 1px;">Frete Grátis Liberado!</h2>
        <p style="margin-bottom: 20px; color: #ccc; font-size: 14px;">Para compras acima de R$ 199. Não perca essa oportunidade.</p>
        <form style="display: flex; gap: 10px; justify-content: center;">
          <input type="email" name="email" placeholder="Seu e-mail" style="padding: 12px; border: none; border-radius: 4px; flex: 1; min-width: 200px;" required />
          <button type="submit" style="padding: 12px 20px; background-color: #ED2B75; color: white; border: none; border-radius: 4px; font-weight: 600; cursor: pointer;">Ativar Agora</button>
        </form>
      </div>`
  },
  {
    name: "Sair da Página? (Exit Intent)",
    html: `
      <div style="padding: 40px; text-align: center; font-family: 'Inter', sans-serif; background-color: #fff; border-top: 6px solid #ED2B75; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);">
        <h2 style="margin-bottom: 12px; font-size: 26px; color: #111;">Já vai embora?</h2>
        <p style="margin-bottom: 24px; color: #666; font-size: 16px;">Não vá sem antes garantir um presente especial que separamos para você.</p>
        <form style="display: flex; flex-direction: column; gap: 12px; max-width: 320px; margin: 0 auto;">
          <input type="email" name="email" placeholder="Seu e-mail principal" style="padding: 14px; border: 1px solid #e2e8f0; border-radius: 8px; outline: none;" required />
          <button type="submit" style="padding: 14px; background-color: #ED2B75; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Quero meu Presente</button>
          <button type="button" onclick="this.closest('[id^=mxf-popup]').remove()" style="background: none; border: none; color: #999; font-size: 13px; cursor: pointer; margin-top: 8px;">Não, obrigado. Prefiro pagar o valor cheio.</button>
        </form>
      </div>`
  },
];

export const POPUP_TEMPLATES = TEMPLATES_DEF.map(t => ({
  name: t.name,
  html: t.html,
  design: null, // GrapesJS will use HTML directly if design is null
}));

export const DEFAULT_POPUP_HTML = TEMPLATES_DEF[1].html;
