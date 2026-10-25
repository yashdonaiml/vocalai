import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Workspace = { id: string; name: string; org_id: string; org_name: string };
export type Environment = { id: string; name: string; kind: string };

async function fetchWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, org_id, organizations(name)")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    org_id: workspace.org_id,
    org_name: (workspace.organizations as unknown as { name: string } | null)?.name ?? "",
  }));
}

export const workspacesQuery = queryOptions({
  queryKey: ["workspaces"],
  queryFn: fetchWorkspaces,
});

export const workspaceQuery = queryOptions({
  queryKey: ["workspace"],
  queryFn: async (): Promise<Workspace | null> => (await fetchWorkspaces())[0] ?? null,
});

type WorkspaceContextValue = {
  workspace: Workspace;
  workspaces: Workspace[];
  environment: Environment | null;
  environments: Environment[];
  selectWorkspace: (workspaceId: string) => void;
  selectEnvironment: (environmentId: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: workspaces } = useSuspenseQuery(workspacesQuery);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(workspaces[0]?.id ?? "");
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("aviroh.workspace");
    if (saved && workspaces.some((workspace) => workspace.id === saved)) setSelectedId(saved);
  }, [workspaces]);

  const workspace = workspaces.find((item) => item.id === selectedId) ?? workspaces[0];
  if (!workspace) throw new Error("No workspace");
  const { data: environments = [] } = useSuspenseQuery(queryOptions({
    queryKey: ["workspace-environments", workspace.id],
    queryFn: async (): Promise<Environment[]> => {
      const { data, error } = await supabase.from("environments").select("id, name, kind").eq("workspace_id", workspace.id).order("kind");
      if (error) throw error;
      return data ?? [];
    },
  }));
  const environment = environments.find((item) => item.id === selectedEnvironmentId) ?? environments[0] ?? null;

  const value = useMemo<WorkspaceContextValue>(() => ({
    workspace,
    workspaces,
    environment,
    environments,
    selectWorkspace: (workspaceId) => {
      if (workspaceId === workspace.id) return;
      window.localStorage.setItem("aviroh.workspace", workspaceId);
      queryClient.cancelQueries();
      setSelectedId(workspaceId);
      setSelectedEnvironmentId("");
    },
    selectEnvironment: setSelectedEnvironmentId,
  }), [environment, environments, queryClient, workspace, workspaces]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider is missing");
  return value;
}

export function useWorkspace(): Workspace {
  return useWorkspaceContext().workspace;
}
