import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Search,
  HelpCircle,
  CheckCircle2,
  Lightbulb,
  AlertTriangle,
  Rocket,
  BarChart3,
  Megaphone,
  Zap,
  Layout,
  FileText,
  Sparkles,
  MessageSquare,
  Mail,
  Radar,
  Users,
  List,
  Activity,
  Plug,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { FAQ_CATEGORIES, FAQ_TOTAL_ENTRIES, type FaqEntry } from "@/data/faqContent";

const ICON_MAP: Record<string, LucideIcon> = {
  Rocket,
  BarChart3,
  Megaphone,
  Zap,
  Layout,
  FileText,
  Sparkles,
  MessageSquare,
  Mail,
  Radar,
  Users,
  List,
  Activity,
  Plug,
  Settings: SettingsIcon,
  AlertTriangle,
};

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const q = query.trim();
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="bg-primary/20 text-primary-foreground rounded px-0.5">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function EntryBlock({ entry, query }: { entry: FaqEntry; query: string }) {
  return (
    <AccordionItem value={entry.id} id={entry.id} className="border rounded-lg px-4 mb-2 bg-card">
      <AccordionTrigger className="text-left hover:no-underline py-4">
        <span className="font-medium">{highlight(entry.question, query)}</span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pb-4">
        {entry.answer && (
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
            {highlight(entry.answer, query)}
          </p>
        )}

        {entry.steps && entry.steps.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Passo a passo
            </h4>
            <ol className="space-y-1.5 text-sm">
              {entry.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{highlight(step, query)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {entry.tips && entry.tips.length > 0 && (
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>Dicas</AlertTitle>
            <AlertDescription>
              <ul className="space-y-1 mt-1.5 text-sm">
                {entry.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>{highlight(tip, query)}</span>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {entry.troubleshoot && entry.troubleshoot.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Problemas comuns
            </h4>
            <div className="space-y-2">
              {entry.troubleshoot.map((t, i) => (
                <div key={i} className="border-l-2 border-amber-500/50 pl-3 py-1">
                  <p className="text-sm font-medium">{highlight(t.problem, query)}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">→ {highlight(t.solution, query)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export default function Faq() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("");

  const matchesQuery = (entry: FaqEntry, q: string): boolean => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    const haystack = [
      entry.question,
      entry.answer,
      ...(entry.steps ?? []),
      ...(entry.tips ?? []),
      ...(entry.troubleshoot ?? []).flatMap((t) => [t.problem, t.solution]),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  };

  const filteredCategories = useMemo(() => {
    return FAQ_CATEGORIES.map((cat) => ({
      ...cat,
      entries: cat.entries.filter((e) => matchesQuery(e, query)),
    })).filter((cat) => cat.entries.length > 0 && (!activeCategory || cat.id === activeCategory));
  }, [query, activeCategory]);

  const totalFiltered = filteredCategories.reduce((s, c) => s + c.entries.length, 0);

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-6 max-w-5xl mx-auto w-full">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Central de Ajuda</h1>
          </div>
          <p className="text-muted-foreground">
            {FAQ_TOTAL_ENTRIES} perguntas frequentes pra dominar o Maxfem CRM.
            Use a busca pra encontrar rápido.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar... ex: 'carrinho abandonado', 'template rejeitado', 'pix'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
          {query && (
            <Badge variant="secondary" className="absolute right-3 top-1/2 -translate-y-1/2">
              {totalFiltered} resultado{totalFiltered !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge
            variant={!activeCategory ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setActiveCategory("")}
          >
            Todas ({FAQ_TOTAL_ENTRIES})
          </Badge>
          {FAQ_CATEGORIES.map((cat) => {
            const Icon = ICON_MAP[cat.icon] || HelpCircle;
            return (
              <Badge
                key={cat.id}
                variant={activeCategory === cat.id ? "default" : "outline"}
                className="cursor-pointer gap-1"
                onClick={() => setActiveCategory(activeCategory === cat.id ? "" : cat.id)}
              >
                <Icon className="h-3 w-3" />
                {cat.title} ({cat.entries.length})
              </Badge>
            );
          })}
        </div>

        {filteredCategories.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nada encontrado pra "{query}".</p>
              <p className="text-xs mt-1">
                Tenta termos mais curtos ou{" "}
                <button
                  onClick={() => setQuery("")}
                  className="text-primary hover:underline"
                >
                  limpa a busca
                </button>
                .
              </p>
            </CardContent>
          </Card>
        )}

        {filteredCategories.map((cat) => {
          const Icon = ICON_MAP[cat.icon] || HelpCircle;
          return (
            <section key={cat.id} id={cat.id} className="space-y-3">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  {cat.title}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">{cat.description}</p>
              </div>
              <Accordion type="multiple" className="space-y-2">
                {cat.entries.map((entry) => (
                  <EntryBlock key={entry.id} entry={entry} query={query} />
                ))}
              </Accordion>
            </section>
          );
        })}

        <Card className="mt-8 bg-muted/30">
          <CardHeader>
            <CardTitle className="text-base">Não achou o que procura?</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Pede ajuda no canal #crm-suporte do WhatsApp do time ou abre uma task no
              ClickUp pra Thiago.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
