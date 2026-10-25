import { useCallback, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, Handle, Position, applyNodeChanges, applyEdgeChanges, type Connection, type NodeChange, type EdgeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { compileFlow, flowErrors, newFlow, type ConversationFlow, type FlowNode } from "@/lib/agent-config";

const label = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const uid = () => crypto.randomUUID();
const KIND = { start: "Start", step: "Step", end: "End" } as const;

function Tile({ data }: { data: { kind: string; title: string; say: string; first: boolean; last: boolean } }) {
  return (
    <div className="w-52 rounded-xl border border-border bg-card px-4 py-3 shadow-card">
      {!data.first && <Handle type="target" position={Position.Left} className="!bg-primary" />}
      <p className="text-xs text-muted-foreground">{data.kind}</p>
      <p className="truncate font-semibold">{data.title || "Untitled"}</p>
      <p className="line-clamp-2 text-xs text-muted-foreground">{data.say || "Select to describe this step"}</p>
      {!data.last && <Handle type="source" position={Position.Right} className="!bg-primary" />}
    </div>
  );
}
const nodeTypes = { tile: Tile };

export function FlowEditor({ value, onChange }: { value: ConversationFlow | undefined; onChange: (f: ConversationFlow | undefined) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const flow = value;
  const nodes = useMemo(() => (flow?.nodes ?? []).map((n) => ({ id: n.id, type: "tile", position: { x: n.x, y: n.y }, selected: n.id === selected, data: { kind: KIND[n.type], title: n.title, say: n.say, first: n.type === "start", last: n.type === "end" } })), [flow?.nodes, selected]);
  const edges = useMemo(() => (flow?.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.when || undefined })), [flow?.edges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    if (!flow) return;
    const next = applyNodeChanges(changes, nodes);
    if (changes.some((c) => c.type === "position")) onChange({ ...flow, nodes: flow.nodes.map((n) => { const p = next.find((v) => v.id === n.id)?.position; return p ? { ...n, x: p.x, y: p.y } : n; }) });
  }, [flow, nodes, onChange]);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (!flow) return;
    const next = applyEdgeChanges(changes, edges);
    if (changes.some((c) => c.type === "remove")) onChange({ ...flow, edges: flow.edges.filter((e) => next.some((v) => v.id === e.id)) });
  }, [flow, edges, onChange]);
  const connect = useCallback((c: Connection) => {
    if (!flow || !c.source || !c.target || c.source === c.target) return;
    if (flow.edges.some((e) => e.source === c.source && e.target === c.target)) return;
    onChange({ ...flow, edges: [...flow.edges, { id: uid(), source: c.source, target: c.target, when: "" }] });
  }, [flow, onChange]);

  if (!flow) {
    return (
      <GlassCard className="max-w-3xl space-y-3">
        <h2 className="font-semibold">Conversation flow</h2>
        <p className="text-sm text-muted-foreground">Draw the steps of a call and where each caller answer leads. The agent follows the flow alongside its instructions.</p>
        <Button className="rounded-full" onClick={() => onChange(newFlow())}><Plus className="h-4 w-4" /> Start a flow</Button>
      </GlassCard>
    );
  }

  const current = flow.nodes.find((n) => n.id === selected);
  const update = (n: FlowNode) => onChange({ ...flow, nodes: flow.nodes.map((x) => (x.id === n.id ? n : x)) });
  const add = (type: "step" | "end") => {
    const n: FlowNode = { id: uid(), type, title: type === "end" ? "Wrap up" : "New step", say: "", x: 120 + flow.nodes.length * 60, y: 280 };
    onChange({ ...flow, nodes: [...flow.nodes, n] });
    setSelected(n.id);
  };
  const remove = (id: string) => { onChange({ ...flow, nodes: flow.nodes.filter((n) => n.id !== id), edges: flow.edges.filter((e) => e.source !== id && e.target !== id) }); setSelected(null); };
  const errors = flowErrors(flow);
  const outs = current ? flow.edges.filter((e) => e.source === current.id) : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => add("step")}><Plus className="h-4 w-4" /> Step</Button>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => add("end")}><Plus className="h-4 w-4" /> End</Button>
        <label className="ml-auto flex items-center gap-2 text-sm">Use this flow <Switch checked={flow.enabled} onCheckedChange={(enabled) => onChange({ ...flow, enabled })} /></label>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => { if (confirm("Remove the whole flow?")) onChange(undefined); }}>Remove flow</Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="hidden h-[480px] overflow-hidden rounded-2xl border border-border bg-muted/40 md:block">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect} onNodeClick={(_, n) => setSelected(n.id)} onPaneClick={() => setSelected(null)} fitView proOptions={{ hideAttribution: true }}>
            <Background /><Controls />
          </ReactFlow>
        </div>
        <GlassCard className="space-y-3">
          {!current ? (
            <>
              <h3 className="font-semibold">Steps</h3>
              <p className="text-xs text-muted-foreground">Select a step to edit it. Drag from a step's right dot to another step to connect them.</p>
              <ol className="space-y-1">
                {flow.nodes.map((n) => <li key={n.id}><button className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setSelected(n.id)}>{KIND[n.type]}: {n.title || "Untitled"}</button></li>)}
              </ol>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between"><h3 className="font-semibold">{KIND[current.type]} step</h3>{current.type !== "start" && <Button size="sm" variant="ghost" aria-label="Delete step" onClick={() => remove(current.id)}><Trash2 className="h-4 w-4" /></Button>}</div>
              <label className="block"><span className={label}>Name</span><Input className="mt-1.5" maxLength={60} value={current.title} onChange={(e) => update({ ...current, title: e.target.value })} /></label>
              <label className="block"><span className={label}>What the agent does here</span><Textarea className="mt-1.5" rows={3} maxLength={600} placeholder="Ask for the caller's name and reason for calling" value={current.say} onChange={(e) => update({ ...current, say: e.target.value })} /></label>
              {current.type !== "end" && (
                <div className="space-y-2">
                  <span className={label}>Goes to</span>
                  {outs.map((e) => (
                    <div key={e.id} className="space-y-1 rounded-lg border border-border p-2">
                      <div className="flex items-center justify-between text-sm"><span>{flow.nodes.find((n) => n.id === e.target)?.title ?? "Missing step"}</span><Button size="sm" variant="ghost" aria-label="Remove path" onClick={() => onChange({ ...flow, edges: flow.edges.filter((x) => x.id !== e.id) })}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                      <Input maxLength={160} placeholder={outs.length > 1 ? "When, for example the caller wants to book" : "When (optional)"} value={e.when} onChange={(ev) => onChange({ ...flow, edges: flow.edges.map((x) => (x.id === e.id ? { ...x, when: ev.target.value } : x)) })} />
                    </div>
                  ))}
                  <select aria-label="Add a path" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value="" onChange={(e) => e.target.value && connect({ source: current.id, target: e.target.value, sourceHandle: null, targetHandle: null })}>
                    <option value="">Add a path to</option>
                    {flow.nodes.filter((n) => n.id !== current.id && n.type !== "start" && !outs.some((o) => o.target === n.id)).map((n) => <option key={n.id} value={n.id}>{n.title || "Untitled"}</option>)}
                  </select>
                </div>
              )}
              <Button size="sm" variant="outline" onClick={() => setSelected(null)}>Done</Button>
            </>
          )}
        </GlassCard>
      </div>
      {errors.length > 0 ? (
        <GlassCard className="border border-warning/40 text-sm"><p className="font-medium">Finish the flow before publishing</p><ul className="mt-1 list-disc pl-5 text-muted-foreground">{errors.map((e) => <li key={e}>{e}</li>)}</ul></GlassCard>
      ) : (
        <details className="rounded-2xl border border-border bg-card p-4 text-sm"><summary className="cursor-pointer font-medium">What the agent will follow</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-muted-foreground">{flow.enabled ? compileFlow(flow) : "The flow is turned off."}</pre></details>
      )}
    </div>
  );
}
