import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/lib/notify";
import { z } from "zod";
import { Archive, ArchiveRestore, Bot, Copy, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/lib/workspace";
import { DEFAULT_CONFIG } from "@/lib/agent-config";

export const agentsQuery = (ws: string) =>
  queryOptions({
    queryKey: ["agents", ws],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, name, description, status, live_version, updated_at, config")
        .eq("workspace_id", ws)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const { data: calls } = await supabase.from("conversations").select("agent_id").eq("workspace_id", ws).gte("started_at", since).limit(5000);
      const counts: Record<string, number> = {};
      for (const c of calls ?? []) if (c.agent_id) counts[c.agent_id] = (counts[c.agent_id] ?? 0) + 1;
      return data.map((a) => ({ ...a, calls7d: counts[a.id] ?? 0 }));
    },
  });

const search = z.object({ q: z.string().optional(), status: z.enum(["all", "live", "draft", "archived"]).optional(), sort: z.enum(["updated", "name", "calls"]).optional() });

export const Route = createFileRoute("/_authenticated/agents/")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Agents: VocollAI" },
      { name: "description", content: "Create, search, duplicate, and archive your AI voice agents." },
      { property: "og:title", content: "Agents: VocollAI" },
      { property: "og:description", content: "Create, search, duplicate, and archive your AI voice agents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Agents,
});

const TEMPLATES = [
  { name: "Customer support", description: "Answers questions from your knowledge and hands off when unsure.", prompt: "You are a calm, helpful support agent. Answer only from the provided knowledge. If you are unsure, offer to transfer the caller to a person." },
  { name: "Appointment coordination", description: "Books, moves, and confirms appointments through your scheduling tool.", prompt: "You help callers book, reschedule, or cancel appointments. Confirm the date, time, and name before using any tool." },
  { name: "Lead qualification", description: "Asks qualifying questions and records the result.", prompt: "You qualify inbound interest. Ask about need, timeline, and budget, one question at a time, then summarize." },
  { name: "Order status", description: "Looks up an order and explains its status.", prompt: "You look up order status. Ask for the order number, use the lookup tool, and explain the result plainly." },
  { name: "Internal help desk", description: "Helps staff with policies and common IT requests.", prompt: "You assist employees with internal policies and IT requests using the provided knowledge." },
];

