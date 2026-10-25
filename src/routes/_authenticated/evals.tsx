import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { runEvaluation } from "@/lib/evals.functions";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/lib/notify";
import { Pencil, Play, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader, ScoreRing, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/lib/workspace";

const evalsQuery = (ws: string) =>
  queryOptions({
    queryKey: ["evals", ws],
    queryFn: async () => {
      const [suites, cases, runs, agents, items, published, permission] = await Promise.all([
        supabase.from("eval_suites").select("*").eq("workspace_id", ws).order("created_at"),
        supabase.from("eval_cases").select("*").eq("workspace_id", ws).order("created_at"),
        supabase.from("eval_runs").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(100),
        supabase.from("agents").select("id, name, live_version").eq("workspace_id", ws).order("name"),
        supabase.from("eval_run_items").select("*").eq("workspace_id", ws),
        supabase.from("agent_versions").select("agent_id, version").eq("workspace_id", ws).order("version", { ascending: false }),
        supabase.rpc("is_workspace_member", { _ws: ws, _min: "admin" }),
      ]);
      if ([suites, cases, runs, agents, items, published, permission].some((r) => r.error)) throw new Error("Could not load evaluation evidence.");
      return { suites: (suites.data ?? []).map((s) => ({ ...s, revision: (s as unknown as { revision: number }).revision })), cases: cases.data ?? [], runs: (runs.data ?? []).map((r) => ({ ...r, ...(r as unknown as { agent_id: string | null; suite_revision: number | null; runner_kind: string | null }) })), agents: agents.data ?? [], items: items.data ?? [], published: published.data ?? [], canEdit: permission.data === true };
    },
  });

export const Route = createFileRoute("/_authenticated/evals")({
  head: () => ({
    meta: [
      { title: "Evals: VocollAI" },
      { name: "description", content: "Define caller scenarios and review evaluation runs for your agents." },
      { property: "og:title", content: "Evals: VocollAI" },
      { property: "og:description", content: "Define caller scenarios and review evaluation runs for your agents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Evals,
});

const sel = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function Evals() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(evalsQuery(ws.id));
  const [selected, setSelected] = useState<string | null>(data.suites[0]?.id ?? null);
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState(data.agents[0]?.id ?? "");
  const refresh = () => qc.invalidateQueries({ queryKey: ["evals", ws.id] });

  async function createSuite() {
    if (!name.trim()) return;
    const { data: row, error } = await supabase.from("eval_suites")
      .insert({ workspace_id: ws.id, name: name.trim(), agent_id: agentId || null }).select("id").single();
    if (error) { toast.error(error.message); return; }
    setName("");
    setSelected(row.id);
    refresh();
  }

  const suite = data.suites.find((s) => s.id === selected);

  return (
    <>
      <PageHeader eyebrow="Build" title="Evals" subtitle="Run isolated text regressions on published versions. These tests do not measure live audio or execute external tools." />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <GlassCard className="space-y-3">
            <h2 className="font-semibold">New suite</h2>
            <Input placeholder="e.g. Booking flows" value={name} onChange={(e) => setName(e.target.value)} />
            <select className={sel} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">Any agent</option>
              {data.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <Button className="w-full rounded-full" disabled={!data.canEdit} onClick={createSuite}><Plus className="h-4 w-4" /> Create suite</Button>
          </GlassCard>
          {data.suites.map((s, i) => {
            const last = data.runs.find((r) => r.suite_id === s.id);
            const n = data.cases.filter((c) => c.suite_id === s.id).length;
            return (
              <GlassCard key={s.id} delay={i * 40} active={s.id === selected} onClick={() => setSelected(s.id)} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-medium">{s.name}{s.gates_promotion && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Production gate" />}</p>
                    <p className="font-mono text-xs text-muted-foreground">{n} cases · pass ≥ {s.pass_threshold}</p>
                  </div>
                  {last?.score != null ? <ScoreRing score={last.score} size={44} /> : <SystemLabel>{last ? last.status : "No runs"}</SystemLabel>}
                </div>
              </GlassCard>
            );
          })}
        </div>
        {suite ? (
          <SuiteDetail key={suite.id} suite={suite} data={data} wsId={ws.id} onChange={refresh} onDeleted={() => setSelected(null)} />
        ) : (
          <GlassCard className="grid min-h-64 place-items-center text-center text-sm text-muted-foreground">
            Create a suite to start writing test scenarios.
          </GlassCard>
        )}
      </div>
    </>
  );
}

type Data = Awaited<ReturnType<NonNullable<ReturnType<typeof evalsQuery>["queryFn"]>>>;

function SuiteDetail({ suite, data, wsId, onChange, onDeleted }: { suite: Data["suites"][number]; data: Data; wsId: string; onChange: () => void; onDeleted: () => void }) {
  const cases = data.cases.filter((c) => c.suite_id === suite.id);
  const runs = data.runs.filter((r) => r.suite_id === suite.id);
  const agent = data.agents.find((a) => a.id === suite.agent_id);
  const execute = useServerFn(runEvaluation);
  const [targetAgent, setTargetAgent] = useState(suite.agent_id ?? data.agents[0]?.id ?? "");
  const [targetVersion, setTargetVersion] = useState("");
  const [running, setRunning] = useState(false);
  const published = data.published.filter((v) => v.agent_id === targetAgent);
  const [draft, setDraft] = useState({ title: "", caller_persona: "", scenario: "", rubric: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [edit, setEdit] = useState({ title: "", caller_persona: "", scenario: "", rubric: "" });
  const [version, setVersion] = useState("all");
  const versions = [...new Set(runs.map((r) => r.agent_version))].sort((a, b) => (b ?? 0) - (a ?? 0));
  const shown = version === "all" ? runs : runs.filter((r) => String(r.agent_version ?? "draft") === version);
  const liveRun = runs.find((r) => r.status === "completed" && r.agent_id === agent?.id && r.agent_version === agent?.live_version && r.suite_revision === suite.revision && r.score != null);
  const gate = !suite.gates_promotion ? null : liveRun && liveRun.score! >= suite.pass_threshold ? "pass" : "blocking";
  async function saveEdit() {
    if (!edit.title.trim()) { toast.error("Give the case a title"); return; }
    const { error } = await supabase.from("eval_cases").update(edit).eq("id", editId!);
    if (error) { toast.error(error.message); return; }
    setEditId(null);
    onChange();
  }

  async function update(patch: { pass_threshold?: number; gates_promotion?: boolean }) {
    const { error } = await supabase.from("eval_suites").update(patch).eq("id", suite.id);
    if (error) toast.error(error.message); else onChange();
  }
  async function addCase() {
    if (!draft.title.trim()) { toast.error("Give the case a title"); return; }
    const { error } = await supabase.from("eval_cases").insert({ ...draft, suite_id: suite.id, workspace_id: wsId });
    if (error) { toast.error(error.message); return; }
    setDraft({ title: "", caller_persona: "", scenario: "", rubric: "" });
    onChange();
  }
  async function removeCase(id: string, t: string) {
    if (!confirm(`Delete case "${t}"?`)) return;
    const { error } = await supabase.from("eval_cases").delete().eq("id", id);
    if (error) toast.error(error.message);
    onChange();
  }
  async function run() {
    const selectedVersion = Number(targetVersion || published[0]?.version);
    if (!cases.length || !targetAgent || !Number.isInteger(selectedVersion) || selectedVersion < 1) { toast.error("Choose an agent, a published version and at least one case."); return; }
    setRunning(true);
    try {
      const result = await execute({ data: { suiteId: suite.id, agentId: targetAgent, version: selectedVersion } });
      toast.success(`Text regression completed: ${result.passed}/${result.total} cases passed.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Evaluation failed."); }
    finally { setRunning(false); onChange(); }
  }
  async function removeSuite() {
    if (!confirm(`Delete "${suite.name}"?`)) return;
    await supabase.from("eval_suites").delete().eq("id", suite.id);
    onDeleted();
    onChange();
  }

  return (
    <div className="space-y-5">
      <GlassCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{suite.name}</h2>
            <p className="text-sm text-muted-foreground">{agent ? agent.name : "Any agent"}{agent?.live_version ? ` · live v${agent.live_version}` : ""}</p>
            {gate && <div className="mt-2"><SystemLabel tone={gate === "pass" ? "ok" : "warn"} dot>{gate === "pass" ? "Gate passing on live version" : "Gate blocks full rollout until a passing run"}</SystemLabel></div>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" className="rounded-full" disabled={!data.canEdit || running} onClick={removeSuite} aria-label="Delete suite"><Trash2 className="h-4 w-4" /></Button>
            <Button className="rounded-full" disabled={!data.canEdit || running} onClick={run}><Play className="h-4 w-4" /> {running ? "Running text regression..." : "Run text regression"}</Button>
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <p className="text-sm text-muted-foreground">Text-only, one-turn regression. No tools or retrieval run. Native realtime versions require a runtime evaluation runner. Suite changes invalidate earlier promotion evidence.</p>
          <div className="flex flex-wrap gap-3">
            <select aria-label="Evaluation agent" className={sel} disabled={Boolean(suite.agent_id) || running} value={targetAgent} onChange={(e) => { setTargetAgent(e.target.value); setTargetVersion(""); }}>
              {data.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select aria-label="Published version to evaluate" className={sel} disabled={running} value={targetVersion || String(published[0]?.version ?? "")} onChange={(e) => setTargetVersion(e.target.value)}>
              {!published.length && <option value="">Publish a version first</option>}
              {published.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}
            </select>
          </div>
          {!data.canEdit && <p className="text-sm text-muted-foreground">Only workspace admins can edit suites or run evaluations.</p>}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-6 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Pass threshold</span>
            <Input disabled={!data.canEdit} type="number" min={1} max={100} className="w-20 font-mono" defaultValue={suite.pass_threshold}
              onBlur={(e) => update({ pass_threshold: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} />
          </label>
          <label className="flex items-center gap-2">
            <input disabled={!data.canEdit} type="checkbox" className="h-4 w-4 accent-primary" checked={suite.gates_promotion} onChange={(e) => update({ gates_promotion: e.target.checked })} />
            <span>Production gate: full rollouts need a passing run (canaries exempt)</span>
          </label>
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="mb-3 font-semibold">Test cases</h3>
        <div className="space-y-3">
          {cases.map((c) => (
            <div key={c.id} className="rounded-lg border border-border p-4">
              {editId === c.id ? (
                <div className="space-y-2">
                  <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} aria-label="Case title" />
                  <Input value={edit.caller_persona} onChange={(e) => setEdit({ ...edit, caller_persona: e.target.value })} aria-label="Simulated caller" />
                  <Textarea rows={2} value={edit.scenario} onChange={(e) => setEdit({ ...edit, scenario: e.target.value })} aria-label="Scenario" />
                  <Textarea rows={2} value={edit.rubric} onChange={(e) => setEdit({ ...edit, rubric: e.target.value })} aria-label="Rubric" />
                  <div className="flex gap-2"><Button size="sm" className="rounded-full" disabled={!data.canEdit} onClick={saveEdit}>Save case</Button><Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button></div>
                </div>
              ) : <>
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{c.title}</p>
                <div className="flex gap-2">
                  <button disabled={!data.canEdit} onClick={() => { setEditId(c.id); setEdit({ title: c.title, caller_persona: c.caller_persona, scenario: c.scenario, rubric: c.rubric }); }} className="text-muted-foreground hover:text-foreground" aria-label={`Edit ${c.title}`}><Pencil className="h-4 w-4" /></button>
                  <button disabled={!data.canEdit} onClick={() => removeCase(c.id, c.title)} className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${c.title}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {c.caller_persona && <p className="mt-1 text-sm"><span className="text-muted-foreground">Caller:</span> {c.caller_persona}</p>}
              {c.scenario && <p className="mt-1 text-sm"><span className="text-muted-foreground">Scenario:</span> {c.scenario}</p>}
              {c.rubric && <p className="mt-1 text-sm"><span className="text-muted-foreground">Pass if:</span> {c.rubric}</p>}
              </>}
            </div>
          ))}
          {cases.length === 0 && <p className="text-sm text-muted-foreground">No test cases yet. Add one to start testing.</p>}
        </div>
        <div className="mt-5 space-y-3 border-t border-border pt-5">
          <Input placeholder="Case title: e.g. Reschedule an appointment" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <Input placeholder="Simulated caller: e.g. Impatient, speaks fast, has an order number" value={draft.caller_persona} onChange={(e) => setDraft({ ...draft, caller_persona: e.target.value })} />
          <Textarea rows={2} placeholder="What the caller wants and how the call should go" value={draft.scenario} onChange={(e) => setDraft({ ...draft, scenario: e.target.value })} />
          <Textarea rows={2} placeholder="Rubric: what counts as a pass" value={draft.rubric} onChange={(e) => setDraft({ ...draft, rubric: e.target.value })} />
          <Button variant="outline" className="rounded-full" disabled={!data.canEdit} onClick={addCase}><Plus className="h-4 w-4" /> Add case</Button>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold">Run history</h3>
          {versions.length > 0 && (
            <select className="rounded-md border border-input bg-background px-2 py-1 text-sm" value={version} onChange={(e) => setVersion(e.target.value)} aria-label="Filter by version">
              <option value="all">All versions</option>
              {versions.map((v) => <option key={String(v)} value={String(v ?? "draft")}>{v ? `v${v}` : "Draft"}</option>)}
            </select>
          )}
        </div>
        {shown.length === 0 ? <p className="text-sm text-muted-foreground">No runs yet. Run the suite to see results.</p> : (
          <ul className="divide-y divide-border">
            {shown.map((r) => {
              const pass = r.status === "completed" && r.suite_revision === suite.revision && r.score != null && r.score >= suite.pass_threshold;
              const runItems = data.items.filter((it) => it.run_id === r.id);
              const open = expanded === r.id;
              return (
                <li key={r.id} className="py-3 text-sm">
                  <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setExpanded(open ? null : r.id)} aria-expanded={open}>
                    <div>
                      <p className="font-mono">{r.agent_version ? `v${r.agent_version}` : "draft"} · {r.passed}/{r.total}</p>
                      <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.score != null && <span className="font-mono">{r.score}</span>}
                      <SystemLabel tone={r.score == null ? (r.status === "running" ? "live" : "muted") : pass ? "ok" : "warn"}>
                        {r.score == null ? r.status : pass ? "Pass" : "Fail"}
                      </SystemLabel>
                    </div>
                  </button>
                  {open && (
                    <div className="mt-2 space-y-1 rounded-xl bg-muted p-3 text-xs">
                      {runItems.length === 0 && <p className="text-muted-foreground">No per-case results recorded for this run.</p>}
                      {runItems.map((it) => (
                        <div key={it.id} className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{it.case_title}</p>
                            {it.notes && <p className="text-muted-foreground">{it.notes}</p>}
                          </div>
                          <SystemLabel tone={it.passed == null ? "muted" : it.passed ? "ok" : "warn"}>{it.passed == null ? "Pending" : it.passed ? "Pass" : "Fail"}</SystemLabel>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
