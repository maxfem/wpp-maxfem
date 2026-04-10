

## Problema Identificado

A screenshot mostra claramente o erro: **o Phone Number ID está incorreto**.

- **ID no painel da Meta**: `987940634413710`
- **ID configurado no backend**: `917327154791478` (do secret `WHATSAPP_PHONE_NUMBER_ID`)

A Edge Function `whatsapp-send` usa o ID errado na URL da Graph API, por isso a Meta retorna "Object with ID does not exist".

## Plano

1. **Atualizar o secret `WHATSAPP_PHONE_NUMBER_ID`** com o valor correto `987940634413710`
2. **Reenviar a mensagem de teste** para +55 21 99007-5486 usando o template `boas_vindas_01`

