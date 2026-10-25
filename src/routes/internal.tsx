import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStaffRole } from "@/lib/internal.functions";
import { AvirohMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { GlassCard } from "@/components/apple";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/internal")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { redirect: location.pathname } });
  },
  head: () => ({ meta: [
    { title: "Internal operations: VocollAI" }, { name: "description", content: "Staff-only platform operations for aviroh." },
    { property: "og:title", content: "Internal operations: VocollAI" }, { property: "og:description", content: "Staff-only platform operations for aviroh." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: InternalLayout,
});

const tabs = [
  { to: "/internal", label: "Health" },
  { to: "/internal/incidents", label: "Incidents" },
  { to: "/internal/orgs", label: "Organizations" },
  { to: "/internal/access", label: "Support access" },
  { to: "/internal/audit", label: "Audit" },
] as const;

export function useStaffRole() {
  const fn = useServerFn(getStaffRole);
  return useQuery({ queryKey: ["internal-role"], queryFn: () => fn(), staleTime: 60_000 });
}

function InternalLayout() {
  const { data, isLoading } = useStaffRole();
  const path = useRouterState({ select: (r) => r.location.pathname });
  if (isLoading) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Checking access…</div>;
  if (!data?.role) return (
    <div className="grid min-h-screen place-items-center p-6">
      <GlassCard className="max-w-sm text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-warning" />
        <h1 className="mt-3 text-lg font-semibold">Not authorized</h1>
        <p className="mt-1 text-sm text-muted-foreground">This area is limited to aviroh platform staff.</p>
        <Link to="/overview" className="mt-4 inline-block text-sm font-medium text-primary">Back to console</Link>
      </GlassCard>
    </div>
  );
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:px-8">
          <AvirohMark />
          <span className="rounded-md bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">aviroh internal</span>
          <span className="text-xs text-muted-foreground">Signed in as {data.role}</span>
          <div className="ml-auto"><ThemeToggle /></div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 md:px-8" aria-label="Internal sections">
          {tabs.map((t) => (
            <Link key={t.to} to={t.to} className={cn("border-b-2 px-3 py-2 text-sm whitespace-nowrap", path === t.to ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8"><Outlet /></main>
    </div>
  );
}
