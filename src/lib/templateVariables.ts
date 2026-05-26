export type TemplateVariable = { token: string; label: string; description: string };
export type TemplateVariableGroup = { label: string; variables: TemplateVariable[] };

// WhatsApp variables (used with prefixed format: customer.name, order.number, etc)
export const WHATSAPP_TEMPLATE_VARIABLES: TemplateVariableGroup[] = [
  {
    label: "Cliente",
    variables: [
      { token: "customer.first_name", label: "Primeiro nome", description: 'Ex: "Maria"' },
      { token: "customer.name", label: "Nome completo", description: 'Ex: "Maria da Silva"' },
      { token: "customer.phone", label: "Telefone", description: "Telefone cadastrado" },
      { token: "customer.email", label: "E-mail", description: "E-mail cadastrado" },
      { token: "customer.city", label: "Cidade", description: "Cidade do cliente" },
      { token: "customer.state", label: "Estado", description: "UF do cliente" },
    ],
  },
  {
    label: "Pedido",
    variables: [
      { token: "order.number", label: "Número do pedido", description: 'Ex: "#242127"' },
      { token: "order.total", label: "Total do pedido", description: 'Ex: "147,90"' },
      { token: "order.status", label: "Status do pedido", description: 'Ex: "pago"' },
      { token: "order.tracking_code", label: "Código de rastreio", description: "Busca no Bling se vazio" },
      { token: "order.delivery_days", label: "Dias de entrega", description: 'Default: "5 a 8"' },
      { token: "order.pix_code", label: "PIX copia-e-cola", description: "Código PIX gerado" },
    ],
  },
  {
    label: "Carrinho abandonado",
    variables: [
      { token: "cart.recovery_url", label: "Link recuperação", description: "URL pra retomar carrinho" },
      { token: "cart.value", label: "Valor", description: "Total dos itens" },
      { token: "cart.items_count", label: "Qtd. itens", description: "Número de produtos" },
    ],
  },
  {
    label: "Campanha",
    variables: [
      { token: "campaign.coupon", label: "Cupom", description: "Cupom da campanha" },
      { token: "campaign.discount", label: "Desconto", description: 'Ex: "20%"' },
      { token: "campaign.product_name", label: "Nome do produto", description: "Produto em destaque" },
    ],
  },
];

// Email + simple aliases (used in Maxfem-style templates)
export const EMAIL_TEMPLATE_VARIABLES: TemplateVariableGroup[] = [
  {
    label: "Cliente",
    variables: [
      { token: "primeiro_nome", label: "Primeiro nome", description: 'Ex: "Maria"' },
      { token: "nome", label: "Nome completo", description: 'Ex: "Maria da Silva"' },
      { token: "email", label: "E-mail", description: "E-mail cadastrado" },
      { token: "telefone", label: "Telefone", description: "Telefone cadastrado" },
    ],
  },
  {
    label: "Pedido",
    variables: [
      { token: "numero_pedido", label: "Número do pedido", description: 'Ex: "242127"' },
      { token: "valor_pedido", label: "Valor do pedido", description: 'Ex: "147,90"' },
      { token: "itens_pedido", label: "Itens", description: "Resumo dos produtos" },
      { token: "status_pedido", label: "Status", description: 'Ex: "pago"' },
      { token: "link_pedido", label: "Link do pedido", description: "URL do pedido" },
      { token: "link_pagamento", label: "Link de pagamento", description: "Pagar Pix/boleto" },
      { token: "codigo_pix", label: "Código PIX", description: "Copia-e-cola" },
    ],
  },
  {
    label: "Rastreio & Logística",
    variables: [
      { token: "codigo_rastreio", label: "Código de rastreio", description: 'Ex: "BLI_..."' },
      { token: "link_rastreio", label: "Link de rastreio", description: "rastreio.maxfem.com.br/{código}" },
      { token: "previsao_entrega", label: "Previsão de entrega", description: 'Ex: "19/05"' },
      { token: "transportadora", label: "Transportadora", description: 'Ex: "Loggi"' },
    ],
  },
  {
    label: "Nota Fiscal",
    variables: [
      { token: "link_nf_pdf", label: "Link NF PDF", description: "PDF da DANFE" },
      { token: "link_nf", label: "Link NF (HTML)", description: "Visualização Bling" },
      { token: "numero_nf", label: "Número da NF", description: 'Ex: "164463"' },
    ],
  },
  {
    label: "Carrinho & Campanha",
    variables: [
      { token: "link_carrinho", label: "Link recuperar carrinho", description: "Yampi simulate_url" },
      { token: "cupom", label: "Cupom", description: "Cupom da campanha" },
      { token: "valor_cashback", label: "Valor cashback", description: 'Saldo Yampi. Ex: "45,30"' },
      { token: "validade_cashback", label: "Validade", description: 'Data. Ex: "31/08/2026"' },
      { token: "dias_cashback", label: "Dias até expirar", description: 'Urgência. Ex: "7"' },
      { token: "link_cashback", label: "Link cashback", description: "URL pra usar" },
    ],
  },
];

// Combined for autocomplete in WhatsApp node panel (supports both prefixed and simple aliases)
export const ALL_TEMPLATE_VARIABLES: TemplateVariableGroup[] = [
  ...WHATSAPP_TEMPLATE_VARIABLES,
  ...EMAIL_TEMPLATE_VARIABLES.filter((g) => !["Cliente", "Pedido"].includes(g.label)),
];
