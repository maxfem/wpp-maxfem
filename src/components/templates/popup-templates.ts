// Predefined HTML templates for popups.
// These are now optimized for GrapesJS and lead capture.

const MAXFEM_LOGO = "https://poukhwsbskcvwroeqoct.supabase.co/storage/v1/object/public/popup-assets/templates%2Fmaxfem-logo.png";
const MAXFEM_PRODUTOS = "https://poukhwsbskcvwroeqoct.supabase.co/storage/v1/object/public/popup-assets/templates%2Fmaxfem-produtos.jpg";

// E-com GPT — Maxfem 10% OFF (Desktop): layout 2 colunas, lado branco com formulário, lado rosa com selo + produtos
const ECOM_GPT_DESKTOP = `
<style>
  .ecg-d{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;display:flex;width:900px;max-width:95vw;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,.25);position:relative;}
  .ecg-d__left{flex:1;padding:48px 44px;display:flex;flex-direction:column;justify-content:center;background:#fff;position:relative;z-index:2;}
  .ecg-d__left::after{content:"";position:absolute;top:0;right:-40px;width:80px;height:100%;background:#fff;border-radius:50%/100%;z-index:1;}
  .ecg-d__logo{width:160px;margin-bottom:28px;}
  .ecg-d__title{font-size:34px;font-weight:800;color:#1f1f2e;line-height:1.15;margin:0 0 18px;letter-spacing:-.5px;}
  .ecg-d__title .pink{color:#ED2B75;font-size:42px;}
  .ecg-d__sub{font-size:15px;color:#555;line-height:1.5;margin:0 0 26px;}
  .ecg-d__sub .heart{color:#ED2B75;}
  .ecg-d__form{display:flex;flex-direction:column;gap:12px;position:relative;z-index:3;}
  .ecg-d__field{position:relative;}
  .ecg-d__field svg{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:#ED2B75;width:18px;height:18px;}
  .ecg-d__field input{width:100%;padding:14px 14px 14px 46px;border:1.5px solid #f0d8e3;border-radius:10px;font-size:14px;outline:none;background:#fff;color:#333;box-sizing:border-box;transition:border .2s;}
  .ecg-d__field input:focus{border-color:#ED2B75;}
  .ecg-d__btn{margin-top:6px;padding:16px;background:#ED2B75;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 8px 20px rgba(237,43,117,.35);transition:transform .15s;}
  .ecg-d__btn:hover{transform:translateY(-1px);}
  .ecg-d__safe{display:flex;align-items:flex-start;gap:8px;margin-top:14px;font-size:11.5px;color:#999;line-height:1.4;}
  .ecg-d__safe svg{flex-shrink:0;width:14px;height:14px;margin-top:2px;}
  .ecg-d__right{flex:1.05;background:linear-gradient(135deg,#FFE4EE 0%,#FFD0E0 100%);position:relative;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;}
  .ecg-d__badge{position:absolute;top:38px;left:50%;transform:translateX(-50%);background:#fff;border-radius:50%;width:170px;height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 10px 25px rgba(237,43,117,.2);text-align:center;z-index:2;}
  .ecg-d__badge .num{font-size:38px;font-weight:800;color:#ED2B75;line-height:1;letter-spacing:-1px;}
  .ecg-d__badge .lbl{font-size:11px;color:#1f1f2e;font-weight:600;margin-top:4px;letter-spacing:.5px;}
  .ecg-d__badge .pill{margin-top:8px;background:#ED2B75;color:#fff;padding:5px 12px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.5px;}
  .ecg-d__badge .heart{color:#ED2B75;font-size:14px;margin-top:6px;}
  .ecg-d__sparks{position:absolute;top:30px;right:calc(50% - 110px);color:#ED2B75;font-size:24px;font-weight:bold;z-index:2;}
  .ecg-d__produtos{width:100%;display:block;object-fit:cover;object-position:center bottom;max-height:380px;}
  .ecg-d__footer{position:absolute;bottom:0;left:0;right:0;background:#FFE4EE;display:flex;justify-content:space-around;padding:14px 20px;z-index:3;}
  .ecg-d__feat{display:flex;align-items:center;gap:8px;font-size:12px;color:#1f1f2e;font-weight:500;line-height:1.2;}
  .ecg-d__feat svg{color:#ED2B75;width:22px;height:22px;flex-shrink:0;}
  .ecg-d__close{position:absolute;top:18px;right:18px;width:34px;height:34px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,.15);z-index:10;border:none;}
  .ecg-d__close svg{width:14px;height:14px;color:#ED2B75;}
</style>
<div class="ecg-d">
  <div class="ecg-d__left">
    <img class="ecg-d__logo" src="${MAXFEM_LOGO}" alt="Maxfem" />
    <h2 class="ecg-d__title">Ganhe <span class="pink">10%</span> de <span class="pink">desconto</span> na sua primeira compra!</h2>
    <p class="ecg-d__sub">Cadastre-se e receba seu cupom exclusivo para cuidar de você! <span class="heart">💗</span></p>
    <form class="ecg-d__form">
      <div class="ecg-d__field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <input type="text" name="name" placeholder="Nome" required />
      </div>
      <div class="ecg-d__field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        <input type="email" name="email" placeholder="E-mail" required />
      </div>
      <div class="ecg-d__field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <input type="tel" name="phone" placeholder="WhatsApp (DDD + número)" required />
      </div>
      <button type="submit" class="ecg-d__btn">Quero meu desconto!</button>
      <div class="ecg-d__safe">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>Seus dados estão protegidos e não compartilhamos suas informações.</span>
      </div>
    </form>
  </div>
  <div class="ecg-d__right">
    <div class="ecg-d__badge">
      <div class="num">10%</div>
      <div class="lbl">DE DESCONTO</div>
      <div class="pill">NA 1ª COMPRA</div>
      <div class="heart">💗</div>
    </div>
    <div class="ecg-d__sparks">✦</div>
    <img class="ecg-d__produtos" src="${MAXFEM_PRODUTOS}" alt="Produtos Maxfem" />
    <div class="ecg-d__footer">
      <div class="ecg-d__feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-3.6 15.7-8.2 17.04z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg><span>Produtos de<br/>qualidade</span></div>
      <div class="ecg-d__feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg><span>Compra segura<br/>e protegida</span></div>
      <div class="ecg-d__feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>Feito para<br/>cuidar de você</span></div>
    </div>
  </div>
  <button class="ecg-d__close" type="button" onclick="this.closest('[id^=mxf-popup]').remove()" aria-label="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
</div>
`;

