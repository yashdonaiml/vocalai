// Tool catalog: connectors, discovered operations, immutable revisions and change detection.
// Any change to a tool's name, description, inputs or call mapping creates a new revision that
// needs a fresh human approval before it can run (ENG-TOOLS-001 sections 5 and 10).
import { discoverMcp } from "./adapters/mcp.server";
import type { AdapterCredential } from "./adapters/types";
import { sanitizeDescription } from "./redact";
import { canonicalJson, sha256Hex } from "./schema";
import { emitEvent } from "../events.server";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export type Operation = {
  opId: string; slug: string; displayName: string; description: string;
  inputSchema: unknown; mapping: Record<string, unknown>; annotations?: unknown; risk: "read" | "write" | "destructive";
};

export function slugify(s: string) {
  const base = s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^[^a-z]+/, "").slice(0, 56);
  return base.length >= 2 ? base : `tool_${base || "x"}`;
}

export function riskFromAnnotations(a: unknown): Operation["risk"] {
  const x = (a ?? {}) as { readOnlyHint?: boolean; destructiveHint?: boolean };
  if (x.readOnlyHint) return "read";
  if (x.destructiveHint) return "destructive";
  return "write";
}

async function uniqueSlug(workspaceId: string, slug: string) {
  const db = await admin();
  let candidate = slug;
  for (let i = 2; i < 50; i++) {
    const { data } = await db.from("tool_definitions").select("id").eq("workspace_id", workspaceId).eq("stable_slug", candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${slug.slice(0, 58)}_${i}`;
  }
  return `${slug.slice(0, 50)}_${Date.now().toString(36)}`;
}

/** Inserts or updates one operation. Returns whether it is new, changed (new revision) or unchanged. */
export async function upsertOperation(workspaceId: string, connectorId: string, op: Operation) {
  const db = await admin();
  const description = sanitizeDescription(op.description).slice(0, 2000);
  const schema = (op.inputSchema && typeof op.inputSchema === "object" ? op.inputSchema : { type: "object", properties: {} }) as Record<string, unknown>;
  const reviewHash = await sha256Hex(canonicalJson({ n: op.displayName, d: description, s: schema, a: op.annotations ?? {} }));
  const invocationHash = await sha256Hex(canonicalJson({ m: op.mapping, s: schema }));

  const { data: def } = await db.from("tool_definitions").select("id, current_revision_id, state").eq("connector_id", connectorId).eq("source_operation_id", op.opId).maybeSingle();
  let toolId = def?.id;
  let revisionNo = 1;
  if (def?.current_revision_id) {
    const { data: cur } = await db.from("tool_revisions").select("review_hash, invocation_hash, revision_no").eq("id", def.current_revision_id).single();
    if (cur && cur.review_hash === reviewHash && cur.invocation_hash === invocationHash) {
      if (def.state === "archived") await db.from("tool_definitions").update({ state: "active", archived_at: null }).eq("id", def.id);
      return { toolId: def.id, change: "same" as const };
    }
    revisionNo = (cur?.revision_no ?? 0) + 1;
  }
  if (!toolId) {
    const { data: created, error } = await db.from("tool_definitions").insert({ workspace_id: workspaceId, connector_id: connectorId, source_operation_id: op.opId, stable_slug: await uniqueSlug(workspaceId, op.slug) }).select("id").single();
    if (error || !created) throw new Error("Could not add the tool");
    toolId = created.id;
    await db.from("tool_policies").insert({ tool_id: toolId, workspace_id: workspaceId });
  }
  const { data: rev, error: revErr } = await db.from("tool_revisions").insert({
    workspace_id: workspaceId, tool_id: toolId, revision_no: revisionNo, display_name: op.displayName.slice(0, 120), description,
    input_schema: schema as never, adapter_mapping: op.mapping as never, remote_annotations: (op.annotations ?? {}) as never,
    review_hash: reviewHash, invocation_hash: invocationHash,
  }).select("id").single();
  if (revErr || !rev) throw new Error("Could not save the tool details");
  await db.from("tool_definitions").update({ current_revision_id: rev.id, state: "active", archived_at: null }).eq("id", toolId);
  await db.from("tool_approvals").insert({ workspace_id: workspaceId, tool_revision_id: rev.id, risk_class: op.risk, confirmation_minimum: op.risk === "read" ? "none" : op.risk === "destructive" ? "voice_readback" : "voice", status: "pending" });
  if (revisionNo > 1) await emitEvent(workspaceId, "tool.changed", { tool_id: toolId, revision: revisionNo });
  return { toolId, change: revisionNo > 1 ? ("changed" as const) : ("new" as const) };
}

async function credentialFor(workspaceId: string, connectorId: string): Promise<AdapterCredential> {
  const db = await admin();
  const { data } = await db.from("tool_credentials").select("auth_kind, header_name, ciphertext").eq("connector_id", connectorId).eq("workspace_id", workspaceId).eq("status", "active").maybeSingle();
  if (!data) return null;
  const { decryptSecret } = await import("../crypto.server");
  return { kind: data.auth_kind as "bearer", headerName: data.header_name, secret: await decryptSecret(data.ciphertext) };
}

/** Next check time: active connections often, paused or failing ones rarely (spec 10). */
async function nextCheckAt(connectorId: string, enabled: boolean, healthy: boolean) {
  const db = await admin();
  const { data: defs } = await db.from("tool_definitions").select("id").eq("connector_id", connectorId);
  const ids = (defs ?? []).map((d) => d.id);
  const { count } = ids.length ? await db.from("agent_tool_bindings").select("tool_id", { count: "exact", head: true }).in("tool_id", ids).eq("enabled", true) : { count: 0 };
  const hours = !enabled || !healthy ? 24 : (count ?? 0) > 0 ? 1 : 6;
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

/** Re-reads a connection's tools and flags anything that changed since approval. */
export async function checkConnector(connectorId: string, actor: string | null) {
  const db = await admin();
  const { data: c } = await db.from("tool_connectors").select("*").eq("id", connectorId).maybeSingle();
  if (!c || c.archived_at) throw new Error("Connection not found");
  const now = new Date().toISOString();

  if (c.type !== "mcp") {
    // Web tools have no catalog to re-read; check the server answers at all.
    let healthy = false;
    try {
      const { guardedFetch } = await import("./egress.server");
      const res = await guardedFetch(c.canonical_origin, { method: "HEAD", headers: new Headers(), timeoutMs: 6000, maxBytes: 65536 });
      healthy = res.status < 500;
    } catch { healthy = false; }
    const keep = c.health === "auth_invalid" || c.health === "auth_forbidden" || c.health === "schema_drift";
    const health = healthy ? (keep ? c.health : "healthy") : "unreachable";
    await db.from("tool_connectors").update({ health, last_checked_at: now, next_check_at: await nextCheckAt(c.id, c.admin_enabled, healthy) }).eq("id", c.id);
    if (!healthy && c.health !== "unreachable") await emitEvent(c.workspace_id, "connection.unhealthy", { connector_id: c.id, health });
    return { kind: "reachability" as const, healthy, added: 0, changed: 0, removed: 0 };
  }

  const { data: run } = await db.from("connector_discovery_runs").insert({ workspace_id: c.workspace_id, connector_id: c.id, status: "running", actor }).select("id").single();
  const found = await discoverMcp(c.canonical_origin, c.endpoint_path, await credentialFor(c.workspace_id, c.id)).catch(() => ({ ok: false as const, code: "TOOL_UNAVAILABLE" as const }));
  if (!found.ok) {
    const health = found.code === "AUTH_INVALID" ? "auth_invalid" : found.code === "AUTH_FORBIDDEN" ? "auth_forbidden" : "unreachable";
    await db.from("connector_discovery_runs").update({ status: "failed", error_code: found.code, finished_at: new Date().toISOString() }).eq("id", run!.id);
    await db.from("tool_connectors").update({ health, error_code: found.code, last_checked_at: now, consecutive_failures: c.consecutive_failures + 1, next_check_at: await nextCheckAt(c.id, c.admin_enabled, false) }).eq("id", c.id);
    if (c.health !== health) await emitEvent(c.workspace_id, "connection.unhealthy", { connector_id: c.id, health });
    throw new Error(health === "auth_invalid" ? "The server rejected the credentials." : health === "auth_forbidden" ? "The credentials do not have permission to list tools." : "Could not reach the server or it did not answer as an MCP server.");
  }
  let added = 0, changed = 0;
  const seen = new Set<string>();
  for (const t of found.tools.slice(0, 200)) {
    seen.add(t.name);
    const r = await upsertOperation(c.workspace_id, c.id, { opId: t.name, slug: slugify(t.name), displayName: t.name, description: t.description ?? "", inputSchema: t.inputSchema, mapping: { tool: t.name }, annotations: t.annotations ?? {}, risk: riskFromAnnotations(t.annotations) });
    if (r.change === "new") added++;
    if (r.change === "changed") changed++;
  }
  const { data: defs } = await db.from("tool_definitions").select("id, source_operation_id").eq("connector_id", c.id).eq("state", "active");
  const gone = (defs ?? []).filter((d) => !seen.has(d.source_operation_id));
  if (gone.length) await db.from("tool_definitions").update({ state: "archived", archived_at: now }).in("id", gone.map((d) => d.id));
  const catalogHash = await sha256Hex(canonicalJson(found.tools.map((t) => t.name).sort()));
  await db.from("connector_discovery_runs").update({ status: "succeeded", protocol_version: found.protocol, catalog_hash: catalogHash, tool_count: found.tools.length, drift: { added, changed, removed: gone.length } as never, finished_at: new Date().toISOString() }).eq("id", run!.id);
  const firstRun = !c.discovery_etag;
  const health = changed > 0 && !firstRun ? "schema_drift" : c.health === "schema_drift" ? "schema_drift" : "healthy";
  await db.from("tool_connectors").update({ health, protocol_version: found.protocol, discovery_etag: catalogHash, error_code: null, consecutive_failures: 0, last_checked_at: now, last_success_at: now, next_check_at: await nextCheckAt(c.id, c.admin_enabled, true) }).eq("id", c.id);
  return { kind: "discovery" as const, healthy: true, added, changed, removed: gone.length };
}

/** Clears the "changed" flag once nothing on the connection is waiting for review. */
export async function settleDrift(connectorId: string) {
  const db = await admin();
  const { data: defs } = await db.from("tool_definitions").select("current_revision_id").eq("connector_id", connectorId).eq("state", "active");
  const revs = (defs ?? []).map((d) => d.current_revision_id).filter(Boolean) as string[];
  if (!revs.length) return;
  const { data: approvals } = await db.from("tool_approvals").select("tool_revision_id, status, created_at").in("tool_revision_id", revs).order("created_at", { ascending: false });
  const latest = new Map<string, string>();
  for (const a of approvals ?? []) if (!latest.has(a.tool_revision_id)) latest.set(a.tool_revision_id, a.status);
  if (![...latest.values()].includes("pending")) await db.from("tool_connectors").update({ health: "healthy" }).eq("id", connectorId).eq("health", "schema_drift");
}

/** Hourly maintenance: checks connections that are due, then retries undelivered events. */
export async function runMaintenance() {
  const db = await admin();
  const { data: due } = await db.from("tool_connectors").select("id").is("archived_at", null).or(`next_check_at.is.null,next_check_at.lte.${new Date().toISOString()}`).limit(30);
  let checked = 0, failed = 0;
  for (const c of due ?? []) {
    try { await checkConnector(c.id, null); checked++; } catch { failed++; }
  }
  const { deliverEvents } = await import("../events.server");
  const events = await deliverEvents({ limit: 50 });
  return { checked, failed, events };
}
