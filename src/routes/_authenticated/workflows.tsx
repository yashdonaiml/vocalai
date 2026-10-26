import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { WorkflowCanvas } from "@/components/workflow-canvas";
import {
  ACTIONS,
  CONDITIONS,
  asGraph,
  newGraph,
  graphErrors,
  needsCall,
  type WorkflowGraph,
} from "@/lib/workflow-graph";
import { toast } from "@/lib/notify";
import { Copy, GitBranch, History, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { platformStatus } from "@/lib/platform.functions";
import { publishWorkflow } from "@/lib/tools.functions";
import { runWorkflow } from "@/lib/workflows.functions";
import { DeveloperAccessGate } from "@/components/developer-access-gate";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useWorkspace } from "@/lib/workspace";

type StepKind = "call_tool" | "send_summary" | "send_webhook" | "tag_conversation" | "tag_with_ai";
type RunStep = {
  nodeId?: string;
  kind: StepKind | "condition" | "trigger" | "end";
  value: string;
  status: string;
  detail: string;
  ms: number;
  outcome?: "yes" | "no";
};
type Trigger = "call.started" | "call.ended" | "keyword";

const TRIGGERS: Record<Trigger, string> = {
  "call.started": "When a call starts",
  "call.ended": "When a call ends",
  keyword: "When the caller says a keyword",
};
const STEPS: Partial<Record<StepKind, { label: string }>> = {
  call_tool: { label: "Call a tool" },
  send_summary: { label: "Send call details" },
  send_webhook: { label: "Send to a webhook endpoint" },
  tag_conversation: { label: "Tag the conversation" },
  tag_with_ai: { label: "Tag with AI" },
};

