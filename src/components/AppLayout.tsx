import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full relative overflow-hidden">
        {/* Decorative gradient blobs */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-[120px] animate-float" />
          <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-accent/10 blur-[120px] animate-float" style={{ animationDelay: "4s" }} />
        </div>

        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 z-10">
          <header className="h-14 flex items-center border-b border-border px-4 bg-card/50 backdrop-blur-md">
            <SidebarTrigger className="mr-4" />
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
