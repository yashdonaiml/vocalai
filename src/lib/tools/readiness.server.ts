// Readiness checks for agents and workflows that use tools, plus workflow version publishing.
import { asGraph, graphErrors } from "../workflow-graph";
import type { JsonSchema } from "./schema";
import { normalizeConfig } from "../agent-config";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function latestApprovals(revisionIds: string[]) {
  const db = await admin();
  const map = new Map<string, { status: string; allowed_contexts: string[]; risk_class: string; confirmation_minimum: string }>();
  if (!revisionIds.length) return map;
  const { data } = await db.from("tool_approvals").select("tool_revision_id, status, allowed_contexts, risk_class, confirmation_minimum, created_at").in("tool_revision_id", revisionIds).order("created_at", { ascending: false });
  for (const a of data ?? []) if (!map.has(a.tool_revision_id)) map.set(a.tool_revision_id, a);
  return map;
}

export type AgentTool = { toolId: string; revisionId: string; name: string; description: string; schema: JsonSchema; always: boolean };

/** Enabled tools for an agent, at the revision the agent was pinned to. */
export async function loadAgentTools(workspaceId: string, agentId: string) {
  const db = await admin();
  const { data: bindings } = await db.from("agent_tool_bindings").select("tool_id, tool_revision_id, confirmation_mode, requirement").eq("agent_id", agentId).eq("workspace_id", workspaceId).eq("enabled", true);
  if (!bindings?.length) return { tools: [] as AgentTool[], bindings: [], defs: [], revs: [], connectors: [] };
  const toolIds = bindings.map((b) => b.tool_id);
  const [{ data: defs }, { data: revs }] = await Promise.all([
    db.from("tool_definitions").select("id, stable_slug, state, current_revision_id, connector_id").in("id", toolIds),
    db.from("tool_revisions").select("id, display_name, description, input_schema").in("id", bindings.map((b) => b.tool_revision_id)),
  ]);
  const { data: connectors } = await db.from("tool_connectors").select("id, display_name, admin_enabled, archived_at, health").in("id", (defs ?? []).map((d) => d.connector_id));
  const tools: AgentTool[] = bindings.flatMap((b) => {
    const d = defs?.find((x) => x.id === b.tool_id), r = revs?.find((x) => x.id === b.tool_revision_id);
    return d && r ? [{ toolId: d.id, revisionId: r.id, name: d.stable_slug, description: r.description || r.display_name, schema: r.input_schema as JsonSchema, always: b.confirmation_mode === "always" }] : [];
  });
  return { tools, bindings, defs: defs ?? [], revs: revs ?? [], connectors: connectors ?? [] };
}

export async function toolProblemsFor(workspaceId: string, agentId: string) {
  const { bindings, defs, connectors } = await loadAgentTools(workspaceId, agentId);
  const approvals = await latestApprovals(bindings.map((b) => b.tool_revision_id));
  const problems: string[] = [];
  for (const b of bindings) {
    const d = defs.find((x) => x.id === b.tool_id);
    const name = d?.stable_slug ?? "A tool";
    if (!d || d.state !== "active") { problems.push(`${name} was removed. Detach it on the Tools tab.`); continue; }
    const c = connectors.find((x) => x.id === d.connector_id);
    if (!c || c.archived_at) problems.push(`${name}: its connection was removed.`);
    else if (!c.admin_enabled) problems.push(`${name}: its connection "${c.display_name}" is paused.`);
    else if (c.health === "auth_invalid" || c.health === "auth_forbidden") problems.push(`${name}: update the credentials for "${c.display_name}".`);
    if (d.current_revision_id !== b.tool_revision_id) problems.push(`${name} changed since you attached it. Review the new version on the Tools page, then reattach it.`);
    const a = approvals.get(b.tool_revision_id);
    if (!a || a.status !== "approved") problems.push(`${name} is not approved yet. Review it on the Tools page.`);
    else if (!a.allowed_contexts.includes("voice_session")) problems.push(`${name} is not allowed on calls. Change where it can run on the Tools page.`);
    else if (a.risk_class === "restricted") problems.push(`${name} is marked restricted and cannot be used.`);
  }
  return problems;
}

