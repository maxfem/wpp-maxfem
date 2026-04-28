const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

const phone = "5521990075486";
const templateName = "pix_nao_pago_30min_code";

const payload = {
  messaging_product: "whatsapp",
  to: phone,
  type: "template",
  template: {
    name: templateName,
    language: { code: "pt_BR" }
  }
};

const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
});

const result = await response.json();
console.log(JSON.stringify(result, null, 2));
