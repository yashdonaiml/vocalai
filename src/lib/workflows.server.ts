import { asGraph, graphErrors, type WorkflowNode, type Mapping } from "./workflow-graph";
import { chooseLabel, judgeCondition } from "./judgments.server";
// Workflow engine: executes a workflow's ordered steps against a conversation and records the run.
// Called by manual runs (workflows.functions.ts) and by runtime call events (session.server.ts).
export type StepKind = "call_tool" | "send_summary" | "send_webhook" | "tag_conversation" | "tag_with_ai" | "trigger" | "end";
export type Condition = { kind: "none" | "duration_over" | "summary_contains" | "agent_is" | "ai_check"; value: string };

// Evaluate conditions using the workspace provider for optional AI checks.
async function evalCondition(workspaceId: string, kind: string | undefined, value: string | undefined, conv: { agent_id: string | null; summary: string | null; duration_seconds: number | null } | null, transcript: string): Promise<{ pass: boolean; detail?: string }> {
  if (kind === "duration_over") return { pass: (conv?.duration_seconds ?? 0) > Number(value) };
  if (kind === "summary_contains") return { pass: (conv?.summary ?? "").toLowerCase().includes((value ?? "").toLowerCase()) };
  if (kind === "agent_is") return { pass: conv?.agent_id === value };
  if (kind === "ai_check") {
    if (!conv) return { pass: false, detail: "Needs a call" };
    const p = await judgeCondition(workspaceId, value ?? "", { summary: conv.summary, transcript });
    return { pass: p >= 0.5, detail: `AI check ${Math.round(p * 100)}%` };
  }
  return { pass: false };
}
export type Step = { kind: StepKind; value: string; if?: Condition };
type StepResult = { nodeId?: string; kind: StepKind | "condition"; value: string; status: "ok" | "skipped" | "failed"; detail: string; ms: number; outcome?: "yes" | "no" };

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function post(url: string, headers: Record<string, string>, body: string, timeoutMs = 10000) {
  const { guardedFetch } = await import("./tools/egress.server");
  const res = await guardedFetch(url, { method: "POST", headers: new Headers({ "content-type": "application/json", ...headers }), body, timeoutMs, maxBytes: 65536 });
  if (res.status < 200 || res.status >= 300) throw new Error(`Receiver answered ${res.status}`);
  return `Delivered (${res.status})`;
}