export async function agentPublishReadiness(workspaceId: string, agentId: string) {
  const db = await admin();
  const { data: workspace } = await db.from("workspaces").select("org_id").eq("id", workspaceId).maybeSingle();
  if (!workspace) return ["Workspace not found."];
  const { data: agent } = await db.from("agents").select("config").eq("id", agentId).maybeSingle();
  if (!agent) return ["Agent not found."];
  const cfg = normalizeConfig(agent.config);
  const providers = new Set<string>();
  if (cfg.runtime.mode === "composable") {
    providers.add(cfg.runtime.llm.provider);
    providers.add(cfg.runtime.stt.provider);
    providers.add(cfg.runtime.tts.provider);
  } else {
    providers.add(cfg.runtime.realtime.provider === "google" ? "google" : "openai");
  }
  const problems: string[] = [];
  for (const provider of [...providers]) {
    try {
      const { resolveCredential } = await import("../providers/registry.server");
      await resolveCredential(workspace.org_id, provider as "openai" | "anthropic" | "google" | "elevenlabs" | "deepgram" | "cartesia");
    } catch {
      problems.push(`Add a ${provider} key under Providers before publishing this agent.`);
    }
  }
  return problems;
}

/** Saves the workflow's current graph as a new immutable version with pinned tool revisions. */
export async function publishWorkflowVersion(workflowId: string, userId: string | null) {
  const db = await admin();
  const { data: wf } = await db.from("workflows").select("id, workspace_id, steps, agent_id").eq("id", workflowId).single();
  if (!wf) throw new Error("Workflow not found");
  const graph = asGraph(wf.steps);
  // Convert legacy tool identifiers through their migration provenance, never by name.
  const { data: connectors } = await db.from("tool_connectors").select("id, configuration").eq("workspace_id", wf.workspace_id);
  for (const node of graph.nodes.filter((n) => n.type === "action" && n.kind === "call_tool")) {
    const connector = connectors?.find((c) => (c.configuration as { legacy_tool_id?: string } | null)?.legacy_tool_id === node.value);
    if (connector) {
      const { data: migrated } = await db.from("tool_definitions").select("id").eq("connector_id", connector.id).eq("workspace_id", wf.workspace_id).single();
      if (migrated) node.value = migrated.id;
    }
  }
  const [{ data: tools }, { data: hooks }, { data: agents }] = await Promise.all([
    db.from("tool_definitions").select("id, stable_slug, state, current_revision_id, connector_id").eq("workspace_id", wf.workspace_id),
    db.from("webhook_endpoints").select("id, enabled").eq("workspace_id", wf.workspace_id),
    db.from("agents").select("id").eq("workspace_id", wf.workspace_id).neq("status", "archived"),
  ]);
  if (wf.agent_id && !(agents ?? []).some((a) => a.id === wf.agent_id)) throw new Error("Select an agent in this workspace or clear the workflow's agent scope.");
  const errors = graphErrors(graph, {
    tools: (tools ?? []).filter((t) => t.state === "active").map((t) => t.id),
    hooks: (hooks ?? []).filter((h) => h.enabled).map((h) => h.id),
    agents: (agents ?? []).map((a) => a.id),
  });
  if (errors.length) throw new Error(errors[0]);
  const toolNodes = graph.nodes.filter((n) => n.type === "action" && n.kind === "call_tool" && n.value);
  const { data: defs } = toolNodes.length ? await db.from("tool_definitions").select("id, stable_slug, state, current_revision_id").eq("workspace_id", wf.workspace_id).in("id", toolNodes.map((n) => n.value!)) : { data: [] };
  const revisionIds = (defs ?? []).map((d) => d.current_revision_id).filter((id): id is string => Boolean(id));
  const revisions = revisionIds.length ? (await db.from("tool_revisions").select("id, tool_id, input_schema").eq("workspace_id", wf.workspace_id).in("id", revisionIds)).data ?? [] : [];
  const approvals = await latestApprovals((defs ?? []).map((d) => d.current_revision_id).filter(Boolean) as string[]);
  const pins: { step_id: string; tool_revision_id: string }[] = [];
  for (const n of toolNodes) {
    const d = defs?.find((x) => x.id === n.value);
    if (!d || d.state !== "active" || !d.current_revision_id) throw new Error("A tool in this workflow is no longer available. Pick another one.");
    const a = approvals.get(d.current_revision_id);
    if (!a || a.status !== "approved") throw new Error(`${d.stable_slug} is not approved yet. Review it on the Tools page first.`);
    if (!a.allowed_contexts.includes("workflow")) throw new Error(`${d.stable_slug} is not allowed in workflows. Change where it can run on the Tools page.`);
    if (a.risk_class !== "read" || a.confirmation_minimum !== "none") throw new Error(`${d.stable_slug} needs someone to confirm it, so it can only run during a call, not in a workflow.`);
    const revision = revisions.find((r) => r.id === d.current_revision_id);
    if (!revision) throw new Error(`${d.stable_slug} has no available input schema.`);
    const schema = revision.input_schema as import("./schema").JsonSchema;
    const mappings = n.mappings ?? [];
    for (const mapping of mappings) {
      const property = schema.properties?.[mapping.key];
      if (!property && schema.additionalProperties === false) throw new Error(`${d.stable_slug}: input "${mapping.key}" is not in the tool's current input schema.`);
      if (!property) continue;
      const expected = Array.isArray(property.type) ? property.type : property.type ? [property.type] : [];
      const sourceType = mapping.source === "conversation.duration_seconds" ? "number" : "string";
      const literalType = expected.includes("integer") || expected.includes("number")
        ? Number.isFinite(Number(mapping.value)) && mapping.value.trim() !== "" ? (Number.isInteger(Number(mapping.value)) ? "integer" : "number") : "invalid"
        : expected.includes("boolean") ? (mapping.value === "true" || mapping.value === "false" ? "boolean" : "invalid")
        : "string";
      const actual = mapping.source === "literal" ? literalType : sourceType;
      const compatible = !expected.length || expected.includes(actual) || (actual === "integer" && expected.includes("number")) || (mapping.source !== "literal" && (expected.includes("string") || expected.includes("null")));
      if (!compatible) throw new Error(`${d.stable_slug}: input "${mapping.key}" needs ${expected.join(" or ")}, but its mapping is incompatible.`);
    }
    for (const required of schema.required ?? []) if (!mappings.some((m) => m.key === required)) throw new Error(`${d.stable_slug}: map required input "${required}" before publishing.`);
    pins.push({ step_id: n.id, tool_revision_id: d.current_revision_id });
  }
  const { data: last } = await db.from("workflow_versions").select("version").eq("workflow_id", wf.id).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (last?.version ?? 0) + 1;
  const { data: v, error } = await db.from("workflow_versions").insert({ workflow_id: wf.id, workspace_id: wf.workspace_id, version, graph: graph as never, published_by: userId }).select("id").single();
  if (error || !v) throw new Error("Could not save the workflow version");
  if (pins.length) {
    const { error: pinError } = await db.from("workflow_tool_bindings").insert(pins.map((p) => ({ ...p, workflow_version_id: v.id, workspace_id: wf.workspace_id })));
    if (pinError) throw new Error("Could not pin workflow tools");
  }
  const { emitEvent } = await import("../events.server");
  await emitEvent(wf.workspace_id, "workflow.published", { workflow_id: wf.id, version });
  return { id: v.id, version };
}
