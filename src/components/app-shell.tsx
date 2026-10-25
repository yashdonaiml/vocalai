import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComponentType, ReactNode } from "react";
import { AvirohLogo, AvirohMark } from "@/components/logo";
import {
  Bot,
  BookOpen,
  MessagesSquare,
  KeyRound,
  Gauge,
  LogOut,
  Rocket,
  Wrench,
  LayoutDashboard,
  FlaskConical,
  Users,
  Search,
  Bell,
  Phone,
  Radio,
  BarChart3,
  ChevronsUpDown,
  Boxes,
  GitBranch,
  ShieldCheck,
  Braces,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceContext } from "@/lib/workspace";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

type Tab = {
  to:
    | "/overview"
    | "/agents"
    | "/knowledge"
    | "/tools"
    | "/workflows"
    | "/evals"
    | "/deployments"
    | "/environments"
    | "/telephony"
    | "/live-sessions"
    | "/conversations"
    | "/callbacks"
    | "/analytics"
    | "/usage"
    | "/models"
    | "/team"
    | "/security"
    | "/developer";
  label: string;
  icon: ComponentType<{ className?: string }>;
};
const groups: { label: string; tabs: Tab[] }[] = [
  { label: "", tabs: [{ to: "/overview", label: "Overview", icon: LayoutDashboard }] },
  {
    label: "Build",
    tabs: [
      { to: "/agents", label: "Agents", icon: Bot },
      { to: "/knowledge", label: "Knowledge", icon: BookOpen },
      { to: "/tools", label: "Integrations", icon: Wrench },
      { to: "/workflows", label: "Workflows", icon: GitBranch },
      { to: "/evals", label: "Evals", icon: FlaskConical },
    ],
  },
  {
    label: "Deploy",
    tabs: [
      { to: "/deployments", label: "Deployments", icon: Rocket },
      { to: "/environments", label: "Environments", icon: Boxes },
      { to: "/telephony", label: "Telephony", icon: Phone },
    ],
  },
  {
    label: "Operate",
    tabs: [
      { to: "/live-sessions", label: "Live sessions", icon: Radio },
      { to: "/conversations", label: "Conversations", icon: MessagesSquare },
      { to: "/callbacks", label: "Callback requests", icon: Phone },
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Manage",
    tabs: [
      { to: "/usage", label: "Usage", icon: Gauge },
      { to: "/models", label: "Providers", icon: KeyRound },
      { to: "/team", label: "Team", icon: Users },
      { to: "/security", label: "Security", icon: ShieldCheck },
      { to: "/developer", label: "Developer", icon: Braces },
    ],
  },
];

const usageQuery = (ws: string) =>
  queryOptions({
    queryKey: ["shell-usage", ws],
    queryFn: async () => {
      const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { data, error } = await supabase
        .from("usage_events")
        .select("quantity")
        .eq("workspace_id", ws)
        .eq("kind", "voice_minutes")
        .gte("created_at", since)
        .limit(5000);
      if (error) throw error;
      return (data ?? []).reduce((a, u) => a + Number(u.quantity), 0);
    },
  });

function AppSidebar({ onSignOut }: { onSignOut: () => void }) {
  const { workspace: ws, workspaces, selectWorkspace } = useWorkspaceContext();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { data: minutes = 0 } = useQuery(usageQuery(ws.id));
  const initials = (ws.org_name || ws.name).slice(0, 2).toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="justify-center gap-3 px-3 py-3">
        <Link to="/overview" aria-label="aviroh home">
          {collapsed ? <AvirohMark /> : <AvirohLogo />}
        </Link>
        {!collapsed && (
          <Select value={ws.id} onValueChange={selectWorkspace}>
            <SelectTrigger
              className="h-auto border-sidebar-border bg-sidebar-accent/50 px-3 py-2 text-left shadow-none"
              aria-label="Select workspace"
            >
              <SelectValue>
                <span className="block min-w-0">
                  <span className="block truncate text-xs font-medium">{ws.org_name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {ws.name}
                  </span>
                </span>
              </SelectValue>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.org_name} / {workspace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g, i) => (
          <SidebarGroup key={i} className="py-1">
            {g.label && (
              <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">
                {g.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.tabs.map((t) => {
                  const active = path === t.to || path.startsWith(`${t.to}/`);
                  return (
                    <SidebarMenuButton
                      key={t.to}
                      asChild
                      isActive={active}
                      tooltip={t.label}
                      className="h-8 text-[13px] text-muted-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-foreground data-[active=true]:[&>svg]:text-primary"
                    >
                      <Link to={t.to}>
                        <t.icon className="h-4 w-4" />
                        <span>{t.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-2 p-3">
        {!collapsed && (
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Usage this month</p>
            <p className="mt-0.5 font-mono text-sm font-semibold">{minutes.toFixed(0)} min</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              Recorded voice minutes this month
            </p>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 rounded-md p-1">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                {initials}
              </span>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{ws.org_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{ws.name}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onSignOut}
                    aria-label="Sign out"
                    className="h-8 w-8 text-muted-foreground"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { environment, environments, selectEnvironment } = useWorkspaceContext();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar onSignOut={signOut} />
        <SidebarInset className="bg-background">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4">
            <SidebarTrigger className="text-muted-foreground" />
            <label className="relative hidden max-w-sm flex-1 sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
              <input
                type="search"
                placeholder="Search agents, calls, knowledge…"
                className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-3 text-sm placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <div className="ml-auto flex items-center gap-1">
              {environment && (
                <Select value={environment.id} onValueChange={selectEnvironment}>
                  <SelectTrigger
                    className="mr-1 hidden h-8 w-36 bg-card text-xs shadow-none sm:flex"
                    aria-label="Select environment"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {environments.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} ({item.kind})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Notifications"
                className="h-8 w-8 text-muted-foreground"
              >
                <Bell className="h-4 w-4" />
              </Button>
              <ThemeToggle />
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
