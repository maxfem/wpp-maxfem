INSERT INTO message_templates (
  tenant_id,
  name,
  subject,
  preview_text,
  body_html,
  body_text,
  channel,
  status,
  body,
  created_at,
  updated_at
) VALUES (
  'a0000001-0000-0000-0000-000000000001'::uuid,
  'dia_das_maes_imunofem_99',
  $sub$Dia das Mães · Imunofem por R$ 99 (-41%)$sub$,
  $pre$Imunofem por R$ 99 só esse Dia das Mães · cuide dela por dentro$pre$,
  $html$
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Maxfem · Dia das Mães · Imunofem por R$ 99</title>
</head>
<body style="margin: 0; padding: 0; font-family: sans-serif; background-color: #f4f4f4;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px;">
    <h1 style="color: #333;">Edição Dia das Mães · Imunofem</h1>
    <p><strong>O presente que cuida dela por dentro</strong></p>
    <p>Saúde íntima, imunidade e equilíbrio numa cápsula só. Por um preço que ela vai amar receber.</p>
    
    <div style="background-color: #fff5f5; border: 1px solid #feb2b2; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
      <h2 style="margin: 0; color: #c53030;">Promoção Dia das Mães</h2>
      <p style="text-decoration: line-through; color: #718096; margin: 5px 0;">de R$ 169,00</p>
      <p style="font-size: 32px; font-weight: bold; color: #c53030; margin: 5px 0;">R$ 99</p>
      <p style="color: #2f855a; font-weight: bold;">Você economiza R$ 70,00 (41% OFF)</p>
      <a href="https://maxfem.com.br/imunofem?utm_source=email&utm_medium=crm&utm_campaign=dia-das-maes-99&utm_content=hero" style="display: inline-block; background-color: #c53030; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">Garantir agora por R$ 99</a>
      <p style="font-size: 12px; color: #718096; margin-top: 10px;">Oferta válida até o Dia das Mães · estoque limitado</p>
    </div>

    <h2>Toda mãe merece se sentir bem por dentro</h2>
    <p>Imunofem é o suplemento #1 em saúde íntima feminina do Brasil. Probióticos premium + cranberry que reequilibram a flora íntima, fortalecem a imunidade e combatem candidíase recorrente.</p>
    
    <div style="text-align: center;">
      <img src="https://brandbook-maxfem.vercel.app/assets/produtos/imunofem.jpg" alt="Imunofem · 60 cápsulas" style="max-width: 100%; height: auto;">
    </div>

    <h3>O que o Imunofem faz por ela</h3>
    <ul>
      <li><strong>Reequilibra a flora íntima</strong> com probióticos premium</li>
      <li><strong>Combate candidíase recorrente</strong> e infecções urinárias</li>
      <li><strong>Fortalece a imunidade</strong> · 70% nasce no intestino</li>
      <li>Apenas <strong>1 cápsula por dia</strong> · sabor neutro · uso contínuo</li>
      <li><strong>Frete grátis</strong> em pedidos acima de R$ 150</li>
    </ul>

    <div style="text-align: center; margin: 30px 0;">
      <h2>Mãe é quem cuida. <em>Cuide dela.</em></h2>
      <p>Esse Dia das Mães, dê algo que ela vai usar todo dia. Pedido finaliza em 2 minutos.</p>
      <a href="https://maxfem.com.br/imunofem?utm_source=email&utm_medium=crm&utm_campaign=dia-das-maes-99&utm_content=cta2" style="display: inline-block; background-color: #c53030; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Comprar Imunofem por R$ 99</a>
    </div>

    <p style="color: #4a5568; font-size: 14px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
      <strong>P.S.</strong> Esse preço é exclusivo do Dia das Mães. Depois volta pros R$ 169 normais. Garante agora — estoque limitado.<br>
      Frete pra todo Brasil. Compra 100% segura. Garantia de qualidade Maxfem.<br>
      — Equipe Maxfem
    </p>
  </div>
</body>
</html>
$html$,
  $txt$Imunofem por R$ 99 só esse Dia das Mães. O presente que cuida dela por dentro. Garante: https://maxfem.com.br/imunofem?utm_source=email&utm_medium=crm&utm_campaign=dia-das-maes-99$txt$,
  'email',
  'active',
  '',
  now(),
  now()
);