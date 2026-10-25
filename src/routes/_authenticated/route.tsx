import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { WorkspaceProvider, workspacesQuery } from "@/lib/workspace";

// Pending email invitations are accepted once per signed-in user per page load.
let invitesCheckedFor: string | null = null;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location, context }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { redirect: location.pathname } });
    if (invitesCheckedFor !== data.session.user.id) {
      invitesCheckedFor = data.session.user.id;
      const { data: joined } = await supabase.rpc("accept_my_invitations");
      if (joined && joined > 0) await context.queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    }
    const workspaces = await context.queryClient.ensureQueryData(workspacesQuery);
    if (workspaces.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: () => (
    <WorkspaceProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </WorkspaceProvider>
  ),
});
