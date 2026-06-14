import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// User agents que prefetcham o link pra gerar preview/snippet ou são crawlers.
// Esses NÃO são cliques humanos — não devem contar pra link_clicks nem
// disparar clicked_at em campaign_activities. Memória A3 audit Fable 5:
// 29,8% dos cliques em prod eram bot/preview, inflando o caminho click_window
// 72h de yampi-sync.attributeConversions.
const BOT_UA_PATTERN =
  /WhatsApp|facebookexternalhit|TelegramBot|Twitterbot|LinkedInBot|Slackbot|Discordbot|Googlebot|Bingbot|Applebot|YandexBot|DuckDuckBot|Baiduspider|bot|crawler|spider|preview|head|curl|wget|python-requests|HeadlessChrome|PhantomJS|Pingdom|UptimeRobot/i;

function isBotUserAgent(ua: string): boolean {
  if (!ua) return true; // sem UA = provavelmente cliente non-browser
  return BOT_UA_PATTERN.test(ua);
}

// Mapeia o utm_source do tracked_link pro channel das campaign_activities.
// Mantém o conjunto canônico do sistema (email | whatsapp | sms | instagram).
function utmSourceToChannel(utmSource: string | null | undefined): string | null {
  if (!utmSource) return null;
  const s = utmSource.trim().toLowerCase();
  if (s === "email") return "email";
  if (s === "whatsapp") return "whatsapp";
  if (s === "sms") return "sms";
  if (s === "instagram") return "instagram";
  return null; // canal externo (meta, google, etc) — não filtra aqui
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Support both /r/:code path and ?c=code query param
  const pathMatch = url.pathname.match(/\/r\/([A-Za-z0-9]+)$/);
  const code = pathMatch ? pathMatch[1] : url.searchParams.get("c");

  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: link, error } = await supabase
      .from("tracked_links")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !link) {
      return new Response("Link not found", { status: 404 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const userAgent = req.headers.get("user-agent") || "";
    const referer = req.headers.get("referer") || "";

    const isBot = isBotUserAgent(userAgent);

    // Redirect URL sempre é montada — bot ou humano. O que muda é se contamos
    // o clique ou não. Bot ainda recebe redirect (UX no preview do WhatsApp).
    const redirectUrl = new URL(link.original_url);
    if (link.utm_source) redirectUrl.searchParams.set("utm_source", link.utm_source);
    if (link.utm_medium) redirectUrl.searchParams.set("utm_medium", link.utm_medium);
    if (link.utm_campaign) redirectUrl.searchParams.set("utm_campaign", link.utm_campaign);
    if (link.utm_content) redirectUrl.searchParams.set("utm_content", link.utm_content);

    const respondRedirect = () =>
      new Response(null, {
        status: 302,
        headers: { Location: redirectUrl.toString() },
      });

    if (isBot) {
      // Não registra nada. Bot/preview redireciona sem deixar rastro.
      return respondRedirect();
    }

    // Registra clique humano em link_clicks
    await supabase.from("link_clicks").insert({
      link_id: link.id,
      ip,
      user_agent: userAgent,
      referer,
    });

    // Atualiza clicked_at na activity ESPECÍFICA do canal do link.
    // Antes do A3, o UPDATE não filtrava por canal — clique no link do
    // WhatsApp também marcava a activity de email como clicada, vazando
    // atribuição cross-channel.
    if (link.campaign_id && link.customer_id) {
      const now = new Date().toISOString();
      const channel = utmSourceToChannel(link.utm_source);

      let updateQuery = supabase
        .from("campaign_activities")
        .update({
          clicked_at: now,
          read_at: now, // click implica read
          status: "clicked",
        })
        .eq("campaign_id", link.campaign_id)
        .eq("customer_id", link.customer_id)
        .is("clicked_at", null);

      if (channel) {
        updateQuery = updateQuery.eq("channel", channel);
      }

      await updateQuery;
    }

    return respondRedirect();
  } catch (err) {
    console.error("link-redirect error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
