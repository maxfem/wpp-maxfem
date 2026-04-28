const accessToken = "";
const phoneNumberId = "987940634413710";
const phone = "5521990075486";
const templateName = "pix_nao_pago_30min_code";

const send = async (params: any[]) => {
  const payload: any = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: "pt_BR" }
    }
  };
  if (params.length > 0) {
    payload.template.components = [{
      type: "body",
      parameters: params
    }];
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return await response.json();
};

console.log("Testing with 1 param...");
console.log(JSON.stringify(await send([{ type: "text", text: "TESTE-CODE-123" }]), null, 2));
