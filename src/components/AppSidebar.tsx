import {
  BarChart3,
  Users,
  Megaphone,
  Activity,
  MessageSquare,
  Settings,
  Store,
  ChevronDown,
  LogOut,
  Layers,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
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
  { title: "Templates", url: "/templates", icon: FileText },
];

const executeItems = [
  { title: "Atividades", url: "/activities", icon: Activity },
  { title: "Atendimento", url: "/chat", icon: MessageSquare },
];

const manageItems = [
  { title: "Clientes", url: "/customers", icon: Users },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, currentTenant, tenants, setCurrentTenant, signOut } = useAuth();

  const isActive = (path: string) => location.pathname.startsWith(path);

  const renderGroup = (label: string, items: typeof monitorItems) => (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={isActive(item.url)}>
                <NavLink
                  to={item.url}
                  end={false}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent"
                  activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Layers className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight text-foreground">
              Martz
            </span>
          )}
        </div>
        {!collapsed && currentTenant && (
          <DropdownMenu>
            <DropdownMenuTrigger className="mt-3 flex w-full items-center justify-between rounded-md border border-border bg-secondary/50 px-3 py-2 text-left text-sm hover:bg-secondary">
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
                  className={t.id === currentTenant.id ? "bg-accent" : ""}
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
              className="flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
              activeClassName="bg-sidebar-accent font-medium"
            >
              <Settings className="h-4 w-4" />
              <span>Configurações</span>
            </NavLink>
            <button
              onClick={signOut}
              className="rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