export async function executeWorkflow(workflowId: string, conversationId: string | null, source: "manual" | "live", startedBy: string | null) {
  const db = await admin();
  const { data: wf } = await db.from("workflows").select("*").eq("id", workflowId).single();
  if (!wf) throw new Error("Workflow not found");
  // Manual runs snapshot the tested graph; live runs execute the latest published version.
  let versionId = wf.published_version_id;
  if (source === "manual") {
    const { publishWorkflowVersion } = await import("./tools/readiness.server");
    versionId = (await publishWorkflowVersion(wf.id, startedBy)).id;
  } else if (!versionId) {
    // Backfill legacy enabled linear workflows on first live dispatch.
    const { publishWorkflowVersion } = await import("./tools/readiness.server");
    const version = await publishWorkflowVersion(wf.id, null);
    const { error } = await db.from("workflows").update({ published_version_id: version.id }).eq("id", wf.id).eq("workspace_id", wf.workspace_id);
    if (error) throw new Error("Could not activate the migrated workflow version");
    versionId = version.id;
  }
  const { data: version } = await db.from("workflow_versions").select("id, graph").eq("id", versionId ?? "00000000-0000-0000-0000-000000000000").eq("workflow_id", wf.id).eq("workspace_id", wf.workspace_id).maybeSingle();
  if (!version) throw new Error("Publish this workflow before running it live.");
  const conv = conversationId
    ? (await db.from("conversations").select("id, agent_id, summary, duration_seconds, channel, started_at, session_ref").eq("id", conversationId).eq("workspace_id", wf.workspace_id).maybeSingle()).data
    : null;
  if (conversationId && !conv) throw new Error("Call not found in this workspace");
  const { data: turns } = conv
    ? await db.from("conversation_turns").select("role, content").eq("conversation_id", conv.id).eq("workspace_id", wf.workspace_id).order("seq").limit(200)
    : { data: [] as { role: string; content: string }[] };
  const payload = {
    workflow: { id: wf.id, name: wf.name },
    conversation: conv ? { id: conv.id, agent_id: conv.agent_id, summary: conv.summary, duration_seconds: conv.duration_seconds, channel: conv.channel, started_at: conv.started_at } : null,
    transcript: (turns ?? []).map((t) => `${t.role}: ${t.content}`).join("\n"),
    tags: [] as string[],
  };

  const { data: run, error: runError } = await db.from("workflow_runs").insert({ workflow_id: wf.id, workspace_id: wf.workspace_id, conversation_id: conv?.id ?? null, trigger: wf.trigger, source, workflow_version_id: version.id, started_by: startedBy }).select("id").single();
  if (runError || !run) throw new Error("Could not start the workflow run");
  const started = Date.now();
  const results: StepResult[] = [];
  let failed: string | null = null;
  let skippedForAgent = false;

  const graph = asGraph(version.graph);
  const refs = await Promise.all([
    db.from("tool_definitions").select("id").eq("workspace_id", wf.workspace_id),
    db.from("webhook_endpoints").select("id").eq("workspace_id", wf.workspace_id).eq("enabled", true),
    db.from("agents").select("id").eq("workspace_id", wf.workspace_id),
  ]);
  const errors = graphErrors(graph, { tools: (refs[0].data ?? []).map(t => t.id), hooks: (refs[1].data ?? []).map(h => h.id), agents: (refs[2].data ?? []).map(a => a.id) });
  if (errors.length) failed = errors[0] ?? "Invalid workflow";
  else if (wf.agent_id && conv && wf.agent_id !== conv.agent_id) {
    skippedForAgent = true;
    const trigger = graph.nodes.find((n) => n.type === "trigger");
    if (trigger) results.push({ nodeId: trigger.id, kind: "trigger", value: "", status: "skipped", detail: "This call was handled by a different agent.", ms: 0 });
  } else {
    let current = graph.nodes.find(n => n.type === "trigger")?.id;
    let traversed = 0;
    while (current && traversed++ < graph.nodes.length) {
      const node = graph.nodes.find(n => n.id === current);
      if (!node) break;
      let outcome: "yes" | "no" | undefined;
      if (node.type === "trigger") {
        results.push({ nodeId: node.id, kind: "trigger", value: "", status: "ok", detail: "Workflow started", ms: 0 });
      } else if (node.type === "end") {
        results.push({ nodeId: node.id, kind: "end", value: "", status: "ok", detail: "Workflow finished", ms: 0 });
      } else if (node.type === "condition") {
        const t0 = Date.now();
        let pass = false;
        let note: string | undefined;
        try {
          const r = await evalCondition(wf.workspace_id, node.kind, node.value, conv, payload.transcript);
          pass = r.pass; note = r.detail;
        } catch (e) {
          failed = e instanceof Error ? e.message : "Condition failed";
          results.push({ nodeId: node.id, kind: "condition", value: node.value ?? "", status: "failed", detail: failed, ms: Date.now() - t0 });
          break;
        }
        outcome = pass ? "yes" : "no";
        results.push({ nodeId: node.id, kind: "condition", value: node.value ?? "", status: "ok", outcome, detail: note ? `${pass ? "Yes" : "No"} path (${note})` : pass ? "Yes path" : "No path", ms: Date.now() - t0 });
      } else if (node.type === "action") {
        const t0 = Date.now();
        const step = { kind: node.kind as StepKind, value: node.value ?? "" };
        try {
          const detail = await runStep(step, payload, wf.workspace_id, node.mappings, { versionId: version.id, runId: run.id, stepId: node.id });
          results.push({ nodeId: node.id, ...step, status: "ok", detail, ms: Date.now() - t0 });
        } catch (e) {
          failed = e instanceof Error ? e.message : "Action failed";
          results.push({ nodeId: node.id, ...step, status: "failed", detail: failed, ms: Date.now() - t0 });
        }
      }
      if (failed) break;
      current = graph.edges.find(e => e.source === current && (!outcome || e.outcome === outcome))?.target;
    }
  }

  const completed = new Set(results.map((result) => result.nodeId).filter(Boolean));
  for (const node of graph.nodes) {
    if (completed.has(node.id)) continue;
    const branch = graph.edges.find((edge) => {
      if (edge.target !== node.id || !edge.outcome) return false;
      const condition = results.find((result) => result.nodeId === edge.source && result.kind === "condition");
      return Boolean(condition?.outcome && condition.outcome !== edge.outcome);
    });
    results.push({
      nodeId: node.id,
      kind: node.type === "action" ? node.kind as StepKind : node.type,
      value: node.value ?? "",
      status: "skipped",
      detail: skippedForAgent ? "Skipped because this call belongs to a different agent." : branch ? `Not on the selected ${branch.outcome === "yes" ? "No" : "Yes"} branch.` : failed ? `Not reached: ${failed}` : "Not reached.",
      ms: 0,
    });
  }
  const runStatus = skippedForAgent ? "skipped" : failed ? "failed" : "succeeded";
  const { error: finishError } = await db.from("workflow_runs").update({ status: runStatus, steps: results as never, error: failed, duration_ms: Date.now() - started, finished_at: new Date().toISOString() }).eq("id", run.id);
  if (finishError) throw new Error("Workflow ran, but its history could not be saved.");
  return { id: run.id, status: runStatus, steps: results, error: failed };
}

