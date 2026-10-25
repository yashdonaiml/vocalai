import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "@/lib/notify";
import { KeyRound, PlugZap, Trash2, Server } from "lucide-react";
import { normalizeConfig } from "@/lib/agent-config";
import { testProviderKey } from "@/lib/console.functions";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/lib/workspace";
import { PROVIDERS as CATALOG } from "@/lib/providers/catalog";
import { deleteProviderKey, platformStatus, saveProviderKey } from "@/lib/platform.functions";
import { SystemLabel } from "@/components/apple";

const PROVIDERS = ["openai", "anthropic", "google", "elevenlabs", "deepgram", "cartesia"] as const;

const keysQuery = (org: string) =>
  queryOptions({
    queryKey: ["keys", org],
    queryFn: async () => {
      const { data, error } = await supabase.from("provider_accounts").select("id, provider, label, key_hint, created_at").eq("org_id", org).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

export const Route = createFileRoute("/_authenticated/models")({
  head: () => ({
    meta: [
      { title: "Models & Keys: VocollAI" },
      { name: "description", content: "Choose managed models or bring your own provider keys." },
      { property: "og:title", content: "Models & Keys: VocollAI" },
      { property: "og:description", content: "Choose managed models or bring your own provider keys." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Models,
});

function Models() {
  const ws = useWorkspace();
  const { data: keys } = useSuspenseQuery(keysQuery(ws.org_id));
  const qc = useQueryClient();
  const save = useServerFn(saveProviderKey);
  const del = useServerFn(deleteProviderKey);
  const status = useServerFn(platformStatus);
  const { data: plat } = useQuery({ queryKey: ["platform-status"], queryFn: () => status() });
  const test = useServerFn(testProviderKey);
  const { data: agents } = useQuery({
    queryKey: ["agents-providers", ws.id],
    queryFn: async () => (await supabase.from("agents").select("id, name, config, status").eq("workspace_id", ws.id).neq("status", "archived")).data ?? [],
  });
  const usedBy = (pid: string) => (agents ?? []).filter((a) => {
    const r = normalizeConfig(a.config).runtime;
    const refs = r.mode === "native" ? [r.realtime.provider] : [r.stt.provider, r.llm.provider, r.tts.provider];
    return refs.includes(pid as never);
  }).map((a) => a.name);
  const [testing, setTesting] = useState<string | null>(null);
  async function runTest(id: string) {
    setTesting(id);
    try {
      const r = await test({ data: { id } });
      if (r.ok) toast.success(`Key works (${r.durationMs}ms)`);
      else toast.error(r.error ? `Could not reach provider: ${r.error}` : `Provider rejected the key (status ${r.status})`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Test failed"); }
    setTesting(null);
  }
  async function remove(id: string, label: string) {
    if (!confirm(`Remove key "${label}"? Agents fall back to the platform key, or stop working if there is none.`)) return;
    try { await del({ data: { id } }); toast.success("Key removed"); qc.invalidateQueries({ queryKey: ["keys"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("openai");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save({ data: { orgId: ws.org_id, provider, label, apiKey } });
      setApiKey(""); setLabel("");
      toast.success("Key stored securely");
      qc.invalidateQueries({ queryKey: ["keys"] });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save"); }
  }
  return (
    <>
      <PageHeader eyebrow="Configure" title="Models & Keys" subtitle="Use your own AI provider keys or the ones included with aviroh." />
      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard >
          <h2 className="flex items-center gap-2 font-semibold text-foreground"><Server className="h-4 w-4" /> Platform</h2>
          <p className="mt-1 text-xs text-muted-foreground">Calls use a workspace key first, then the platform default. Each provider plugs in behind the same interface.</p>
          <ul className="mt-4 space-y-2 text-sm">
            {CATALOG.map((p) => {
              const own = keys.some((k) => k.provider === p.id);
              const platformOn = plat?.keys.find((k) => k.provider === p.id)?.configured;
              return (
                <li key={p.id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
                  <span className="min-w-0">{p.label} <span className="ml-1 font-mono text-xs text-muted-foreground">{p.caps.join(" · ")}</span>
                    <span className="block truncate text-xs text-muted-foreground">{usedBy(p.id).length ? `Used by ${usedBy(p.id).join(", ")}` : "No agents use it"}</span></span>
                  {own ? <SystemLabel tone="ok" dot>BYOK</SystemLabel> : platformOn ? <SystemLabel tone="deployed">Platform</SystemLabel> : <SystemLabel tone="muted">No key</SystemLabel>}
                </li>
              );
            })}
            <li className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
              <span>Voice media layer (LiveKit)</span>
              {plat?.media ? <SystemLabel tone="ok">Configured</SystemLabel> : <SystemLabel tone="warn">Not configured</SystemLabel>}
            </li>
            <li className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
              <span>Voice service</span>
              {plat?.runtimeSecret ? <SystemLabel tone="ok">Secret configured</SystemLabel> : <SystemLabel tone="warn">Not configured</SystemLabel>}
            </li>
          </ul>
        </GlassCard>
        <GlassCard >
          <h2 className="flex items-center gap-2 font-semibold text-primary"><KeyRound className="h-4 w-4" /> Your keys</h2>
          <p className="mt-1 text-xs text-muted-foreground">Keys are stored encrypted and only the last 4 characters are shown. An agent uses keys for the providers selected in its configuration; badges show configuration, not a successful connection test.</p>
          <form onSubmit={add} className="mt-4 grid gap-2 sm:grid-cols-2">
            <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
              {PROVIDERS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <Input required maxLength={60} placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Input required type="password" className="sm:col-span-2" placeholder="API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <Button type="submit" className="rounded-full sm:col-span-2">Add key</Button>
          </form>
          <div className="mt-4 divide-y divide-border">
            {keys.length === 0 && <p className="py-2 text-sm text-muted-foreground">No keys added. Calls use the keys included with aviroh.</p>}
            {keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-24 text-primary">{k.provider}</span>
                <span className="flex-1">{k.label}</span>
                <span className="font-mono text-muted-foreground">{k.key_hint}</span>
                <Button size="sm" variant="outline" className="rounded-full" disabled={testing === k.id} onClick={() => runTest(k.id)}><PlugZap className="h-3.5 w-3.5" /> {testing === k.id ? "Testing" : "Test"}</Button>
                <button aria-label={`Remove ${k.label}`} className="text-muted-foreground hover:text-destructive" onClick={() => remove(k.id, k.label)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </>
  );
}
