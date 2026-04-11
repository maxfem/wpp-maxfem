

# Configuração individual de IA por conversa

## Problema
Ao trocar de conversa, o estado do toggle da IA pode não refletir a configuração individual de cada contato — o estado de uma conversa "vaza" para outra.

## Solução
Garantir isolamento completo do estado do Copilot por conversa:

### Alterações em `src/components/chat/ContactInfoPanel.tsx`

1. **Resetar estado ao trocar de conversa** — adicionar `conversation?.phoneKey` como dependência do `useEffect` de carregamento (linha 109-120), e forçar reset dos estados locais (`aiEnabled`, `toneOverride`, `extraContext`, `suggestion`) sempre que `phoneKey` mudar

2. **Usar key no componente CopilotTab** — no `ContactInfoPanel`, passar uma `key` baseada no `phoneKey` da conversa para o `CopilotTab`, forçando React a destruir e recriar o componente ao trocar de conversa. Isso elimina qualquer estado residual

### Alteração em `src/pages/Chat.tsx`

3. **Passar phoneKey para o ContactInfoPanel** — garantir que o `ContactInfoPanel` receba o `phoneKey` atual para que possa ser usado como key do CopilotTab

## Resultado
- Cada conversa tem seu próprio estado de IA independente
- Trocar de conversa carrega as configurações corretas do contato
- Desativar a IA em uma conversa não afeta as demais

