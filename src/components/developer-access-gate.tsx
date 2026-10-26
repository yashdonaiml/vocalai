import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LockKeyhole } from "lucide-react";
import { GlassCard, PageHeader, SystemLabel } from "@/components/apple";
import { developerStudioAccess } from "@/lib/developer-access.functions";
import { useWorkspace } from "@/lib/workspace";

export function DeveloperAccessGate({ children }: { children: ReactNode }) {
  const workspace = useWorkspace();
  const checkAccess = useServerFn(developerStudioAccess);
  const access = useQuery({
    queryKey: ["developer-studio-access", workspace.id],
    queryFn: () => checkAccess({ data: { workspaceId: workspace.id } }),
    retry: false,
  });

  if (access.isLoading)
    return (
      <GlassCard>
        <p role="status">Checking developer access…</p>
      </GlassCard>
    );
  if (access.error || !access.data?.allowed)
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          eyebrow="Developer access"
          title="Advanced Studio is restricted"
          subtitle="The chat builder is the standard way to create and update agents. Advanced configuration and workflow editing are enabled for approved workspaces on request."
        />
        <GlassCard className="space-y-3">
          <SystemLabel tone="muted">Not enabled</SystemLabel>
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Request developer access from VocollAI support.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Enabling access does not alter deployed agents. Advanced changes still create a
                draft and must pass the normal test and publication checks.
              </p>
            </div>
          </div>
        </GlassCard>
      </div>
    );
  return children;
}
