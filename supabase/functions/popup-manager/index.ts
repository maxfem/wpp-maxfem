import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  if (path === "script") {
    const key = url.searchParams.get("key");
    const popupId = url.searchParams.get("id");
    
    if (!key && !popupId) return new Response("No identification provided", { status: 400 });

    let query = supabase.from("popups").select("*").eq("is_active", true);

    if (popupId) {
      query = query.eq("id", popupId);
    } else {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("pixel_public_key", key)
        .maybeSingle();

      if (!tenant) return new Response("Invalid key", { status: 401 });
      query = query.eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(1);
    }

    const { data: popup } = await query.maybeSingle();

    if (!popup) return new Response("// No active popup", { headers: { ...corsHeaders, "Content-Type": "application/javascript" } });

    // If mobile is missing or too small, fallback to desktop content (defense in depth)
    const desktopHtml = popup.html || "";
    let mobileHtml = popup.html_mobile || "";
    if (!mobileHtml.trim() || mobileHtml.length < 200) {
      mobileHtml = desktopHtml;
    }

    // The script will handle content selection (mobile vs desktop)
    const script = `
// Maxfem popup ${popup.id} — updated_at: ${popup.updated_at || ''}
(function() {
  if (window.__mxf_popup_loaded_${popup.id.replace(/-/g, '_')}) return;
  window.__mxf_popup_loaded_${popup.id.replace(/-/g, '_')} = true;

  const popupData = ${JSON.stringify({
    id: popup.id,
    html: desktopHtml,
    html_mobile: mobileHtml,
    settings: popup.settings || {},
    updated_at: popup.updated_at || null,
  })};

  try { console.info('[Maxfem popup]', popupData.id, 'updated_at:', popupData.updated_at); } catch(e){}

  function injectPopup() {
    if (document.getElementById('mxf-popup-container-' + popupData.id)) return;

    const container = document.createElement('div');
    container.id = 'mxf-popup-container-' + popupData.id;
    
    const pos = popupData.settings.position || 'center';
    let containerStyle = 'position: fixed; z-index: 999999; display: flex;';
    
    if (pos === 'center') {
      containerStyle += ' inset: 0; align-items: center; justify-content: center; background: rgba(0,0,0,0.5);';
    } else if (pos === 'bottom-right') {
      containerStyle += ' bottom: 20px; right: 20px;';
    } else if (pos === 'bottom-left') {
      containerStyle += ' bottom: 20px; left: 20px;';
    } else if (pos === 'top') {
      containerStyle += ' top: 0; left: 0; right: 0; justify-content: center;';
    }
    
    container.setAttribute('style', containerStyle);
    
    const popupContent = document.createElement('div');
    // Transparent wrapper — let the saved HTML control its own visual styling (background, radius, shadow)
    popupContent.style.position = 'relative';
    popupContent.style.maxWidth = '95vw';
    popupContent.style.maxHeight = '95vh';
    popupContent.style.overflow = 'auto';
    const isMobile = window.innerWidth <= 768;
    const content = (isMobile && popupData.html_mobile) ? popupData.html_mobile : popupData.html;
    
    // Detect only truly empty/missing content. Do NOT replace user-saved HTML even if it lacks common tags.
    let finalHtml = content;
    const isBroken = !finalHtml || !finalHtml.trim() ||
                    finalHtml.includes("missing-item") ||
                    finalHtml.includes("missing-container") ||
                    finalHtml.includes(">Missing<");

    if (isBroken) {
      try { console.warn('[Maxfem popup] Falling back to default — saved HTML was empty or broken for popup', popupData.id); } catch(e){}
      finalHtml = \`
        <style>.mxf-fallback{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:32px;max-width:380px;text-align:center;}
        .mxf-fallback h2{margin:0 0 8px;font-size:20px;color:#111;}.mxf-fallback p{margin:0 0 16px;color:#555;font-size:14px;}
        .mxf-fallback input{width:100%;padding:12px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;box-sizing:border-box;font-size:14px;}
        .mxf-fallback button{width:100%;padding:12px;background:#ED2B75;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:14px;}
        </style>
        <div class="mxf-fallback">
          <h2>Fique por dentro</h2>
          <p>Cadastre seu e-mail para receber novidades e ofertas exclusivas.</p>
          <form>
            <input type="email" name="email" placeholder="Seu melhor e-mail" required />
            <button type="submit">Quero receber</button>
            <div data-mxf-success style="display:none;color:#16a34a;margin-top:10px;">Obrigado! Cadastro confirmado.</div>
          </form>
        </div>\`;
    }

    popupContent.innerHTML = finalHtml;
    
    if (popupData.settings.showCloseButton !== false) {
      const closeX = document.createElement('div');
      closeX.innerHTML = '&times;';
      closeX.setAttribute('style', 'position: absolute; top: 10px; right: 10px; cursor: pointer; font-size: 24px; line-height: 1; color: #333; z-index: 1;');
      closeX.onclick = () => container.remove();
      popupContent.appendChild(closeX);
    }
    
    container.appendChild(popupContent);
    document.body.appendChild(container);

    if (popupData.settings.overlayClose !== false && pos === 'center') {
      container.onclick = (e) => {
        if (e.target === container) container.remove();
      };
    }

    const form = container.querySelector('form');
    if (form) {
      const phoneInput = form.querySelector('input[name="phone"], input[type="tel"]');
      if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
          let x = e.target.value.replace(/\\D/g, '').match(/(\\d{0,2})(\\d{0,5})(\\d{0,4})/);
          e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        });
      }

      form.onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn ? btn.innerText : '';
        if (btn) {
          btn.innerText = 'Enviando...';
          btn.disabled = true;
        }

        try {
          const res = await fetch('${url.origin}/functions/v1/popup-manager/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              popup_id: popupData.id,
              data: data,
              url: location.href
            })
          });
          
          if (res.ok) {
            const successMsg = container.querySelector('[data-mxf-success]');
            if (successMsg) {
              form.style.display = 'none';
              successMsg.style.display = 'block';
              setTimeout(() => container.remove(), 3000);
            } else {
              alert('Obrigado! Cadastro realizado com sucesso.');
              container.remove();
            }
          } else {
            alert('Erro ao salvar. Verifique os campos.');
          }
        } catch (err) {
          alert('Erro de conexão.');
        } finally {
          if (btn) {
            btn.innerText = originalText;
            btn.disabled = false;
          }
        }
      };
    }
  }

  const trigger = popupData.settings.trigger || 'timer';
  
  if (trigger === 'timer') {
    const delay = popupData.settings.delay || 2000;
    if (document.readyState === 'complete') {
      setTimeout(injectPopup, delay);
    } else {
      window.addEventListener('load', () => setTimeout(injectPopup, delay));
    }
  } else if (trigger === 'exit') {
    document.addEventListener('mouseleave', (e) => {
      if (e.clientY < 0) injectPopup();
    }, { once: true });
  } else if (trigger === 'scroll') {
    const threshold = popupData.settings.scrollPercentage || 50;
    const onScroll = () => {
      const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      if (scrollPercent >= threshold) {
        injectPopup();
        window.removeEventListener('scroll', onScroll);
      }
    };
    window.addEventListener('scroll', onScroll);
  }
})();
    `;

    return new Response(script, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  }

  if (path === "submit") {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    
    try {
      const { popup_id, data, url: pageUrl } = await req.json();
      
      const { data: popup } = await supabase
        .from("popups")
        .select("tenant_id, contact_list_id")
        .eq("id", popup_id)
        .single();
        
      if (!popup) throw new Error("Popup not found");

      const email = data.email?.trim().toLowerCase();
      const phone = data.phone?.replace(/\\D+/g, "");
      const name = data.name || data.nome || "";

      if (!email && !phone) throw new Error("Email or phone is required");

      // Try to find existing customer by email or phone within tenant
      let customerId: string | null = null;
      if (email) {
        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("tenant_id", popup.tenant_id)
          .eq("email", email)
          .maybeSingle();
        if (existing) customerId = existing.id;
      }
      if (!customerId && phone) {
        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("tenant_id", popup.tenant_id)
          .eq("phone", phone)
          .maybeSingle();
        if (existing) customerId = existing.id;
      }

      const customAttrs = {
        source: "popup",
        popup_id: popup_id,
        captured_at: new Date().toISOString(),
        page_url: pageUrl,
        ...data,
      };

      if (customerId) {
        const { error: uErr } = await supabase
          .from("customers")
          .update({
            name: name || undefined,
            email: email || undefined,
            phone: phone || undefined,
            is_lead: true,
            custom_attributes: customAttrs,
          })
          .eq("id", customerId);
        if (uErr) throw uErr;
      } else {
        const { data: created, error: iErr } = await supabase
          .from("customers")
          .insert({
            tenant_id: popup.tenant_id,
            email: email || null,
            phone: phone || null,
            name: name || (email ? email.split("@")[0] : "Lead"),
            is_lead: true,
            custom_attributes: customAttrs,
          })
          .select("id")
          .single();
        if (iErr) throw iErr;
        customerId = created.id;
      }

      const customer = { id: customerId };

      if (popup.contact_list_id) {
        await supabase
          .from("contact_list_members")
          .upsert({
            list_id: popup.contact_list_id,
            customer_id: customer.id
          }, { onConflict: "list_id,customer_id" });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      console.error("Submit error:", err);
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  return new Response("Not found", { status: 404 });
});
