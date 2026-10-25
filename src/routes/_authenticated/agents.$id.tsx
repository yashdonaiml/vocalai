import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/lib/notify";
import { ArrowLeft, Rocket, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/lib/workspace";
import { agentDraftChecksum, flowErrors, normalizeConfig, serializeDraftSnapshot, type AgentConfig } from "@/lib/agent-config";
import { FlowEditor } from "@/components/agent-flow";
import { RuntimeEditor, TestCall } from "@/components/agent-runtime";
import { agentPublishReadiness, publishAgentVersion } from "@/lib/tools.functions";
import { platformStatus } from "@/lib/platform.functions";
import { useServerFn } from "@tanstack/react-start";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CallBehaviorEditor, TestChat, diffConfigs } from "@/components/agent-studio-extras";

const agentQuery = (id: string) =>
  queryOptions({
    queryKey: ["agent", id],
    queryFn: async () => {
      const [{ data: agent, error }, { data: links }, { data: versions }, { data: toolLinks }, { data: deps }, { data: sources }] = await Promise.all([
        supabase.from("agents").select("*").eq("id", id).single(),
        supabase.from("agent_knowledge_bases").select("knowledge_base_id").eq("agent_id", id),
        supabase.from("agent_versions").select("version, created_at, config, release_note, published_by").eq("agent_id", id).order("version", { ascending: false }),
        supabase.from("agent_tools").select("tool_id").eq("agent_id", id),
        supabase.from("deployments").select("agent_version, status, canary_percent, environments(name)").eq("agent_id", id).eq("status", "active"),
        supabase.from("knowledge_sources").select("knowledge_base_id, status"),
      ]);
      if (error) throw error;
      return { agent, kbIds: (links ?? []).map((l) => l.knowledge_base_id), versions: versions ?? [], toolIds: (toolLinks ?? []).map((t) => t.tool_id), deps: deps ?? [], sources: sources ?? [] };
    },
  });

const kbsQuery = (ws: string) =>
  queryOptions({
    queryKey: ["kbs", ws],
    queryFn: async () => (await supabase.from("knowledge_bases").select("id, name").eq("workspace_id", ws).order("created_at")).data ?? [],
  });

const toolsQuery = (ws: string) =>
  queryOptions({
    queryKey: ["tools", ws],
    queryFn: async () => (await supabase.from("tools").select("id, name, description").eq("workspace_id", ws).order("name")).data ?? [],
  });

