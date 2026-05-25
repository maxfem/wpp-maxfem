import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, ListFilter, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function CRMPlanner() {
  const { currentTenant } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Olá! Sou seu Gestor Sênior de Performance e CRM. Vamos construir uma segmentação estratégica hoje?\n\nMe conte:\n1. Qual o contexto de negócio?\n2. O objetivo da campanha?\n3. Se já tem uma hipótese inicial de público.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    const newMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Chamada direta via fetch (não supabase.functions.invoke) pra controlar timeout —
      // o invoke default aborta em ~30s, mas o LLM + tool calls + materialização
      // podem levar até 2min em listas grandes.
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
      const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || "";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000);

      const res = await fetch(`${supabaseUrl}/functions/v1/crm-planner`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: newMessages,
          tenant_id: currentTenant?.id,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const assistantMessage = data.choices?.[0]?.message?.content || "(resposta vazia)";
      setMessages([...newMessages, { role: "assistant", content: assistantMessage }]);
    } catch (error: any) {
      console.error("Error calling CRM Planner:", error);
      const msg = error.name === "AbortError"
        ? "A consulta demorou demais (>2min). A lista pode ter sido criada — recarregue /listas pra ver."
        : `Erro: ${error.message}`;
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-background/50 animate-fade-in">
        <header className="px-6 py-4 border-b bg-card/30 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg">
              <ListFilter className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Arquiteto de Listas CRM</h1>
              <p className="text-xs text-muted-foreground">Estrategista Sênior de Performance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <Sparkles className="h-4 w-4 text-primary animate-pulse" />
             <span className="text-xs font-medium text-primary">AI Powered</span>
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col p-4 md:p-6 gap-4">
          <Card className="flex-1 flex flex-col overflow-hidden border-border/50 bg-card/30 backdrop-blur-sm shadow-xl">
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-6 max-w-4xl mx-auto">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`flex gap-3 max-w-[85%] ${
                        m.role === "user" ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      <div className={`mt-1 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        m.role === "assistant" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        {m.role === "assistant" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                      </div>
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                          m.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/80 backdrop-blur-sm text-foreground"
                        }`}
                      >
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex gap-3 max-w-[85%]">
                      <div className="mt-1 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="rounded-2xl px-4 py-3 bg-muted/80 backdrop-blur-sm">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="p-4 border-t bg-card/50">
              <div className="max-w-4xl mx-auto flex gap-2">
                <Input
                  placeholder="Ex: Quero criar uma lista de clientes que não compram há 60 dias..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  className="flex-1 bg-background/50 border-border/50 focus-visible:ring-primary/50"
                  disabled={isLoading}
                />
                <Button onClick={handleSend} disabled={isLoading || !input.trim()} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground mt-2">
                O Arquiteto de CRM ajuda a planejar a lógica. Você poderá aplicar estas regras na seção de Listas.
              </p>
            </div>
          </Card>
        </main>
      </div>
    </AppLayout>
  );
}
