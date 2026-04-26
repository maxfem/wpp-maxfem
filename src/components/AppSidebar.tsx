import {
  BarChart3,
  Users,
  Megaphone,
  FileText,
  Activity,
  MessageSquare,
  Settings,
  Store,
  ChevronDown,
  LogOut,
  Zap,
  List,
  Sparkles,
} from "lucide-react";
import logoMaxfem from "@/assets/logo-maxfem.png";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const monitorItems = [
  { title: "Indicadores", url: "/dashboard", icon: BarChart3 },
];

const planItems = [
  { title: "Campanhas", url: "/campaigns", icon: Megaphone },
  { title: "Automações", url: "/automations", icon: Zap },
  { title: "Templates", url: "/templates", icon: FileText },
];

const executeItems = [
  { title: "Atividades", url: "/activities", icon: Activity },
  { title: "Atendimento", url: "/atendimento", icon: MessageSquare },
];

const manageItems = [
  { title: "Clientes", url: "/customers", icon: Users },
  { title: "Listas", url: "/lists", icon: List },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, currentTenant, tenants, setCurrentTenant, signOut } = useAuth();

  const isActive = (path: string) => location.pathname.startsWith(path);

  const renderGroup = (label: string, items: typeof monitorItems) => (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neon-magenta/80">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActive(item.url);
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={active}>
                  <NavLink
                    to={item.url}
                    end={false}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 hover:bg-sidebar-accent ${
                      active
                        ? "bg-gradient-to-r from-primary/30 to-primary/10 border-l-[3px] border-neon-magenta text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground"
                    }`}
                    activeClassName=""
                  >
                    <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-neon-magenta" : ""}`} />
                    {!collapsed && <span>{item.title}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logoMaxfem} alt="Maxfem" className="h-8" />
          </div>
          {!collapsed && <ThemeToggle />}
        </div>
        {!collapsed && currentTenant && (
          <DropdownMenu>
            <DropdownMenuTrigger className="mt-3 flex w-full items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-2 text-left text-sm hover:bg-secondary transition-colors">
              <div className="flex items-center gap-2">
                <Store className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate font-medium">{currentTenant.name}</span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {tenants.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => setCurrentTenant(t)}
                  className={t.id === currentTenant.id ? "bg-accent/20" : ""}
                >
                  {t.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2">
        {renderGroup("Monitorar", monitorItems)}
        {renderGroup("Planejar", planItems)}
        {renderGroup("Executar", executeItems)}
        {renderGroup("Minha Loja", manageItems)}
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <NavLink
              to="/settings"
              className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              activeClassName="bg-sidebar-accent font-medium"
            >
              <Settings className="h-4 w-4" />
              <span>Configurações</span>
            </NavLink>
            <button
              onClick={signOut}
              className="rounded-lg p-2 text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              title="Sair"
              aria-label="Sair da conta"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