export const Route = createFileRoute("/_authenticated/agents/$id")({
  head: () => ({
    meta: [
      { title: "Agent studio: VocollAI" },
      { name: "description", content: "Configure, test and publish a voice agent." },
      { property: "og:title", content: "Agent studio: VocollAI" },
      { property: "og:description", content: "Configure, test and publish a voice agent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Studio,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Studio() {
  const { id } = Route.useParams();
  const ws = useWorkspace();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(agentQuery(id));
  const { data: kbs } = useSuspenseQuery(kbsQuery(ws.id));
  const { data: tools } = useSuspenseQuery(toolsQuery(ws.id));
  const getStatus = useServerFn(platformStatus);
  const { data: service, isLoading: serviceLoading, isError: serviceError } = useQuery({ queryKey: ["agent-service-status"], queryFn: getStatus, staleTime: 60_000 });
  const getReadiness = useServerFn(agentPublishReadiness);
  const { data: serverReadiness, isLoading: readinessLoading, error: readinessError } = useQuery({
    queryKey: ["agent-publish-readiness", id],
    queryFn: () => getReadiness({ data: { agentId: id } }),
    staleTime: 30_000,
  });
  const { data: accounts = [] } = useQuery({ queryKey: ["agent-provider-accounts", ws.org_id], queryFn: async () => { const { data, error } = await supabase.from("provider_accounts").select("provider").eq("org_id", ws.org_id); if (error) throw error; return data ?? []; } });
  const [toolIds, setToolIds] = useState<string[]>(data.toolIds);
  const [name, setName] = useState(data.agent.name);
  const [description, setDescription] = useState(data.agent.description);
  const [cfg, setCfg] = useState<AgentConfig>(normalizeConfig(data.agent.config));
  const [kbIds, setKbIds] = useState<string[]>(data.kbIds);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [releaseNote, setReleaseNote] = useState("");
  const [compare, setCompare] = useState<[number | null, number | null]>([null, null]);
  // Snapshot of the last successful save; must stay stable so the editor cannot publish a stale draft.
  const [saved, setSaved] = useState(() => serializeDraftSnapshot({
    name: data.agent.name,
    description: data.agent.description,
    cfg: data.agent.config,
    kbIds: data.kbIds,
    toolIds: data.toolIds,
  }));
  const dirty = serializeDraftSnapshot({ name, description, cfg, kbIds, toolIds }) !== saved;
  const set = <K extends keyof AgentConfig>(k: K, v: AgentConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  async function persist(): Promise<boolean> {
    if (!name.trim()) { toast.error("Give the agent a name"); return false; }
    const steps = [
      () => supabase.from("agents").update({ name: name.trim(), description: description.trim(), config: cfg, updated_at: new Date().toISOString() }).eq("id", id),
      () => supabase.from("agent_knowledge_bases").delete().eq("agent_id", id),
      () => kbIds.length ? supabase.from("agent_knowledge_bases").insert(kbIds.map((k) => ({ agent_id: id, knowledge_base_id: k, workspace_id: ws.id }))) : Promise.resolve({ error: null }),
      () => supabase.from("agent_tools").delete().eq("agent_id", id),
      () => toolIds.length ? supabase.from("agent_tools").insert(toolIds.map((t) => ({ agent_id: id, tool_id: t, workspace_id: ws.id }))) : Promise.resolve({ error: null }),
    ];
    for (const step of steps) {
      const { error } = await step();
      if (error) { toast.error(`Could not save: ${error.message}`); return false; }
    }
    const nextSaved = serializeDraftSnapshot({ name: name.trim(), description: description.trim(), cfg, kbIds, toolIds });
    setSaved(nextSaved);
    if (name !== name.trim()) setName(name.trim());
    qc.invalidateQueries({ queryKey: ["agent", id] });
    qc.invalidateQueries({ queryKey: ["agents"] });
    qc.invalidateQueries({ queryKey: ["agent-publish-readiness", id] });
    return true;
  }

  async function save() {
    setSaving(true);
    const ok = await persist();
    setSaving(false);
    if (ok) toast.success("Draft saved");
  }

  const problems = [
    !cfg.instructions.trim() && "Add instructions on the Conversation tab.",
    !cfg.greeting.trim() && "Add an opening line on the Conversation tab.",
    data.sources.some((s) => kbIds.includes(s.knowledge_base_id) && s.status !== "ready" && s.status !== "failed") && "Wait for attached knowledge files to finish processing.",
    data.sources.some((s) => kbIds.includes(s.knowledge_base_id) && s.status === "failed") && "Fix or remove knowledge files that failed to process.",
    cfg.flow?.enabled && flowErrors(cfg.flow)[0] && `Fix the conversation flow: ${flowErrors(cfg.flow)[0]}`,
  ].filter(Boolean) as string[];
  const publishProblems = [...problems, ...(!dirty ? serverReadiness?.blockers ?? [] : [])];
  const deploymentWarnings = service ? [
    !service.media && "Voice calls need the voice media service configured.",
    !service.runtimeSecret && "Voice calls need the runtime shared secret configured.",
  ].filter(Boolean) as string[] : [];

  async function publish() {
    if (publishProblems.length) { toast.error(`Can't publish yet. ${publishProblems[0]}`); setActiveTab("versions"); return; }
    setSaving(true);
    try {
      if (dirty) {
        const ok = await persist();
        if (!ok) return;
      }
      const draftChecksum = await agentDraftChecksum({ name, description, cfg, kbIds, toolIds });
      const { version: next } = await publishAgentVersion({ data: { agentId: id, releaseNote: releaseNote.trim() || null, draftChecksum } });
      toast.success(`Published v${next}. Deploy it from Deployments.`);
      setReleaseNote("");
      qc.invalidateQueries({ queryKey: ["agent", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Link to="/agents" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Agents
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 max-w-md border-none bg-transparent px-0 text-3xl font-bold tracking-tight focus-visible:ring-0" />
        <div className="flex items-center gap-2">
          {dirty ? <SystemLabel tone="warn" dot>Unsaved changes</SystemLabel> : data.agent.live_version ? <SystemLabel tone="deployed" dot>Deployed v{data.agent.live_version}</SystemLabel> : <SystemLabel>Draft</SystemLabel>}
          <Button variant="outline" className="rounded-full" onClick={save} disabled={saving}><Save className="h-4 w-4" /> Save draft</Button>
          <Button className="rounded-full" onClick={publish} disabled={saving}><Rocket className="h-4 w-4" /> Publish v{(data.versions[0]?.version ?? 0) + 1}</Button>
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto pb-2">
          <TabsList className="h-auto min-w-max justify-start rounded-xl border border-border bg-card p-1 shadow-card">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="conversation">Conversation</TabsTrigger>
            <TabsTrigger value="flow">Flow</TabsTrigger>
            <TabsTrigger value="voice">Voice and AI</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="behavior">Call behavior</TabsTrigger>
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="test">Test</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="general" className="max-w-3xl">
          <GlassCard className="space-y-4">
            <h2 className="font-semibold">Identity</h2>
            <Field label="Description"><Textarea rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} /><span className="text-xs text-muted-foreground">{description.length}/300</span></Field>
            <Field label="Persona"><Input value={cfg.persona} onChange={(e) => set("persona", e.target.value)} /></Field>
            <Field label="Language"><Input value={cfg.language} onChange={(e) => set("language", e.target.value)} /></Field>
          </GlassCard>
        </TabsContent>
        <TabsContent value="conversation" className="max-w-3xl">
          <GlassCard className="space-y-4">
            <h2 className="font-semibold">Conversation behavior</h2>
            <Field label="Instructions"><Textarea rows={5} maxLength={12000} value={cfg.instructions} onChange={(e) => set("instructions", e.target.value)} /><span className="text-xs text-muted-foreground">{cfg.instructions.length}/12000</span></Field>
            <Field label="Opening line"><Input maxLength={400} value={cfg.greeting} onChange={(e) => set("greeting", e.target.value)} /><span className="text-xs text-muted-foreground">{cfg.greeting.length}/400</span></Field>
          </GlassCard>
        </TabsContent>
        <TabsContent value="flow">
          <FlowEditor value={cfg.flow} onChange={(flow) => set("flow", flow)} />
        </TabsContent>
        <TabsContent value="voice" className="max-w-3xl">
          <GlassCard className="space-y-4">
            <h2 className="font-semibold">Voice and AI models</h2>
            <Field label="Speaking style">
              <select className="w-full rounded-md border bg-background p-2 text-sm" value={cfg.speechStyle ?? "default"} onChange={(e) => {
                const style = e.target.value as "default" | "te-en";
                setCfg((previous) => ({ ...previous, speechStyle: style, ...(style === "te-en" ? {
                  language: "Telugu-English",
                  runtime: { mode: "composable", stt: { provider: "deepgram", model: "nova-3", language: "multi" }, llm: previous.runtime.mode === "composable" ? previous.runtime.llm : { provider: "google", model: "gemini-3.1-flash-lite" }, tts: { provider: "cartesia", model: "sonic-3.6", voice: "07bc462a-c644-49f1-baf7-82d5599131be", language: "te" } },
                } : {}) }));
              }}>
                <option value="default">Follow agent instructions</option>
                <option value="te-en">Natural Telugu-English</option>
              </select>
              <span className="text-xs text-muted-foreground">Telugu-English uses everyday Telugu with familiar English words. Callers can request English or Telugu.</span>
            </Field>
            <RuntimeEditor value={cfg.runtime} onChange={(runtime) => set("runtime", runtime)} />
          </GlassCard>
        </TabsContent>
        <TabsContent value="behavior" className="max-w-3xl">
          <CallBehaviorEditor value={cfg.callBehavior} onChange={(v) => set("callBehavior", v)} />
        </TabsContent>
        <TabsContent value="policies" className="max-w-3xl">
          <GlassCard className="space-y-4">
            <h2 className="font-semibold">Guardrails and handoff</h2>
            <Field label="Guardrails"><Textarea rows={3} value={cfg.guardrails} onChange={(e) => set("guardrails", e.target.value)} /></Field>
            <Field label="Human handoff"><Textarea rows={2} value={cfg.handoff} onChange={(e) => set("handoff", e.target.value)} /></Field>
          </GlassCard>
        </TabsContent>
        <TabsContent value="knowledge" className="max-w-3xl">
          <GlassCard className="space-y-4">
            <h2 className="font-semibold">Knowledge sources</h2>
            {kbIds.length > 0 && <p className="text-sm text-muted-foreground">{data.sources.filter(s => kbIds.includes(s.knowledge_base_id) && s.status === "ready").length} ready · {data.sources.filter(s => kbIds.includes(s.knowledge_base_id) && s.status !== "ready" && s.status !== "failed").length} processing · {data.sources.filter(s => kbIds.includes(s.knowledge_base_id) && s.status === "failed").length} failed</p>}
            {kbs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No knowledge bases yet. <Link to="/knowledge" className="text-primary">Create one</Link>.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {kbs.map((k) => {
                  const on = kbIds.includes(k.id);
                  return (
                    <Button type="button" size="sm" variant={on ? "default" : "outline"} key={k.id} onClick={() => setKbIds(on ? kbIds.filter((x) => x !== k.id) : [...kbIds, k.id])}>
                      {k.name}
                    </Button>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </TabsContent>
        <TabsContent value="tools" className="max-w-3xl">
          <GlassCard className="space-y-4">
            <h2 className="font-semibold">Connected tools</h2>
            {toolIds.length > 0 && <p className="text-sm text-muted-foreground">{toolIds.length} attached. Test each tool on the Tools page before using it in a live call. Tool tests are not saved, so their status cannot be confirmed here.</p>}
            {tools.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tools yet. <Link to="/tools" className="text-primary">Add a webhook tool</Link>.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tools.map((t) => {
                  const on = toolIds.includes(t.id);
                  return (
                    <Button type="button" size="sm" variant={on ? "default" : "outline"} key={t.id} title={t.description} onClick={() => setToolIds(on ? toolIds.filter((x) => x !== t.id) : [...toolIds, t.id])} className="font-mono">
                      {t.name}
                    </Button>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </TabsContent>
        <TabsContent value="test" className="max-w-3xl">
          <div className="space-y-4">
            {(() => { const provider = cfg.runtime.mode === "native" ? cfg.runtime.realtime.provider === "google" ? "google" : "openai" : cfg.runtime.llm.provider; const available = ["openai", "anthropic", "google"].includes(provider) && (accounts.some(a => a.provider === provider) || Boolean(service?.keys.some(k => k.provider === provider && k.configured))); return available ? <TestChat agentId={id} dirty={dirty} /> : <GlassCard><h2 className="font-semibold">Text test</h2><p className="mt-2 text-sm text-muted-foreground">Add a {provider} key in <Link to="/models" className="text-primary underline">Providers</Link> to test this agent.</p></GlassCard>; })()}
            {service?.media && service.runtimeSecret ? <TestCall agentId={id} /> : <GlassCard><h2 className="font-semibold">Test call</h2><p className="mt-2 text-sm text-muted-foreground">Voice testing is unavailable until the voice service is connected. You can still save and publish your agent.</p></GlassCard>}
          </div>
        </TabsContent>
        <TabsContent value="versions" className="max-w-3xl space-y-4">
          <GlassCard className="space-y-3">
            <h2 className="font-semibold">Ready to publish?</h2>
            {dirty && <p className="text-sm text-muted-foreground">Save the draft to refresh provider and tool checks for these changes.</p>}
            {!dirty && readinessLoading && <p className="text-sm text-muted-foreground">Checking provider and tool readiness…</p>}
            {!dirty && readinessError && <p className="text-sm text-warning">Readiness checks could not be loaded. The server will validate before creating a version.</p>}
            {publishProblems.length === 0 && !readinessLoading && !readinessError
              ? <p className="text-sm text-success">All publish checks passed.</p>
              : publishProblems.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-warning">{publishProblems.map((p) => <li key={p}>{p}</li>)}</ul>}
            {serviceLoading && <p className="border-t border-border pt-3 text-sm text-muted-foreground">Checking voice deployment setup…</p>}
            {serviceError && <p className="border-t border-border pt-3 text-sm text-warning">Voice deployment setup could not be verified.</p>}
            {deploymentWarnings.length > 0 && <div className="border-t border-border pt-3"><p className="text-sm font-medium">Live deployment readiness</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{deploymentWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><p className="mt-2 text-xs text-muted-foreground">These do not block publishing a version, but voice calls remain unavailable until setup is complete.</p></div>}
            <Input maxLength={200} placeholder="Release note (optional), for example Added refund policy" aria-label="Release note" value={releaseNote} onChange={(e) => setReleaseNote(e.target.value)} />
          </GlassCard>
          <GlassCard>
            <h2 className="font-semibold">Published versions</h2>
            <p className="mt-1 text-sm text-muted-foreground">Published versions never change. Restore one to load it into the draft.</p>
            {data.versions.length === 0 ? <p className="mt-6 text-sm text-muted-foreground">No published versions yet. Save and publish to create one.</p> : (
              <div className="mt-5 divide-y divide-border">
                {data.versions.map((v) => {
                  const where = data.deps.filter((d) => d.agent_version === v.version);
                  return (
                    <div key={v.version} className="flex flex-wrap items-center gap-3 py-3">
                      <input type="checkbox" aria-label={`Compare version ${v.version}`} checked={compare.includes(v.version)} onChange={(e) => setCompare(e.target.checked ? [compare[1], v.version] : [compare[0] === v.version ? null : compare[0], compare[1] === v.version ? null : compare[1]])} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm">Version {v.version}</span>{where.map((d, k) => <SystemLabel key={k} tone="deployed">{(d.environments as { name: string } | null)?.name ?? "Environment"}{d.canary_percent < 100 ? ` ${d.canary_percent}%` : ""}</SystemLabel>)}</div>
                        <p className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}{v.release_note ? ` · ${v.release_note}` : ""}</p>
                      </div>
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => {
                        const c = v.config as Record<string, unknown> & { knowledge_base_ids?: string[]; tool_ids?: string[] };
                        const { knowledge_base_ids, tool_ids, ...rest } = c;
                        setCfg(normalizeConfig(rest)); setKbIds(knowledge_base_ids ?? []); setToolIds(tool_ids ?? []);
                        toast.success(`Version ${v.version} loaded into the draft. Save to keep it.`);
                      }}>Restore</Button>
                    </div>
                  );
                })}
              </div>
            )}
            {compare[0] != null && compare[1] != null && (() => {
              const a = data.versions.find((v) => v.version === compare[0]); const b = data.versions.find((v) => v.version === compare[1]);
              const changed = a && b ? diffConfigs(a.config as Record<string, unknown>, b.config as Record<string, unknown>) : [];
              return <div className="mt-4 rounded-xl bg-muted p-3 text-sm"><p className="font-medium">Version {Math.min(compare[0], compare[1])} vs {Math.max(compare[0], compare[1])}</p><div className="mt-2 space-y-2">{changed.length ? changed.map(item => <div key={item.field} className="border-t border-border pt-2"><p className="font-medium">{item.field}</p><div className="grid gap-2 sm:grid-cols-2"><p className="whitespace-pre-wrap break-words text-muted-foreground">Before: {item.before}</p><p className="whitespace-pre-wrap break-words">After: {item.after}</p></div></div>) : <p className="text-muted-foreground">No differences.</p>}</div></div>;
            })()}
            {data.versions.length > 1 && (compare[0] == null || compare[1] == null) && <p className="mt-3 text-xs text-muted-foreground">Tick two versions to compare them.</p>}
          </GlassCard>
        </TabsContent>
      </Tabs>
    </>
  );
}

