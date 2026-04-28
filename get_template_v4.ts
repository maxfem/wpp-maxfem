const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const wabaId = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID");

const url = "https://graph.facebook.com/v22.0/" + wabaId + "/message_templates?name=pix_nao_pago_30min_v4";
const response = await fetch(url, {
  headers: { "Authorization": "Bearer " + accessToken }
});
const result = await response.json();
console.log(JSON.stringify(result, null, 2));
