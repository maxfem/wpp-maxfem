export const NODE_PALETTE = {
  action: [
    { type: "sendWhatsApp", label: "Enviar WhatsApp", icon: "MessageCircle", color: "#22c55e", enabled: true },
    { type: "sendEmail", label: "Enviar E-mail", icon: "Mail", color: "#6366f1", enabled: false },
    { type: "sendSms", label: "Enviar SMS", icon: "MessageSquare", color: "#3b82f6", enabled: false },
    { type: "sendCall", label: "Ligação telefônica", icon: "Phone", color: "#f97316", enabled: false },
    { type: "sendWebhook", label: "Enviar Webhook", icon: "Globe", color: "#8b5cf6", enabled: false },
  ],
  logic: [
    { type: "condition", label: "Condição", icon: "GitBranch", color: "#eab308", enabled: true },
    { type: "multiCondition", label: "Condição múltipla", icon: "Network", color: "#eab308", enabled: true },
    { type: "randomizer", label: "Randomizador", icon: "Shuffle", color: "#eab308", enabled: true },
  ],
  time: [
    { type: "wait", label: "Aguardar", icon: "Clock", color: "#22c55e", enabled: true },
    { type: "waitCondition", label: "Aguardar condição", icon: "Timer", color: "#22c55e", enabled: true },
    { type: "waitDate", label: "Aguardar data e hora", icon: "CalendarClock", color: "#22c55e", enabled: true },
  ],
  chat: [
    { type: "archiveChat", label: "Arquivar conversa", icon: "Archive", color: "#64748b", enabled: true },
    { type: "transferChat", label: "Transferir conversa", icon: "ArrowRightLeft", color: "#64748b", enabled: true },
  ],
  advanced: [
    { type: "addTag", label: "Adicionar etiqueta", icon: "Tag", color: "#8b5cf6", enabled: true },
    { type: "removeTag", label: "Remover etiqueta", icon: "TagX", color: "#8b5cf6", enabled: true },
    { type: "exit", label: "Sair", icon: "LogOut", color: "#ef4444", enabled: true },
  ],
  extra: [
    { type: "note", label: "Nota", icon: "StickyNote", color: "#fbbf24", enabled: true },
  ],
} as const;

export type FlowNodeType = typeof NODE_PALETTE[keyof typeof NODE_PALETTE][number]["type"];
