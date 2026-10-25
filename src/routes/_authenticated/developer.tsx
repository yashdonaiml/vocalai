import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "@/lib/notify";
import { Braces, Copy, KeyRound, Plus, Trash2, Webhook } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/lib/workspace";
import { createApiKey, revokeApiKey } from "@/lib/developer.functions";
import { createWebhook, deleteWebhook, setWebhookEnabled, testWebhook, WEBHOOK_EVENTS } from "@/lib/console.functions";
import { Switch } from "@/components/ui/switch";

const devQuery = (ws: string) =>
  queryOptions({
    queryKey: ["developer", ws],
    queryFn: async () => {
      const [keys, logs, hooks, deliveries] = await Promise.all([
        supabase.from("api_keys").select("id, name, prefix, created_at, last_used_at, revoked_at").eq("workspace_id", ws).order("created_at", { ascending: false }),
        supabase.from("api_request_logs").select("id, method, path, status, duration_ms, created_at, api_key_id").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(50),
        supabase.from("webhook_endpoints").select("id, url, events, secret_hint, enabled, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }),
        supabase.from("webhook_deliveries").select("id, endpoint_id, event, status, error, duration_ms, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(30),
      ]);
      return { keys: keys.data ?? [], logs: logs.data ?? [], hooks: hooks.data ?? [], deliveries: deliveries.data ?? [] };
    },
  });

export const Route = createFileRoute("/_authenticated/developer")({
  head: () => ({ meta: [
    { title: "Developer: VocollAI" }, { name: "description", content: "API keys, quickstart, and request logs for building on VocollAI." },
    { property: "og:title", content: "Developer: VocollAI" }, { property: "og:description", content: "API keys, quickstart, and request logs for building on VocollAI." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Developer,
});

const ENDPOINTS = [
  ["GET", "/agents", "List agents in the workspace"],
  ["GET", "/agents/{id}", "Get one agent"],
  ["GET", "/agents/{id}/versions", "Published versions"],
  ["GET", "/deployments", "Deployments, newest first"],
  ["GET", "/conversations", "Conversations with summaries"],
  ["GET", "/conversations/{id}/turns", "Full transcript turns"],
  ["GET", "/usage", "Metered usage events"],
] as const;

function Developer() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(devQuery(ws.id));
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = typeof window === "undefined" ? "" : `${window.location.origin}/api/public/v1`;
  const refresh = () => qc.invalidateQueries({ queryKey: ["developer", ws.id] });
  const keyName = (id: string | null) => data.keys.find((k) => k.id === id)?.name ?? "Revoked key";

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { const r = await create({ data: { workspaceId: ws.id, name } }); setFresh(r.key); setName(""); refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not create key"); }
    setBusy(false);
  }
  async function doRevoke(id: string, n: string) {
    if (!confirm(`Revoke "${n}"? Apps using it will stop working immediately.`)) return;
    try { await revoke({ data: { id } }); toast.success("Key revoked"); refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not revoke key"); }
  }
  const copy = (s: string) => { void navigator.clipboard.writeText(s); toast.success("Copied"); };
  const curl = `curl ${base}/agents \\\n  -H "Authorization: Bearer ${fresh ?? "avk_your_key"}"`;

  return (
    <>
      <PageHeader eyebrow="Manage" title="Developer" subtitle="Connect aviroh to your own systems with API keys and webhooks." />
      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard className="space-y-4">
          <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-primary" /> API keys</h2>
          <form onSubmit={issue} className="flex gap-2">
            <Input required maxLength={60} placeholder="Key name, for example CRM sync" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" className="rounded-full" disabled={busy}><Plus className="h-4 w-4" /> Create</Button>
          </form>
          {fresh && (
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
              <p className="font-medium">Copy this key now. It will not be shown again.</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate font-mono text-xs">{fresh}</code>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => copy(fresh)}><Copy className="h-3.5 w-3.5" /> Copy</Button>
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setFresh(null)}>Done</Button>
              </div>
            </div>
          )}
          <div className="divide-y divide-border">
            {data.keys.length === 0 && <p className="py-2 text-sm text-muted-foreground">No API keys yet. Create one to connect your systems.</p>}
            {data.keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="flex-1">
                  <p className="font-medium">{k.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{k.prefix} · {k.last_used_at ? `used ${new Date(k.last_used_at).toLocaleString()}` : "never used"}</p>
                </div>
                {k.revoked_at ? <SystemLabel>Revoked</SystemLabel> : (
                  <>
                    <SystemLabel tone="ok">Active</SystemLabel>
                    <button onClick={() => doRevoke(k.id, k.name)} aria-label={`Revoke ${k.name}`} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="space-y-4">
          <h2 className="flex items-center gap-2 font-semibold"><Braces className="h-4 w-4 text-primary" /> Quickstart</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Create a key on the left. Only owners and admins can do this.</li>
            <li>Send it as a bearer token. Each key only sees this workspace.</li>
            <li>Watch calls appear in the request log below.</li>
          </ol>
          <div className="relative">
            <pre className="overflow-x-auto rounded-xl bg-muted p-3 font-mono text-xs">{curl}</pre>
            <Button size="icon" variant="ghost" className="absolute right-1 top-1" aria-label="Copy command" onClick={() => copy(curl)}><Copy className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="divide-y divide-border text-sm">
            {ENDPOINTS.map(([m, p, d]) => (
              <div key={p} className="flex gap-3 py-1.5"><span className="w-10 font-mono text-xs text-primary">{m}</span><span className="w-56 font-mono text-xs">{p}</span><span className="flex-1 text-xs text-muted-foreground">{d}</span></div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Lists accept <code className="font-mono">?limit=</code> up to 200. Need agents to call your systems instead? <Link to="/tools" className="inline-flex items-center gap-1 text-primary underline"><Webhook className="h-3 w-3" /> Webhook tools</Link></p>
        </GlassCard>
      </div>

      <Webhooks wsId={ws.id} hooks={data.hooks} deliveries={data.deliveries} onChange={refresh} />

      <GlassCard className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Request log</h2>
          <Button size="sm" variant="outline" className="rounded-full" onClick={refresh}>Refresh</Button>
        </div>
        {data.logs.length === 0 ? <p className="text-sm text-muted-foreground">No API requests yet.</p> : (
          <div className="divide-y divide-border">
            {data.logs.map((l) => (
              <div key={l.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-12 font-mono text-xs">{l.method}</span>
                <span className="flex-1 truncate font-mono text-xs">{l.path}</span>
                <span className="w-32 truncate text-xs text-muted-foreground">{keyName(l.api_key_id)}</span>
                <span className="w-16 text-right font-mono text-xs text-muted-foreground">{l.duration_ms}ms</span>
                <SystemLabel tone={l.status < 300 ? "ok" : "warn"}>{l.status}</SystemLabel>
                <span className="w-40 text-right text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </>
  );
}

const EVENT_HELP: Record<(typeof WEBHOOK_EVENTS)[number], string> = {
  "tool.succeeded": "A live approved tool action succeeded. The event excludes caller data and tool arguments.",
  "tool.approved": "A tool revision was approved",
  "tool.changed": "A tool definition changed",
  "tool.call_failed": "A tool call failed",
  "workflow.published": "A workflow version was published",
  "connection.unhealthy": "A tool connection became unhealthy",
};

type Hook = { id: string; url: string; events: string[]; secret_hint: string; enabled: boolean; created_at: string };
type Delivery = { id: string; endpoint_id: string; event: string; status: number | null; error: string | null; duration_ms: number | null; created_at: string };

function Webhooks({ wsId, hooks, deliveries, onChange }: { wsId: string; hooks: Hook[]; deliveries: Delivery[]; onChange: () => void }) {
  const create = useServerFn(createWebhook);
  const toggle = useServerFn(setWebhookEnabled);
  const remove = useServerFn(deleteWebhook);
  const ping = useServerFn(testWebhook);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["conversation.ended"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const err = (e: unknown, f: string) => toast.error(e instanceof Error ? e.message : f);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!url.startsWith("https://")) { toast.error("Use an https:// address"); return; }
    if (!events.length) { toast.error("Pick at least one event"); return; }
    setBusy("new");
    try { const r = await create({ data: { workspaceId: wsId, url, events: events as never } }); setSecret(r.secret); setUrl(""); onChange(); }
    catch (x) { err(x, "Could not add endpoint"); }
    setBusy(null);
  }
  async function act(id: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(id);
    try { await fn(); if (ok) toast.success(ok); onChange(); } catch (x) { err(x, "Action failed"); }
    setBusy(null);
  }
  async function test(id: string) {
    setBusy(id);
    try {
      const r = await ping({ data: { id } });
      if (r.status && r.status < 300) toast.success(`Delivered: ${r.status} in ${r.durationMs}ms`);
      else toast.error(r.error ? `Delivery failed: ${r.error}` : `Receiver answered ${r.status}`);
      onChange();
    } catch (x) { err(x, "Test failed"); }
    setBusy(null);
  }
  const copy = (v: string) => { void navigator.clipboard.writeText(v); toast.success("Copied"); };
  const urlOf = (id: string) => hooks.find((h) => h.id === id)?.url ?? "Deleted endpoint";

  return (
    <GlassCard className="mt-5 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><Webhook className="h-4 w-4 text-primary" /> Webhook endpoints</h2>
        <p className="mt-1 text-xs text-muted-foreground">We POST signed JSON to your URL. Verify <code className="font-mono">x-aviroh-signature</code>: HMAC SHA-256 of <code className="font-mono">timestamp.body</code> with your signing secret. Owners and admins manage endpoints.</p>
      </div>
      <form onSubmit={add} className="space-y-3">
        <div className="flex gap-2">
          <Input required type="url" placeholder="https://example.com/aviroh-events" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Endpoint URL" />
          <Button type="submit" className="rounded-full" disabled={busy === "new"}><Plus className="h-4 w-4" /> Add endpoint</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {WEBHOOK_EVENTS.map((ev) => (
            <label key={ev} className="flex items-start gap-2 rounded-xl border border-border p-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} />
              <span><span className="font-mono text-xs">{ev}</span><span className="block text-xs text-muted-foreground">{EVENT_HELP[ev]}</span></span>
            </label>
          ))}
        </div>
      </form>
      {secret && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
          <p className="font-medium">Signing secret. Copy it now; it will not be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate font-mono text-xs">{secret}</code>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => copy(secret)}><Copy className="h-3.5 w-3.5" /> Copy</Button>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setSecret(null)}>Done</Button>
          </div>
        </div>
      )}
      <div className="divide-y divide-border">
        {hooks.length === 0 && <p className="py-2 text-sm text-muted-foreground">No webhooks yet. Add an address to receive events.</p>}
        {hooks.map((h) => (
          <div key={h.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs">{h.url}</p>
              <p className="text-xs text-muted-foreground">{h.events.join(", ")} · secret {h.secret_hint}</p>
            </div>
            <Switch checked={h.enabled} disabled={busy === h.id} onCheckedChange={(v) => act(h.id, () => toggle({ data: { id: h.id, enabled: v } }), v ? "Endpoint enabled" : "Endpoint paused")} aria-label={`Enable ${h.url}`} />
            <Button size="sm" variant="outline" className="rounded-full" disabled={busy === h.id} onClick={() => test(h.id)}>Send test</Button>
            <button aria-label={`Delete ${h.url}`} className="text-muted-foreground hover:text-destructive" onClick={() => { if (confirm(`Delete endpoint ${h.url}?`)) void act(h.id, () => remove({ data: { id: h.id } }), "Endpoint deleted"); }}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">Recent deliveries</h3>
        {deliveries.length === 0 ? <p className="text-sm text-muted-foreground">No deliveries yet. Use Send test to check your address.</p> : (
          <div className="divide-y divide-border">
            {deliveries.map((d) => (
              <div key={d.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-40 font-mono text-xs">{d.event}</span>
                <span className="flex-1 truncate font-mono text-xs text-muted-foreground" title={d.error ?? ""}>{urlOf(d.endpoint_id)}</span>
                <span className="w-16 text-right font-mono text-xs text-muted-foreground">{d.duration_ms ?? 0}ms</span>
                <SystemLabel tone={d.status && d.status < 300 ? "ok" : "warn"}>{d.status ?? "error"}</SystemLabel>
                <span className="w-40 text-right text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
