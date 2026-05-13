import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

function isChunkLoadError(error?: Error): boolean {
  if (!error) return false;
  const msg = `${error.name} ${error.message}`.toLowerCase();
  return (
    msg.includes("chunkloaderror") ||
    msg.includes("loading chunk") ||
    msg.includes("dynamically imported module") ||
    msg.includes("failed to fetch dynamically imported module")
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    // Chunk de build antigo no cache (clássico pós-deploy do Vercel): recarrega 1x sozinho
    if (isChunkLoadError(error) && !sessionStorage.getItem("chunk-reloaded")) {
      sessionStorage.setItem("chunk-reloaded", "1");
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const chunkError = isChunkLoadError(this.state.error);
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground">
            {chunkError ? "Versão desatualizada" : "Algo deu errado"}
          </h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {chunkError
              ? "O app foi atualizado. Recarregue a página para pegar a versão nova."
              : this.state.error?.message || "Ocorreu um erro inesperado."}
          </p>
          {chunkError ? (
            <Button onClick={() => { sessionStorage.removeItem("chunk-reloaded"); window.location.reload(); }}>
              Recarregar página
            </Button>
          ) : (
            <Button onClick={() => this.setState({ hasError: false, error: undefined })}>
              Tentar novamente
            </Button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
