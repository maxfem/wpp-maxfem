// Helpers de formatação compartilhados pelos relatórios.

export const fmtMoney = (v: number) =>
  `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtMoneyShort = (v: number) => {
  const n = Number(v) || 0;
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 10_000) return `R$ ${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

export const fmtNumber = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export const fmtPct = (part: number, total: number) =>
  total > 0 ? `${((part / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "0%";

export const CHART_COLORS = ["#3B82F6", "#40E0D0", "#A855F7", "#1E5F8B", "#FF2D92", "#22c55e", "#f97316", "#eab308"];

// Rótulos amigáveis pra origem/canal e método de atribuição.
export const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  instagram: "Instagram",
  sms: "SMS",
  desconhecido: "Desconhecido",
};

export const METHOD_LABELS: Record<string, string> = {
  utm: "UTM (link da campanha)",
  click_window: "Clique (janela 72h)",
  last_touch_7d: "Último toque (7 dias)",
  indefinido: "Indefinido",
};

export const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");
export const methodLabel = (m: string) => METHOD_LABELS[m] ?? m;
