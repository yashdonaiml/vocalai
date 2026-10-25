import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "@/lib/notify";
import { Link } from "@tanstack/react-router";
import { ChevronDown, FileText, Pencil, Plus, RefreshCw, Search, Upload, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/lib/workspace";
import { ingestSource, testSearch } from "@/lib/platform.functions";

const kbQuery = (ws: string) =>
  queryOptions({
    queryKey: ["kb-full", ws],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_bases")
        .select("id, name, embedding_provider, embedding_model, rerank, knowledge_sources(id, name, kind, status, error, chunk_count, created_at), agent_knowledge_bases(agents(id, name))")
        .eq("workspace_id", ws)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) =>
      q.state.data?.some((k) => k.knowledge_sources.some((s) => s.status === "pending" || s.status === "processing")) ? 2000 : false,
  });

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge: VocollAI" },
      { name: "description", content: "Upload documents your voice agents use to answer callers." },
      { property: "og:title", content: "Knowledge: VocollAI" },
      { property: "og:description", content: "Upload documents your voice agents use to answer callers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Knowledge,
});

function Knowledge() {
  const ws = useWorkspace();
  const { data: kbs } = useSuspenseQuery(kbQuery(ws.id));
  const qc = useQueryClient();
  const [name, setName] = useState("");
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("knowledge_bases").insert({ workspace_id: ws.id, name: name.trim() });
    if (error) { toast.error(error.message); return; }
    setName("");
    qc.invalidateQueries({ queryKey: ["kb-full"] });
    qc.invalidateQueries({ queryKey: ["kbs"] });
  }
  return (
    <>
      <PageHeader eyebrow="Build" title="Knowledge" subtitle="Add documents your agents can answer from." />
      <form onSubmit={create} className="mb-6 flex max-w-md gap-2">
        <Input required maxLength={80} placeholder="New knowledge base, e.g. Menu & hours" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" className="rounded-full"><Plus className="h-4 w-4" /> Create</Button>
      </form>
      {kbs.length === 0 && <GlassCard className="border border-dashed border-border text-center text-muted-foreground">No knowledge bases yet. Create one to add documents.</GlassCard>}
      <div className="space-y-5">
        {kbs.map((kb) => <KbCard key={kb.id} kb={kb} wsId={ws.id} />)}
      </div>
    </>
  );
}

type Kb = { id: string; name: string; embedding_provider: string; embedding_model: string; rerank?: boolean; knowledge_sources: { id: string; name: string; kind: string; status: string; error: string | null; chunk_count: number; created_at: string }[]; agent_knowledge_bases: { agents: { id: string; name: string } | null }[] };

