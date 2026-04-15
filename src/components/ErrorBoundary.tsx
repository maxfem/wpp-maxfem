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
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground">Algo deu errado</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {this.state.error?.message || "Ocorreu um erro inesperado."}
          </p>
          <Button onClick={() => this.setState({ hasError: false, error: undefined })}>
            Tentar novamente
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
