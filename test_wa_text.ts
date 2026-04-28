const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
const phone = "5521990075486";

const payload = {
  messaging_product: "whatsapp",
  to: phone,
  type: "text",
  text: { body: "Teste Maxfem: Aqui está o seu código PIX: 00020101021226850014br.gov.bcb.pix013636f1165a-8b8a-4d7a-8f5c-283f5e5b6a7a52040000530398654041.005802BR5913NOME RECEBEDOR6008BRASILIA62070503***6304ABCD" }
};

const response = await fetch("https://graph.facebook.com/v22.0/" + phoneNumberId + "/messages", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + accessToken,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
});

const result = await response.json();
console.log(JSON.stringify(result, null, 2));
