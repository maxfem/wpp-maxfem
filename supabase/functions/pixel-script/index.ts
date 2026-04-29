// Serves the Maxfem pixel JS, with the tenant's public key embedded.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const COLLECT_ENDPOINT = `${SUPABASE_URL}/functions/v1/pixel-collect`;

function buildScript(key: string): string {
  return `/* Maxfem Pixel v1 */
(function(){
  if (window.__mxf_loaded) return; window.__mxf_loaded = true;
  var KEY = ${JSON.stringify(key)};
  var ENDPOINT = ${JSON.stringify(COLLECT_ENDPOINT)};
  var STORAGE_KEY = "mxf_vid";
  var SESSION_KEY = "mxf_sid";
  var COOKIE_DAYS = 365;

  function uuid(){ return ('10000000-1000-4000-8000-100000000000').replace(/[018]/g, function(c){
    return (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c/4)))).toString(16);
  }); }
  function setCookie(n,v,d){ var e=new Date(); e.setTime(e.getTime()+(d*86400000));
    document.cookie = n+"="+v+";expires="+e.toUTCString()+";path=/;SameSite=Lax"; }
  function getCookie(n){ var m=document.cookie.match('(^|;)\\\\s*'+n+'=([^;]+)'); return m?m[2]:null; }

  function getVid(){
    var v = getCookie(STORAGE_KEY);
    if (!v) { try { v = localStorage.getItem(STORAGE_KEY); } catch(e){} }
    if (!v) { v = uuid(); }
    setCookie(STORAGE_KEY, v, COOKIE_DAYS);
    try { localStorage.setItem(STORAGE_KEY, v); } catch(e){}
    return v;
  }
  function getSid(){
    var s = sessionStorage.getItem(SESSION_KEY);
    if (!s) { s = uuid(); sessionStorage.setItem(SESSION_KEY, s); }
    return s;
  }
  function parseUtm(){
    var p = new URLSearchParams(location.search);
    var u = {};
    ["source","medium","campaign","content","term"].forEach(function(k){
      var v = p.get("utm_"+k);
      if (v) u[k] = v;
    });
    return Object.keys(u).length ? u : null;
  }

  var VID = getVid();
  var SID = getSid();
  var queue = [];
  var flushTimer = null;

  function flush(useBeacon){
    if (queue.length === 0) return;
    var payload = {
      key: KEY,
      visitor_id: VID,
      session_key: SID,
      user_agent: navigator.userAgent,
      events: queue.splice(0, queue.length)
    };
    var data = JSON.stringify(payload);
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([data], { type: "application/json" }));
        return;
      }
      fetch(ENDPOINT, { method: "POST", headers: {"Content-Type":"application/json"}, body: data, keepalive: true }).catch(function(){});
    } catch(e){}
  }
  function schedule(){
    if (flushTimer) return;
    flushTimer = setTimeout(function(){ flushTimer = null; flush(false); }, 500);
  }
  function push(evt){
    evt.ts = Date.now();
    if (!evt.url) evt.url = location.href;
    if (!evt.referrer) evt.referrer = document.referrer || undefined;
    if (!evt.page_title) evt.page_title = document.title || undefined;
    var utm = parseUtm();
    if (utm) evt.utm = utm;
    queue.push(evt);
    schedule();
  }

  function track(name, props){
    if (name === "page" || name === "page_view") {
      push({ type: "page_view" });
    } else if (name === "identify") {
      push({ type: "identify", identify: props || {} });
    } else if (name === "product" || name === "view_item") {
      push({ type: "product_view", product: props || {} });
    } else if (name === "cart" || name === "add_to_cart") {
      push({ type: "add_to_cart", cart: props || {} });
    } else if (name === "checkout" || name === "begin_checkout") {
      push({ type: "checkout_started", cart: props || {}, url: (props && props.url) || location.href });
    } else if (name === "purchase") {
      push({ type: "purchase", order: props || {} });
    } else {
      push({ type: "custom", custom: Object.assign({ name: name }, props || {}) });
    }
  }

  // Process queued calls (mxf('init',...) etc.) made before script loaded
  var pre = window.mxf && window.mxf.q ? window.mxf.q : [];
  window.mxf = function(){ track.apply(null, arguments); };
  window.mxf.vid = VID;

  // Auto page_view
  push({ type: "page_view" });

  // SPA navigation
  var lastPath = location.href;
  function checkUrl(){
    if (location.href !== lastPath) {
      lastPath = location.href;
      push({ type: "page_view" });
    }
  }
  ["pushState","replaceState"].forEach(function(m){
    var orig = history[m];
    history[m] = function(){ var r = orig.apply(this, arguments); window.dispatchEvent(new Event("mxf:locationchange")); return r; };
  });
  window.addEventListener("popstate", checkUrl);
  window.addEventListener("mxf:locationchange", checkUrl);

  // Shopify auto-detection
  try {
    if (window.Shopify) {
      // Customer email if available
      var sCustomer = window.__st && window.__st.cid ? window.__st : null;
      if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta) {
        var meta = window.ShopifyAnalytics.meta;
        if (meta.product) {
          push({ type: "product_view", product: {
            id: String(meta.product.id),
            name: meta.product.variants && meta.product.variants[0] ? meta.product.variants[0].name : undefined,
            price: meta.product.variants && meta.product.variants[0] ? Number(meta.product.variants[0].price)/100 : undefined,
            image: meta.product.featured_image,
            url: location.href,
          }});
        }
      }
      if (window.ShopifyAnalytics && window.ShopifyAnalytics.lib && window.ShopifyAnalytics.lib.user) {
        try {
          var u = window.ShopifyAnalytics.lib.user();
          if (u && u.traits && u.traits.email) {
            push({ type: "identify", identify: { email: u.traits.email } });
          }
        } catch(e){}
      }
    }
  } catch(e){}

  // Replay pre-load queue
  pre.forEach(function(args){ try { track.apply(null, args); } catch(e){} });

  // Flush on unload
  window.addEventListener("pagehide", function(){ flush(true); });
  window.addEventListener("beforeunload", function(){ flush(true); });
  // Periodic flush
  setInterval(function(){ flush(false); }, 5000);
})();
`;
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";
  if (!key.startsWith("mxf_")) {
    return new Response("// invalid key", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/javascript; charset=utf-8" },
    });
  }
  return new Response(buildScript(key), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
});