async function runStep(step: Step, payload: { tags: string[] } & Record<string, unknown>, workspaceId: string, mappings: Mapping[] = [], execution?: { versionId: string; runId: string; stepId: string }): Promise<string> {
  const db = await admin();
  const inputs: Record<string, string | number | null> = {};
  for (const m of mappings) {
    const conversation = payload["conversation"] as Record<string, string | number | null> | null;
    inputs[m.key] = m.source === "literal" ? m.value : m.source === "transcript" ? String(payload["transcript"] ?? "") : conversation?.[m.source.split(".")[1] ?? ""] ?? null;
  }
  const body = JSON.stringify({ ...payload, inputs });
  switch (step.kind) {
    case "tag_conversation": {
      const conversation = payload["conversation"] as { id: string } | null;
      if (!conversation) throw new Error("Select a past call to add a tag.");
      const tag = step.value.trim();
      if (!tag || tag.length > 80) throw new Error("Enter a tag under 80 characters.");
      const { error } = await db.from("conversation_tags").upsert({ workspace_id: workspaceId, conversation_id: conversation.id, tag }, { onConflict: "conversation_id,tag" });
      if (error) throw new Error("Could not save the call tag.");
      payload.tags.push(tag);
      return `Tagged "${tag}"`;
    }
    case "tag_with_ai": {
      const conversation = payload["conversation"] as { id: string; summary: string | null } | null;
      if (!conversation) throw new Error("Select a past call to tag it with AI.");
      const candidates = step.value.split(",").map((t) => t.trim()).filter(Boolean);
      if (candidates.length < 2) throw new Error("List at least two tags, separated by commas.");
      const options = Object.fromEntries(candidates.map((t) => [t, `Apply the tag "${t}" to this call.`]));
      const picked = await chooseLabel(workspaceId, "Which tag best fits this call?", options, { summary: conversation.summary, transcript: String(payload["transcript"] ?? "") });
      if (!picked) return "No tag fit this call";
      const { error } = await db.from("conversation_tags").upsert({ workspace_id: workspaceId, conversation_id: conversation.id, tag: picked.choice }, { onConflict: "conversation_id,tag" });
      if (error) throw new Error("Could not save the call tag.");
      payload.tags.push(picked.choice);
      return `Tagged "${picked.choice}"`;
    }
    case "send_summary":
      if (!step.value.startsWith("https://")) throw new Error("Address must start with https://");
      return post(step.value, { "x-aviroh-event": "workflow.summary" }, body);
    case "send_webhook": {
      const { data: ep } = await db.from("webhook_endpoints").select("id, url, secret_ciphertext, enabled").eq("id", step.value).eq("workspace_id", workspaceId).maybeSingle();
      if (!ep) throw new Error("Webhook endpoint not found");
      if (!ep.enabled) throw new Error("Webhook endpoint is paused");
      const { decryptSecret, hmacHex } = await import("./crypto.server");
      const ts = Math.floor(Date.now() / 1000).toString();
      const signed = JSON.stringify({ type: "workflow.run", created_at: new Date().toISOString(), data: { ...payload, inputs } });
      const sig = await hmacHex(await decryptSecret(ep.secret_ciphertext), `${ts}.${signed}`);
      const t0 = Date.now();
      try {
        const r = await post(ep.url, { "x-aviroh-timestamp": ts, "x-aviroh-signature": sig }, signed);
        await db.from("webhook_deliveries").insert({ endpoint_id: ep.id, workspace_id: workspaceId, event: "workflow.run", status: 200, duration_ms: Date.now() - t0 });
        return r;
      } catch (e) {
        await db.from("webhook_deliveries").insert({ endpoint_id: ep.id, workspace_id: workspaceId, event: "workflow.run", error: e instanceof Error ? e.message : "failed", duration_ms: Date.now() - t0 });
        throw e;
      }
    }
    case "call_tool": {
      if (!execution) throw new Error("Tool step has no version binding");
      const { data: pin } = await db.from("workflow_tool_bindings").select("tool_revision_id").eq("workflow_version_id", execution.versionId).eq("step_id", execution.stepId).eq("workspace_id", workspaceId).single();
      if (!pin) throw new Error("Tool step is not bound to this workflow version");
      const { data: revision } = await db.from("tool_revisions").select("input_schema").eq("id", pin.tool_revision_id).eq("workspace_id", workspaceId).maybeSingle();
      const schema = revision?.input_schema as { properties?: Record<string, { type?: string | string[] }> } | undefined;
      const typedInputs = Object.fromEntries(Object.entries(inputs).map(([key, value]) => {
        const types = schema?.properties?.[key]?.type;
        const expected = Array.isArray(types) ? types : types ? [types] : [];
        if (typeof value !== "string") return [key, value];
        if ((expected.includes("number") || expected.includes("integer")) && value.trim() !== "" && Number.isFinite(Number(value))) return [key, Number(value)];
        if (expected.includes("boolean") && (value === "true" || value === "false")) return [key, value === "true"];
        return [key, value];
      }));
      const { invokeTool } = await import("./tools/gateway.server");
      const result = await invokeTool({
        workspaceId, toolId: step.value, toolRevisionId: pin.tool_revision_id,
        context: { kind: "workflow", workflowVersionId: execution.versionId, runId: execution.runId, stepId: execution.stepId },
        invocationKey: `${execution.runId}:${execution.stepId}`, arguments: typedInputs,
      });
      if (result.status !== "succeeded") throw new Error(result.error?.safeMessage ?? `Tool ${result.status}`);
      return `Tool succeeded (${result.invocationId})`;
    }
    default:
      throw new Error("This action is not supported. Remove it before running the workflow.");
  }
}

// Runs every enabled workflow in the workspace that listens for this trigger. Errors never break call handling.
export async function dispatchWorkflows(workspaceId: string, trigger: string, conversationId: string, text?: string) {
  try {
    const db = await admin();
    const { data } = await db.from("workflows").select("id, trigger_value").eq("workspace_id", workspaceId).eq("enabled", true).eq("trigger", trigger);
    for (const w of data ?? []) {
      if (trigger === "keyword" && !(text ?? "").toLowerCase().includes((w.trigger_value ?? "").toLowerCase())) continue;
      await executeWorkflow(w.id, conversationId, "live", null).catch(() => undefined);
    }
  } catch {
    /* never block the call */
  }
}