// E-com GPT — Maxfem 10% OFF (Mobile): layout vertical, fundo rosa claro, selo grande tracejado
const ECOM_GPT_MOBILE = `
<style>
  .ecg-m{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;width:380px;max-width:92vw;background:linear-gradient(180deg,#FFD9E6 0%,#FFE9F0 50%,#FFF0F5 100%);border-radius:22px;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,.3);position:relative;padding:30px 24px 0;}
  .ecg-m__close{position:absolute;top:16px;right:16px;width:32px;height:32px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,.15);z-index:10;border:none;}
  .ecg-m__close svg{width:14px;height:14px;color:#ED2B75;}
  .ecg-m__logo{display:block;margin:0 auto 18px;width:140px;}
  .ecg-m__badge{border:2px dashed #ED2B75;border-radius:18px;padding:14px 20px 18px;text-align:center;background:rgba(255,255,255,.35);position:relative;margin-bottom:14px;}
  .ecg-m__badge .pill-top{display:inline-block;background:#F5B9CD;color:#fff;padding:5px 22px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:8px;}
  .ecg-m__badge .num{font-size:78px;font-weight:800;color:#ED2B75;line-height:1;letter-spacing:-3px;display:inline-block;}
  .ecg-m__badge .sparks{color:#ED2B75;font-size:22px;font-weight:bold;display:inline-block;vertical-align:top;margin-top:8px;}
  .ecg-m__badge .lbl{font-size:18px;font-weight:800;color:#1f1f2e;letter-spacing:1px;margin-top:4px;}
  .ecg-m__pill-bottom{display:block;width:fit-content;margin:-10px auto 8px;background:#ED2B75;color:#fff;padding:8px 22px;border-radius:24px;font-size:13px;font-weight:700;letter-spacing:.5px;position:relative;z-index:2;}
  .ecg-m__heart{text-align:center;color:#ED2B75;font-size:18px;margin:4px 0 10px;}
  .ecg-m__sub{text-align:center;font-size:15px;color:#1f1f2e;line-height:1.4;margin:0 0 16px;font-weight:500;}
  .ecg-m__form{display:flex;flex-direction:column;gap:10px;}
  .ecg-m__field{position:relative;}
  .ecg-m__field svg{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:#ED2B75;width:18px;height:18px;}
  .ecg-m__field input{width:100%;padding:14px 14px 14px 46px;border:none;border-radius:12px;font-size:14px;outline:none;background:#fff;color:#333;box-sizing:border-box;box-shadow:0 2px 8px rgba(0,0,0,.05);}
  .ecg-m__btn{margin-top:6px;padding:16px;background:linear-gradient(135deg,#ED2B75 0%,#FF6BA1 100%);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 8px 18px rgba(237,43,117,.4);transition:transform .15s,box-shadow .15s;}
  .ecg-m__btn:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(237,43,117,.5);}
  .ecg-m__safe{display:flex;align-items:flex-start;gap:8px;margin:12px 8px 14px;font-size:11px;color:#888;line-height:1.4;text-align:center;justify-content:center;}
  .ecg-m__safe svg{flex-shrink:0;width:13px;height:13px;margin-top:2px;color:#888;}
  .ecg-m__produtos{width:calc(100% + 48px);margin:0 -24px;display:block;}
  .ecg-m__footer{background:rgba(255,255,255,.5);display:flex;justify-content:space-between;padding:12px 16px;margin:0 -24px;}
  .ecg-m__feat{display:flex;align-items:center;gap:6px;font-size:10.5px;color:#1f1f2e;font-weight:500;line-height:1.2;flex:1;justify-content:center;}
  .ecg-m__feat svg{color:#ED2B75;width:18px;height:18px;flex-shrink:0;}
</style>
<div class="ecg-m">
  <button class="ecg-m__close" type="button" onclick="this.closest('[id^=mxf-popup]').remove()" aria-label="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  <img class="ecg-m__logo" src="${MAXFEM_LOGO}" alt="Maxfem" />
  <div class="ecg-m__badge">
    <div class="pill-top">GANHE</div>
    <div><span class="num">10%</span><span class="sparks">✦</span></div>
    <div class="lbl">DE DESCONTO</div>
  </div>
  <div class="ecg-m__pill-bottom">NA SUA PRIMEIRA COMPRA!</div>
  <div class="ecg-m__heart">💗</div>
  <p class="ecg-m__sub">Cadastre-se e receba seu cupom<br/>exclusivo para cuidar de você! 💗</p>
  <form class="ecg-m__form">
    <div class="ecg-m__field">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <input type="text" name="name" placeholder="Nome" required />
    </div>
    <div class="ecg-m__field">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      <input type="email" name="email" placeholder="E-mail" required />
    </div>
    <div class="ecg-m__field">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      <input type="tel" name="phone" placeholder="WhatsApp (DDD + número)" required />
    </div>
    <button type="submit" class="ecg-m__btn">Quero meu desconto!</button>
  </form>
  <div class="ecg-m__safe">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    <span>Seus dados estão protegidos e<br/>não compartilhamos suas informações.</span>
  </div>
  <img class="ecg-m__produtos" src="${MAXFEM_PRODUTOS}" alt="Produtos Maxfem" />
  <div class="ecg-m__footer">
    <div class="ecg-m__feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-3.6 15.7-8.2 17.04z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg><span>Produtos de<br/>qualidade</span></div>
    <div class="ecg-m__feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg><span>Compra segura<br/>e protegida</span></div>
    <div class="ecg-m__feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>Feito para<br/>cuidar de você</span></div>
  </div>
</div>
`;

const TEMPLATES_DEF = [
  {
    name: "E-com GPT — Maxfem 10% OFF (Desktop)",
    html: ECOM_GPT_DESKTOP,
  },
  {
    name: "E-com GPT — Maxfem 10% OFF (Mobile)",
    html: ECOM_GPT_MOBILE,
  },
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
