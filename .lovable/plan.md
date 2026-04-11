

# Botão de Salvamento para Toggle da IA

## Problema
O toggle da IA salva automaticamente ao mudar, mas o estado não persiste corretamente — volta a ficar ativado.

## Solução
Trocar o salvamento automático por um fluxo explícito com botão "Salvar". O toggle muda localmente, e o usuário clica em "Salvar configurações" para persistir no banco. Isso garante controle total e feedback claro.

## Alterações em `src/components/chat/ContactInfoPanel.tsx`

1. **Adicionar estado `dirty`** para rastrear mudanças não salvas (toggle, tom, contexto)
2. **Remover salvamento automático** do `onCheckedChange` do Switch, do `onValueChange` do Select de tom, e do `onBlur` do Textarea de contexto — todos passam a alterar apenas estado local
3. **Adicionar botão "Salvar configurações"** que salva `ai_enabled`, `ai_tone` e `ai_context` de uma vez com feedback visual (loading + toast de sucesso/erro)
4. **Indicador visual** de mudanças pendentes (botão fica destacado quando há alterações não salvas)

## Resultado
- Toggle muda localmente sem salvar
- Botão "Salvar configurações" persiste tudo no banco
- Feedback claro: botão desabilitado quando não há mudanças, loading durante salvamento
- Desativação da IA é forçada e persistida de forma confiável