function KbCard({ kb, wsId }: { kb: Kb; wsId: string }) {
  const qc = useQueryClient();
  const ingest = useServerFn(ingestSource);
  const search = useServerFn(testSearch);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ content: string; similarity: number; source_name?: string }[] | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["kb-full"] });

  async function run(sourceId: string, body?: string) {
    refresh();
    try {
      const r = await ingest({ data: { sourceId, text: body } });
      toast.success(`Indexed ${r.chunks} passages`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Indexing failed");
    }
    refresh();
  }

  async function upload(files: FileList | null) {
    for (const f of Array.from(files ?? [])) {
      if (f.size > 20 * 1024 * 1024) { toast.error(`${f.name} is over 20MB`); continue; }
      const path = `${wsId}/${kb.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
      const { error: up } = await supabase.storage.from("knowledge").upload(path, f);
      if (up) { toast.error(up.message); continue; }
      const { data, error } = await supabase.from("knowledge_sources")
        .insert({ knowledge_base_id: kb.id, workspace_id: wsId, kind: "file", name: f.name, storage_path: path }).select("id").single();
      if (error) { toast.error(error.message); continue; }
      void run(data.id);
    }
  }

  async function addText() {
    const { data, error } = await supabase.from("knowledge_sources")
      .insert({ knowledge_base_id: kb.id, workspace_id: wsId, kind: "text", name: text.trim().slice(0, 40) }).select("id").single();
    if (error) { toast.error(error.message); return; }
    const body = text;
    setText("");
    void run(data.id, body);
  }

  async function addUrl(e: React.FormEvent) {
    e.preventDefault();
    let parsed: URL;
    try { parsed = new URL(url.trim()); } catch { toast.error("Enter a full web address starting with https://"); return; }
    if (!/^https?:$/.test(parsed.protocol)) { toast.error("Enter a full web address starting with https://"); return; }
    const { data, error } = await supabase.from("knowledge_sources")
      .insert({ knowledge_base_id: kb.id, workspace_id: wsId, kind: "url", name: parsed.hostname + parsed.pathname.slice(0, 40), source_url: parsed.toString() } as never).select("id").single();
    if (error) { toast.error(error.message); return; }
    setUrl("");
    void run(data.id);
  }

  async function reindexAll() {
    for (const s of kb.knowledge_sources) await run(s.id);
  }

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(kb.name);
  const [open, setOpen] = useState<string | null>(null);
  const agents = kb.agent_knowledge_bases.map((l) => l.agents).filter((a): a is { id: string; name: string } => !!a);

  async function remove(id: string, n: string) {
    if (!confirm(`Remove "${n}" and its indexed passages?`)) return;
    const { error } = await supabase.from("knowledge_sources").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Source removed");
    refresh();
  }
  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase.from("knowledge_bases").update({ name: title.trim() }).eq("id", kb.id);
    if (error) { toast.error(error.message); return; }
    setEditing(false);
    refresh();
    qc.invalidateQueries({ queryKey: ["kbs"] });
  }
  const rerankOn = !!(kb as { rerank?: boolean }).rerank;
  async function toggleRerank() {
    const { error } = await supabase.from("knowledge_bases").update({ rerank: !rerankOn } as never).eq("id", kb.id);
    if (error) { toast.error(error.message); return; }
    toast.success(!rerankOn ? "Smart filtering on" : "Smart filtering off");
    refresh();
  }
  async function removeKb() {
    const warn = agents.length ? ` It is linked to ${agents.map((a) => a.name).join(", ")}; those agents will stop using it.` : "";
    if (!confirm(`Delete "${kb.name}" and all ${kb.knowledge_sources.length} sources?${warn}`)) return;
    await supabase.from("agent_knowledge_bases").delete().eq("knowledge_base_id", kb.id);
    await supabase.from("knowledge_sources").delete().eq("knowledge_base_id", kb.id);
    const { error } = await supabase.from("knowledge_bases").delete().eq("id", kb.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Knowledge base deleted");
    refresh();
    qc.invalidateQueries({ queryKey: ["kbs"] });
  }

  async function doSearch(e: React.FormEvent) {
    e.preventDefault();
    try { setHits(await search({ data: { kbId: kb.id, query: q } })); } catch (err) { toast.error(err instanceof Error ? err.message : "Search failed"); }
  }

  const tone: Record<string, string> = { ready: "text-success", failed: "text-destructive", processing: "text-warning", pending: "text-muted-foreground" };
  return (
    <GlassCard >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <form onSubmit={rename} className="flex gap-2">
            <Input autoFocus maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Knowledge base name" />
            <Button type="submit" size="sm" className="rounded-full">Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setTitle(kb.name); }}>Cancel</Button>
          </form>
        ) : (
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">{kb.name}
              <button onClick={() => setEditing(true)} aria-label="Rename knowledge base" className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
            </h2>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{kb.embedding_provider}/{kb.embedding_model}</span>
              {" · "}
              {agents.length ? <>Used by {agents.map((a, i) => <span key={a.id}>{i > 0 && ", "}<Link to="/agents/$id" params={{ id: a.id }} className="text-primary hover:underline">{a.name}</Link></span>)}</> : "Not linked to any agent yet"}
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="rounded-full" onClick={removeKb} aria-label="Delete knowledge base"><Trash2 className="h-4 w-4" /></Button>
          <Button variant="outline" className="rounded-full" disabled={kb.knowledge_sources.length === 0} onClick={reindexAll}><RefreshCw className="h-4 w-4" /> Re-index all</Button>
          <Button variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload files</Button>
        </div>
        <input ref={fileRef} type="file" multiple hidden accept=".pdf,.docx,.txt,.md,.csv" onChange={(e) => upload(e.target.files)} />
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={rerankOn} onChange={toggleRerank} />
        <span>Smart filtering<span className="block text-xs text-muted-foreground">Checks each search result with AI and drops passages that don't answer the question.</span></span>
      </label>
      <div className="mt-4 divide-y divide-border">
        {kb.knowledge_sources.length === 0 && <p className="py-3 text-sm text-muted-foreground">No files yet. Upload a document to get started.</p>}
        {kb.knowledge_sources.map((s) => (
          <div key={s.id} className="py-2.5 text-sm">
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <button onClick={() => setOpen(open === s.id ? null : s.id)} className="flex flex-1 items-center gap-1 truncate text-left hover:text-primary" aria-expanded={open === s.id}>
              <span className="truncate">{s.name}</span><ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open === s.id ? "rotate-180" : ""}`} />
            </button>
            <span className={tone[s.status] ?? ""} title={s.error ?? ""}>{s.status === "ready" ? `${s.chunk_count} passages` : s.status}</span>
            <button onClick={() => void run(s.id)} disabled={s.status === "processing"} aria-label={`Re-index ${s.name}`} title="Re-index this file" className="text-muted-foreground hover:text-primary disabled:opacity-40"><RefreshCw className="h-4 w-4" /></button>
            <button onClick={() => remove(s.id, s.name)} aria-label={`Remove ${s.name}`} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
          {open === s.id && (
            <dl className="ml-7 mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-muted p-3 text-xs sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Type</dt><dd className="capitalize">{s.kind}</dd></div>
              <div><dt className="text-muted-foreground">Status</dt><dd className="capitalize">{s.status}</dd></div>
              <div><dt className="text-muted-foreground">Passages</dt><dd className="font-mono">{s.chunk_count}</dd></div>
              <div><dt className="text-muted-foreground">Added</dt><dd>{new Date(s.created_at).toLocaleString()}</dd></div>
              {s.error && <div className="col-span-full"><dt className="text-muted-foreground">Last error</dt><dd className="text-destructive">{s.error}</dd></div>}
            </dl>
          )}
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-2">
            <Textarea rows={3} placeholder="Or paste text: FAQs, hours, policies" value={text} onChange={(e) => setText(e.target.value)} />
            <Button size="sm" variant="secondary" className="rounded-full" disabled={text.trim().length < 20} onClick={addText}>Add text</Button>
          </div>
          <form onSubmit={addUrl} className="flex gap-2">
            <Input placeholder="Or add a web page: https://…" aria-label="Web page address" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Button type="submit" size="sm" variant="secondary" className="rounded-full" disabled={url.trim().length < 8}>Add page</Button>
          </form>
        </div>
        <form onSubmit={doSearch} className="space-y-2">
          <div className="flex gap-2">
            <Input placeholder="Test retrieval: what are your hours?" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button type="submit" size="icon" variant="secondary" aria-label="Search"><Search className="h-4 w-4" /></Button>
          </div>
          {hits && (
            <div className="max-h-48 space-y-2 overflow-y-auto text-xs">
              {hits.length === 0 && <p className="text-muted-foreground">Nothing matches your search.</p>}
              {hits.map((h, i) => (
                <p key={i} className="rounded-xl bg-muted p-2"><span className="font-mono text-realtime">{h.similarity.toFixed(2)}</span>{h.source_name && <span className="text-muted-foreground"> · {h.source_name}</span>} {h.content.slice(0, 220)}</p>
              ))}
            </div>
          )}
        </form>
      </div>
    </GlassCard>
  );
}