function Agents() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const { data: agents } = useSuspenseQuery(agentsQuery(ws.id));
  const { q = "", status = "all", sort = "updated" } = Route.useSearch();
  const navigate = useNavigate({ from: "/agents/" });
  const [name, setName] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["agents"] });

  async function create(agentName: string, prompt?: string, description = "") {
    const config = prompt ? { ...DEFAULT_CONFIG, instructions: prompt } : DEFAULT_CONFIG;
    const { data, error } = await supabase.from("agents").insert({ workspace_id: ws.id, name: agentName.trim(), description, config: config as never }).select("id").single();
    if (error) { toast.error(error.message); return; }
    refresh();
    navigate({ to: "/agents/$id", params: { id: data.id } });
  }

  async function duplicate(a: (typeof agents)[number]) {
    const { data: created, error } = await supabase.from("agents").insert({ workspace_id: ws.id, name: `${a.name} copy`.slice(0, 80), description: a.description, config: a.config }).select("id").single();
    if (error) { toast.error(error.message); return; }
    const [{ data: kbLinks }, { data: toolLinks }] = await Promise.all([
      supabase.from("agent_knowledge_bases").select("knowledge_base_id").eq("agent_id", a.id),
      supabase.from("agent_tools").select("tool_id").eq("agent_id", a.id),
    ]);
    if (kbLinks?.length) await supabase.from("agent_knowledge_bases").insert(kbLinks.map((l) => ({ agent_id: created.id, knowledge_base_id: l.knowledge_base_id, workspace_id: ws.id })));
    if (toolLinks?.length) await supabase.from("agent_tools").insert(toolLinks.map((l) => ({ agent_id: created.id, tool_id: l.tool_id, workspace_id: ws.id })));
    toast.success("Agent duplicated as a new draft, with its knowledge and tools");
    refresh();
  }
  async function setArchived(a: (typeof agents)[number], archived: boolean) {
    const { error } = await supabase.from("agents").update({ status: archived ? "archived" : a.live_version ? "live" : "draft" }).eq("id", a.id);
    if (error) toast.error(error.message); else { toast.success(archived ? "Agent archived" : "Agent restored"); refresh(); }
  }
  async function archiveSelected() {
    const ids = selected.filter(id => agents.some(a => a.id === id && a.status !== "archived"));
    if (!ids.length || !confirm(`Archive ${ids.length} agents?`)) return;
    const { error } = await supabase.from("agents").update({ status: "archived" }).eq("workspace_id", ws.id).in("id", ids);
    if (error) toast.error(error.message); else { setSelected([]); toast.success(`${ids.length} agents archived`); refresh(); }
  }
  async function remove(a: (typeof agents)[number]) {
    if (!confirm(`Delete "${a.name}" permanently? Its versions and deployments are removed too.`)) return;
    const { error } = await supabase.from("agents").delete().eq("id", a.id);
    if (error) toast.error(error.message.includes("foreign key") ? "This agent has deployments or calls. Archive it instead." : error.message);
    else { toast.success("Agent deleted"); refresh(); }
  }

  const filtered = agents.filter((a) => {
    const st = a.status === "archived" ? "archived" : a.live_version ? "live" : "draft";
    if (status === "all" ? st === "archived" : st !== status) return false;
    return !q || a.name.toLowerCase().includes(q.toLowerCase());
  }).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "calls" ? b.calls7d - a.calls7d : 0);

  return (
    <>
      <PageHeader eyebrow="Build" title="Agents" subtitle="Create and manage your voice agents." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => { e.preventDefault(); void create(name); }} className="flex min-w-72 flex-1 gap-2 sm:max-w-md">
          <Input required maxLength={80} placeholder="New agent name, e.g. Customer support" aria-label="New agent name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" className="rounded-full"><Plus className="h-4 w-4" /> Create</Button>
        </form>
        <Button asChild className="rounded-full"><Link to="/agents/new">Guided setup or AI draft</Link></Button>
        <Button variant="outline" className="rounded-full" onClick={() => setShowTemplates(!showTemplates)}>Start from a template</Button>
      </div>
      {showTemplates && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {TEMPLATES.map((t) => (
            <Button key={t.name} variant="outline" onClick={() => create(t.name, t.prompt, t.description)} className="h-auto flex-col items-start whitespace-normal rounded-2xl p-4 text-left">
              <p className="text-sm font-medium">{t.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
            </Button>
          ))}
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search agents" aria-label="Search agents" value={q} onChange={(e) => navigate({ search: (s) => ({ ...s, q: e.target.value || undefined }), replace: true })} />
        </label>
        {(["all", "live", "draft", "archived"] as const).map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} className="rounded-full capitalize" onClick={() => navigate({ search: (p) => ({ ...p, status: s === "all" ? undefined : s }), replace: true })}>{s === "all" ? "Active" : s}</Button>
        ))}
        <select aria-label="Sort agents" className="ml-auto rounded-md border border-input bg-background px-3 py-1.5 text-sm" value={sort} onChange={(e) => navigate({ search: (p) => ({ ...p, sort: e.target.value === "updated" ? undefined : (e.target.value as "name" | "calls") }), replace: true })}>
          <option value="updated">Recently edited</option><option value="name">Name</option><option value="calls">Most calls this week</option>
        </select>
      </div>
      {status !== "archived" && filtered.length > 0 && <div className="mb-3 flex items-center gap-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={filtered.every(a => selected.includes(a.id))} onChange={e => setSelected(e.target.checked ? filtered.map(a => a.id) : [])} /> Select visible agents</label>{selected.length > 0 && <Button size="sm" variant="outline" onClick={archiveSelected}><Archive className="h-4 w-4" /> Archive {selected.length}</Button>}</div>}
      {filtered.length === 0 ? (
        <GlassCard className="border border-dashed border-border text-center text-muted-foreground">{agents.length === 0 ? "No agents yet. Create one above or start from a template." : "No agents match these filters."}</GlassCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <GlassCard key={a.id} className="flex h-full flex-col border border-border">
              {a.status !== "archived" && <label className="mb-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(a.id)} onChange={e => setSelected(e.target.checked ? [...selected, a.id] : selected.filter(id => id !== a.id))} /> Select {a.name}</label>}
              <Link to="/agents/$id" params={{ id: a.id }} className="flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-intelligence"><Bot className="h-5 w-5" /></span>
                  {a.status === "archived" ? <SystemLabel>Archived</SystemLabel> : a.live_version ? <SystemLabel tone="ok" dot>Live v{a.live_version}</SystemLabel> : <SystemLabel>Draft</SystemLabel>}
                </div>
                <h3 className="mt-4 font-semibold">{a.name}</h3>
                {a.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>}
                <p className="mt-1 text-xs text-muted-foreground">Updated {new Date(a.updated_at).toLocaleDateString()} · {a.calls7d} call{a.calls7d === 1 ? "" : "s"} this week</p>
              </Link>
              <div className="mt-4 flex gap-1 border-t border-border pt-3">
                <Button size="sm" variant="ghost" onClick={() => duplicate(a)}><Copy className="h-3.5 w-3.5" /> Duplicate</Button>
                {a.status === "archived"
                  ? <Button size="sm" variant="ghost" onClick={() => setArchived(a, false)}><ArchiveRestore className="h-3.5 w-3.5" /> Restore</Button>
                  : <Button size="sm" variant="ghost" onClick={() => setArchived(a, true)}><Archive className="h-3.5 w-3.5" /> Archive</Button>}
                <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground hover:text-destructive" aria-label={`Delete ${a.name}`} onClick={() => remove(a)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </>
  );
}