const wfQuery = (ws: string) =>
  queryOptions({
    queryKey: ["workflows", ws],
    queryFn: async () => {
      const [wf, agents, tools, convs, hooks, runs, versions] = await Promise.all([
        supabase
          .from("workflows")
          .select("*")
          .eq("workspace_id", ws)
          .order("created_at", { ascending: false }),
        supabase.from("agents").select("id, name").eq("workspace_id", ws).neq("status", "archived"),
        supabase.from("tool_definitions").select("id, name:stable_slug").eq("workspace_id", ws),
        supabase
          .from("conversations")
          .select("id, agent_id, started_at, summary")
          .eq("workspace_id", ws)
          .order("started_at", { ascending: false })
          .limit(20),
        supabase
          .from("webhook_endpoints")
          .select("id, url")
          .eq("workspace_id", ws)
          .eq("enabled", true),
        supabase
          .from("workflow_runs")
          .select(
            "id, workflow_id, status, source, steps, error, duration_ms, created_at, conversation_id, workflow_version_id",
          )
          .eq("workspace_id", ws)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("workflow_versions")
          .select("id, version, graph")
          .eq("workspace_id", ws)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      for (const result of [wf, agents, tools, convs, hooks, runs, versions])
        if (result.error) throw result.error;
      return {
        workflows: wf.data ?? [],
        agents: agents.data ?? [],
        tools: tools.data ?? [],
        convs: convs.data ?? [],
        hooks: hooks.data ?? [],
        runs: runs.data ?? [],
        versions: versions.data ?? [],
      };
    },
  });

export const Route = createFileRoute("/_authenticated/workflows")({
  head: () => ({
    meta: [
      { title: "Workflows: VocollAI" },
      {
        name: "description",
        content: "Connect call events, conditions, and actions to automate conversation follow-up.",
      },
      { property: "og:title", content: "Workflows: VocollAI" },
      {
        property: "og:description",
        content: "Connect call events, conditions, and actions to automate conversation follow-up.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Workflows,
});

const emptyForm = () => ({
  name: "",
  description: "",
  trigger: "call.ended" as Trigger,
  trigger_value: "",
  agent_id: "",
  steps: newGraph() as WorkflowGraph,
});
const sel = "rounded-md border border-input bg-background px-3 py-2 text-sm";

function Workflows() {
  return (
    <DeveloperAccessGate>
      <WorkflowsContent />
    </DeveloperAccessGate>
  );
}

function WorkflowsContent() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(wfQuery(ws.id));
  const [f, setF] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [runConv, setRunConv] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "succeeded" | "failed" | "skipped">("all");
  const [openRun, setOpenRun] = useState<string | null>(null);
  const run = useServerFn(runWorkflow);
  const getStatus = useServerFn(platformStatus);
  const { data: service } = useQuery({
    queryKey: ["workflow-service-status"],
    queryFn: getStatus,
    staleTime: 60_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["workflows"] });

  useEffect(() => {
    setF(emptyForm());
    setEditing(null);
    setOpen(false);
    setHistoryFor(null);
    setOpenRun(null);
  }, [ws.id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) {
      toast.error("Give the workflow a name.");
      return;
    }
    if (f.trigger === "keyword" && !f.trigger_value.trim()) {
      toast.error("Enter a keyword for this trigger.");
      return;
    }
    const row = {
      name: f.name.trim(),
      description: f.description,
      trigger: f.trigger,
      trigger_value: f.trigger === "keyword" ? f.trigger_value : null,
      agent_id: f.agent_id || null,
      steps: f.steps as never,
    };
    if (editing) {
      const { data: updated, error } = await supabase
        .from("workflows")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("id", editing)
        .eq("workspace_id", ws.id)
        .select("id")
        .maybeSingle();
      if (error) {
        toast.error(
          error.message.includes("row-level")
            ? "Only owners and admins can change workflows"
            : error.message,
        );
        return;
      }
      if (!updated) {
        toast.error("This workflow is no longer available in the selected workspace.");
        return;
      }
    } else {
      const { error } = await supabase.from("workflows").insert({ ...row, workspace_id: ws.id });
      if (error) {
        toast.error(
          error.message.includes("row-level")
            ? "Only owners and admins can change workflows"
            : error.message,
        );
        return;
      }
    }
    if (editing && data.workflows.find((w) => w.id === editing)?.enabled) {
      try {
        await publishWorkflow({ data: { workflowId: editing } });
      } catch (e) {
        toast.error(
          `Draft saved; live version unchanged. ${e instanceof Error ? e.message : "Could not publish"}`,
        );
        refresh();
        return;
      }
    }
    toast.success(editing ? "Workflow draft saved" : "Workflow draft created");
    setF(emptyForm());
    setEditing(null);
    setOpen(false);
    refresh();
  }

  async function toggle(id: string, enabled: boolean) {
    const workflow = data.workflows.find((w) => w.id === id);
    if (enabled && workflow?.trigger === "tool.result") {
      toast.error("Tool result triggers are not available yet. Choose a call event instead.");
      return;
    }
    if (enabled && workflow) {
      const issues = graphErrors(asGraph(workflow.steps), {
        tools: data.tools.map((t) => t.id),
        hooks: data.hooks.map((h) => h.id),
        agents: data.agents.map((a) => a.id),
      });
      if (issues.length) {
        toast.error(issues[0]);
        return;
      }
    }
    if (enabled) {
      try {
        await publishWorkflow({ data: { workflowId: id } });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not publish workflow");
        return;
      }
    }
    const { error } = await supabase
      .from("workflows")
      .update({ enabled })
      .eq("id", id)
      .eq("workspace_id", ws.id);
    if (error) toast.error(error.message);
    else refresh();
  }
  async function remove(id: string, name: string) {
    if (!confirm(`Delete workflow "${name}"?`)) return;
    const { error } = await supabase
      .from("workflows")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ws.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Workflow deleted");
      refresh();
    }
  }

  async function runNow(w: (typeof data.workflows)[number]) {
    if (
      !runConv[w.id] &&
      asGraph(w.steps).nodes.some(
        (n) => n.type === "action" && (n.kind === "tag_conversation" || n.kind === "tag_with_ai"),
      )
    ) {
      toast.error("Select a past call before running a tag action.");
      return;
    }
    if (
      !runConv[w.id] &&
      asGraph(w.steps).nodes.some((n) => n.type === "condition" && n.kind !== "agent_is")
    ) {
      toast.error("Select a past call before testing this condition.");
      return;
    }
    if (
      !runConv[w.id] &&
      needsCall(asGraph(w.steps)) &&
      !confirm("This workflow uses call data. Run without a call anyway?")
    )
      return;
    setRunning(w.id);
    try {
      const r = await run({ data: { id: w.id, conversationId: runConv[w.id] || null } });
      if (r.status === "succeeded") toast.success("Workflow ran successfully");
      else if (r.status === "skipped")
        toast("Workflow was skipped", {
          description:
            r.steps.find((step) => step.status === "skipped")?.detail ?? "No workflow actions ran.",
        });
      else toast.error(r.error ?? "A step failed");
      setHistoryFor(w.id);
      setOpenRun(r.id);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not run the workflow");
    } finally {
      setRunning(null);
    }
  }
  async function duplicate(w: (typeof data.workflows)[number]) {
    const { error } = await supabase
      .from("workflows")
      .insert({
        workspace_id: ws.id,
        name: `${w.name} copy`.slice(0, 80),
        description: w.description,
        trigger: w.trigger,
        trigger_value: w.trigger_value,
        agent_id: w.agent_id,
        steps: w.steps,
        enabled: false,
      });
    if (error) toast.error(error.message);
    else {
      toast.success("Workflow duplicated. It starts turned off.");
      refresh();
    }
  }

  const nameOf = (items: { id: string; name: string }[], id: string | null) =>
    items.find((i) => i.id === id)?.name;

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="Workflows"
        subtitle="Decide what happens before, during, and after a conversation."
        actions={
          !open && (
            <Button
              className="rounded-full"
              onClick={() => {
                setF(emptyForm());
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New workflow
            </Button>
          )
        }
      />

      {open && (
        <GlassCard className="mb-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">{editing ? "Edit workflow" : "New workflow"}</h2>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" /> Close
            </Button>
          </div>
          <form onSubmit={save} className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                required
                maxLength={80}
                placeholder="Name, for example Send qualified leads to CRM"
                aria-label="Workflow name"
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
              <Input
                maxLength={300}
                placeholder="Description (optional)"
                aria-label="Description"
                value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })}
              />
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <select
                className={sel}
                aria-label="Trigger"
                value={f.trigger}
                onChange={(e) => setF({ ...f, trigger: e.target.value as Trigger })}
              >
                {Object.entries(TRIGGERS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {f.trigger === "keyword" ? (
                <Input
                  required
                  placeholder="Keyword, for example cancel"
                  aria-label="Keyword"
                  value={f.trigger_value}
                  onChange={(e) => setF({ ...f, trigger_value: e.target.value })}
                />
              ) : (
                <span />
              )}
              <select
                className={sel}
                aria-label="Agent"
                value={f.agent_id}
                onChange={(e) => setF({ ...f, agent_id: e.target.value })}
              >
                <option value="">Any agent</option>
                {data.agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <WorkflowCanvas
              graph={f.steps}
              onChange={(steps) => setF((current) => ({ ...current, steps }))}
              tools={data.tools}
              hooks={data.hooks}
              agents={data.agents}
            />
            <Button type="submit" className="rounded-full">
              {editing ? "Save workflow" : "Create workflow"}
            </Button>
          </form>
        </GlassCard>
      )}

      {service && (!service.media || !service.runtimeSecret) && (
        <p className="mb-4 text-sm text-muted-foreground">
          Automatic call-triggered workflows need voice media and the runtime secret configured. You
          can still edit and run workflows manually. Configuration does not confirm that a worker is
          currently healthy.
        </p>
      )}
      {data.workflows.length === 0 ? (
        <GlassCard className="py-14 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <GitBranch className="h-6 w-6" />
          </span>
          <h2 className="mt-4 font-semibold">No workflows yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one to tag calls, send summaries, or call tools automatically.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {data.workflows.map((w) => (
            <GlassCard key={w.id}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{w.name}</h3>
                    <SystemLabel tone={w.enabled ? "ok" : "muted"}>
                      {w.enabled ? "Enabled" : "Off"}
                    </SystemLabel>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {TRIGGERS[w.trigger as Trigger]}
                    {w.trigger_value ? ` "${w.trigger_value}"` : ""} ·{" "}
                    {nameOf(data.agents, w.agent_id) ?? "Any agent"} ·{" "}
                    {asGraph(w.steps).nodes.filter((n) => n.type === "action").length} step
                    {asGraph(w.steps).nodes.filter((n) => n.type === "action").length === 1
                      ? ""
                      : "s"}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Enabled{" "}
                  <Switch
                    checked={w.enabled}
                    onCheckedChange={(v) => toggle(w.id, v)}
                    aria-label={`Enable ${w.name}`}
                  />
                </label>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Edit ${w.name}`}
                  onClick={() => {
                    setEditing(w.id);
                    setF({
                      name: w.name,
                      description: w.description,
                      trigger: w.trigger as Trigger,
                      trigger_value: w.trigger_value ?? "",
                      agent_id: w.agent_id ?? "",
                      steps: asGraph(w.steps),
                    });
                    setOpen(true);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Duplicate ${w.name}`}
                  onClick={() => duplicate(w)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${w.name}`}
                  className="hover:text-destructive"
                  onClick={() => remove(w.id, w.name)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <select
                  className={`${sel} py-1 text-xs`}
                  aria-label="Run against a call"
                  value={runConv[w.id] ?? ""}
                  onChange={(e) => setRunConv({ ...runConv, [w.id]: e.target.value })}
                >
                  <option value="">
                    {data.convs.length ? "Run without a call" : "No calls yet. Run without a call"}
                  </option>
                  {data.convs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {new Date(c.started_at).toLocaleString()} ·{" "}
                      {(c.summary ?? "No summary").slice(0, 40)}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  disabled={running === w.id}
                  onClick={() => runNow(w)}
                >
                  <Play className="h-3.5 w-3.5" /> {running === w.id ? "Running" : "Run now"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => setHistoryFor(historyFor === w.id ? null : w.id)}
                >
                  <History className="h-3.5 w-3.5" /> Run history (
                  {data.runs.filter((r) => r.workflow_id === w.id).length})
                </Button>
                {(() => {
                  const last = data.runs.find((r) => r.workflow_id === w.id);
                  return last ? (
                    <SystemLabel
                      tone={
                        last.status === "succeeded"
                          ? "ok"
                          : last.status === "running"
                            ? "muted"
                            : "warn"
                      }
                    >
                      Last run{" "}
                      {last.status === "succeeded"
                        ? "succeeded"
                        : last.status === "running"
                          ? "running"
                          : last.status === "skipped"
                            ? "skipped"
                            : "failed"}
                    </SystemLabel>
                  ) : null;
                })()}
              </div>
              {historyFor === w.id && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-1">
                    {(["all", "succeeded", "failed", "skipped"] as const).map((k) => (
                      <Button
                        key={k}
                        size="sm"
                        variant={filter === k ? "default" : "outline"}
                        className="h-7 rounded-full text-xs capitalize"
                        onClick={() => setFilter(k)}
                      >
                        {k}
                      </Button>
                    ))}
                  </div>
                  {data.runs.filter(
                    (r) => r.workflow_id === w.id && (filter === "all" || r.status === filter),
                  ).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No runs yet. Click Run now to try it.
                    </p>
                  ) : (
                    data.runs
                      .filter(
                        (r) => r.workflow_id === w.id && (filter === "all" || r.status === filter),
                      )
                      .slice(0, 20)
                      .map((r) => (
                        <div key={r.id} className="rounded-xl bg-muted p-3">
                          <Button
                            variant="ghost"
                            className="flex h-auto w-full flex-wrap items-center justify-start gap-2 text-left text-xs"
                            onClick={() => setOpenRun(openRun === r.id ? null : r.id)}
                          >
                            <SystemLabel
                              tone={
                                r.status === "succeeded"
                                  ? "ok"
                                  : r.status === "failed"
                                    ? "warn"
                                    : "muted"
                              }
                            >
                              {r.status === "succeeded"
                                ? "Succeeded"
                                : r.status === "failed"
                                  ? "Failed"
                                  : "Running"}
                            </SystemLabel>
                            <span>{new Date(r.created_at).toLocaleString()}</span>
                            <span className="text-muted-foreground">
                              {r.source === "live" ? "Live call" : "Manual run"}
                              {r.conversation_id ? "" : ", no call"}
                            </span>
                            {r.duration_ms != null && (
                              <span className="ml-auto font-mono text-muted-foreground">
                                {r.duration_ms} ms
                              </span>
                            )}
                          </Button>
                          {openRun === r.id && (
                            <div className="mt-2 space-y-2">
                              {r.error && (
                                <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                                  Failure: {r.error}
                                </p>
                              )}
                              {(() => {
                                const version = data.versions.find(
                                  (v) => v.id === r.workflow_version_id,
                                );
                                const graph = version ? asGraph(version.graph) : null;
                                const results = (r.steps ?? []) as RunStep[];
                                const byNode = new Map(
                                  results.filter((st) => st.nodeId).map((st) => [st.nodeId!, st]),
                                );
                                return (
                                  <>
                                    {version && (
                                      <p className="text-xs text-muted-foreground">
                                        Workflow version {version.version}
                                      </p>
                                    )}
                                    {graph ? (
                                      <ol className="space-y-1 font-mono text-xs">
                                        {graph.nodes.map((node, index) => {
                                          const result = byNode.get(node.id);
                                          const label =
                                            node.type === "trigger"
                                              ? "Start"
                                              : node.type === "end"
                                                ? "End"
                                                : node.type === "condition"
                                                  ? (CONDITIONS[
                                                      node.kind as keyof typeof CONDITIONS
                                                    ] ?? "Condition")
                                                  : (STEPS[node.kind as StepKind]?.label ??
                                                    node.kind ??
                                                    "Action");
                                          const tone =
                                            result?.status === "failed"
                                              ? "border-destructive text-destructive"
                                              : result?.status === "skipped"
                                                ? "border-muted-foreground/30 text-muted-foreground"
                                                : "border-success/40 text-success";
                                          return (
                                            <li
                                              key={node.id}
                                              className={`rounded-md border-l-2 px-2 py-1 ${tone}`}
                                            >
                                              <span>
                                                {index + 1}. {label}:{" "}
                                                {result?.detail ?? "Not reached"}
                                              </span>
                                            </li>
                                          );
                                        })}
                                      </ol>
                                    ) : (
                                      <ol className="space-y-1 font-mono text-xs">
                                        {results.map((st, k) => (
                                          <li
                                            key={`${st.nodeId ?? "step"}-${k}`}
                                            className={
                                              st.status === "failed"
                                                ? "text-destructive"
                                                : st.status === "skipped"
                                                  ? "text-muted-foreground"
                                                  : ""
                                            }
                                          >
                                            {k + 1}.{" "}
                                            {st.kind === "condition"
                                              ? "Condition"
                                              : (STEPS[st.kind as StepKind]?.label ?? st.kind)}
                                            : {st.detail}
                                          </li>
                                        ))}
                                      </ol>
                                    )}
                                    {graph &&
                                      graph.edges.map((edge) => {
                                        const sourceResult = byNode.get(edge.source);
                                        const selected =
                                          !edge.outcome || sourceResult?.outcome === edge.outcome;
                                        return (
                                          <p
                                            key={edge.id}
                                            className={`text-[11px] ${selected ? "text-success" : "text-muted-foreground"}`}
                                          >
                                            {selected ? "Path" : "Skipped path"}:{" "}
                                            {edge.outcome
                                              ? `${edge.outcome === "yes" ? "Yes" : "No"} → `
                                              : "Next → "}
                                            {graph.nodes.find((node) => node.id === edge.target)
                                              ?.value ||
                                              graph.nodes.find((node) => node.id === edge.target)
                                                ?.type}
                                          </p>
                                        );
                                      })}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      ))
                  )}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </>
  );
}
