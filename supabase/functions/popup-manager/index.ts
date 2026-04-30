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
    if (!key) return new Response("No key", { status: 400 });

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("pixel_public_key", key)
      .maybeSingle();

    if (!tenant) return new Response("Invalid key", { status: 401 });

    const { data: popup } = await supabase
      .from("popups")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!popup) return new Response("// No active popup", { headers: { ...corsHeaders, "Content-Type": "application/javascript" } });

    const script = `
(function() {
  if (window.__mxf_popup_loaded) return;
  window.__mxf_popup_loaded = true;

  const popupData = ${JSON.stringify({
    id: popup.id,
    html: popup.html,
    settings: popup.settings || {},
  })};

  function injectPopup() {
    const container = document.createElement('div');
    container.id = 'mxf-popup-container';
    container.innerHTML = popupData.html;
    document.body.appendChild(container);

    // Add close logic
    const closeBtn = container.querySelector('[data-mxf-close]');
    if (closeBtn) {
      closeBtn.onclick = () => container.remove();
    }

    // Add form logic
    const form = container.querySelector('form');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        const btn = form.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;

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
            // Success state - maybe replace form with success message if designer included it
            const successMsg = container.querySelector('[data-mxf-success]');
            if (successMsg) {
              form.style.display = 'none';
              successMsg.style.display = 'block';
            } else {
              alert('Obrigado! Cadastro realizado com sucesso.');
              container.remove();
            }
          } else {
            alert('Ocorreu um erro. Tente novamente.');
          }
        } catch (err) {
          console.error('Popup error:', err);
        } finally {
          if (btn) btn.disabled = false;
        }
      };
    }
  }

  // Simple trigger logic
  setTimeout(injectPopup, popupData.settings.delay || 1000);
})();
    `;

    return new Response(script, {
      headers: { ...corsHeaders, "Content-Type": "application/javascript" }
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

      // Normalize fields
      const email = data.email?.trim().toLowerCase();
      const phone = data.phone?.replace(/\D+/g, "");
      const name = data.name || data.nome || "";

      // Insert contact
      const { data: contact, error: cErr } = await supabase
        .from("contacts")
        .upsert({
          tenant_id: popup.tenant_id,
          email: email || null,
          phone: phone || null,
          name: name,
          source: "popup",
          metadata: { ...data, page_url: pageUrl }
        }, { onConflict: "tenant_id,email" })
        .select("id")
        .single();

      if (cErr) throw cErr;

      // Add to list if specified
      if (popup.contact_list_id) {
        await supabase
          .from("contact_list_members")
          .upsert({
            contact_list_id: popup.contact_list_id,
            contact_id: contact.id,
            tenant_id: popup.tenant_id
          }, { onConflict: "contact_list_id,contact_id" });
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
