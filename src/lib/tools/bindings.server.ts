// Runtime authority comes from saved version snapshots, never the current agent draft.
export type ToolBinding = {
  tool_id: string;
  tool_revision_id: string;
  alias: string;
  confirmation_mode?: string;
  requirement?: string;
};

export function snapshotBindings(config: unknown): ToolBinding[] {
  const raw = (config as { tool_bindings?: unknown } | null)?.tool_bindings;
  if (!Array.isArray(raw)) return [];
  return raw.filter((b): b is ToolBinding => Boolean(b && typeof b.tool_id === "string" && typeof b.tool_revision_id === "string" && typeof b.alias === "string"));
}

export async function agentBindings(workspaceId: string, agentId: string, version: number | null) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  if (version != null) {
    const { data, error } = await db.from("agent_versions").select("config").eq("workspace_id", workspaceId).eq("agent_id", agentId).eq("version", version).single();
    if (error || !data) throw new Error("Agent version not found");
    const config = data.config as { tool_bindings?: unknown; tool_ids?: unknown[] };
    if (!Array.isArray(config.tool_bindings) && config.tool_ids?.length) throw new Error("Republish this agent to snapshot its tool revisions before creating a new deployment.");
    return snapshotBindings(data.config);
  }
  const { loadAgentTools } = await import("./readiness.server");
  const { tools, bindings } = await loadAgentTools(workspaceId, agentId);
  return tools.map((t) => ({ tool_id: t.toolId, tool_revision_id: t.revisionId, alias: t.name, confirmation_mode: t.always ? "always" : "policy_minimum", requirement: bindings.find((b) => b.tool_id === t.toolId)?.requirement ?? "required" }));
}

export async function sessionBinding(sessionId: string, alias: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: session } = await db.from("conversations").select("*").eq("id", sessionId).single();
  if (!session || session.status !== "active") throw new Error("Session is not active");
  let bundleId: string | null = null;
  if (session.deployment_id) {
    const { data: deployment } = await db.from("deployments").select("*").eq("id", session.deployment_id).eq("workspace_id", session.workspace_id).eq("agent_id", session.agent_id!).eq("agent_version", session.agent_version!).single();
    bundleId = deployment?.bundle_id ?? null;
  } else {
    // Test sessions pin their bundle at creation, rather than following later draft edits.
    bundleId = (session as typeof session & { runtime_bundle_id?: string | null }).runtime_bundle_id ?? null;
  }
  if (!bundleId) throw new Error("Session has no pinned bundle. Start a new test call.");
  const { data: row } = await db.from("runtime_bundles").select("bundle").eq("id", bundleId).eq("workspace_id", session.workspace_id).eq("agent_id", session.agent_id!).single();
  const bundle = row?.bundle as unknown as { tools?: { id?: string; name?: string; parameters?: unknown; tool_id?: string; alias?: string; tool_revision_id?: string; confirmation_mode?: string }[] } | undefined;
  const tool = bundle?.tools?.find((t) => (t.alias ?? t.name) === alias);
  if (!tool) throw new Error("Tool is not in this session's bundle");
  let binding: ToolBinding | undefined;
  if (tool.tool_revision_id && tool.tool_id) binding = { tool_id: tool.tool_id, tool_revision_id: tool.tool_revision_id, alias, confirmation_mode: tool.confirmation_mode ?? "policy_minimum" };
  else if (tool.id) {
    // v1 compatibility resolves migration provenance and immutable revision 1.
    // It never follows a current draft binding or looks up a tool by name alone.
    const { data: connector } = await db.from("tool_connectors").select("id").eq("workspace_id", session.workspace_id).contains("configuration", { legacy_tool_id: tool.id }).single();
    if (connector) {
      const { data: definition } = await db.from("tool_definitions").select("id, stable_slug").eq("workspace_id", session.workspace_id).eq("connector_id", connector.id).single();
      if (definition?.stable_slug === alias) {
        const { data: revision } = await db.from("tool_revisions").select("id, input_schema").eq("workspace_id", session.workspace_id).eq("tool_id", definition.id).eq("revision_no", 1).single();
        const { canonicalJson } = await import("./schema");
        if (revision && canonicalJson(revision.input_schema) === canonicalJson(tool.parameters)) binding = { tool_id: definition.id, tool_revision_id: revision.id, alias, confirmation_mode: "policy_minimum" };
      }
    }
  }
  if (!binding) throw new Error("Legacy bundle has no pinned tool revision. Republish the agent.");
  return { session, binding };
}
