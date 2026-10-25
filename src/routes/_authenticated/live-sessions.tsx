import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Activity, AudioLines, Clock, RefreshCw } from "lucide-react";
import { GlassCard, PageHeader, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { platformStatus } from "@/lib/platform.functions";

const ACTIVE = ["active", "live", "connecting"];
const sessionsQuery = (workspaceId: string) => queryOptions({ queryKey: ["live-sessions", workspaceId], refetchInterval: 5000, queryFn: async () => {
  const since = new Date(Date.now() - 864e5).toISOString();
  const [active, recent] = await Promise.all([
    supabase.from("conversations").select("id, channel, status, started_at, ended_at, duration_seconds, agent_version, agent_id, environment_id, agents(name)").eq("workspace_id", workspaceId).in("status", ACTIVE).order("started_at", { ascending: false }).limit(500),
    supabase.from("conversations").select("id, channel, status, started_at, ended_at, duration_seconds, agent_version, agent_id, environment_id, agents(name)").eq("workspace_id", workspaceId).gte("started_at", since).order("started_at", { ascending: false }).limit(100),
  ]);
  if (active.error || recent.error) throw active.error ?? recent.error;
  return [...new Map([...(active.data ?? []), ...(recent.data ?? [])].map((row) => [row.id, row])).values()];
} });

export const Route = createFileRoute("/_authenticated/live-sessions")({
  head: () => ({ meta: [
    { title: "Live sessions: VocollAI" }, { name: "description", content: "See calls in progress as they happen." },
    { property: "og:title", content: "Live sessions: VocollAI" }, { property: "og:description", content: "See calls in progress as they happen." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: LiveSessions,
});

function elapsed(start: string) { return Math.max(0, Math.round((Date.now() - new Date(start).getTime()) / 1000)); }

function LiveSessions() {
  const workspace = useWorkspace();
  const { data, refetch, isFetching } = useSuspenseQuery(sessionsQuery(workspace.id));
  const status = useServerFn(platformStatus);
  const { data: health, isLoading: healthLoading, isError: healthError } = useQuery({ queryKey: ["platform-status"], queryFn: () => status() });
  const [channel, setChannel] = useState("all");
  const live = data.filter((s) => ACTIVE.includes(s.status) && (channel === "all" || s.channel === channel));
  const recent = data.filter((s) => !ACTIVE.includes(s.status)).slice(0, 10);
  const channels = Array.from(new Set(data.map((s) => s.channel)));
  const mediaOk = (health as { media?: boolean } | undefined)?.media;

  return <>
    <PageHeader eyebrow="Operate" title="Live sessions" subtitle="Calls in progress, refreshed every five seconds." actions={<Button variant="outline" className="rounded-full" onClick={() => refetch()} disabled={isFetching}><RefreshCw className="h-4 w-4" /> Refresh</Button>} />
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SystemLabel tone={healthError || health?.media === false ? "warn" : health?.media ? "ok" : "muted"} dot>{healthLoading ? "Checking voice service setup" : healthError ? "Voice service status unavailable" : mediaOk ? "Voice media configured" : "Voice media not configured"}</SystemLabel>
      <span className="font-mono text-xs text-muted-foreground">{live.length} active</span>
      {channels.length > 1 && <select aria-label="Channel" className="ml-auto rounded-md border border-input bg-background px-3 py-1 text-sm" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="all">All channels</option>{channels.map((c) => <option key={c}>{c}</option>)}</select>}
    </div>
    {live.length === 0 ? <GlassCard className="py-16 text-center"><Activity className="mx-auto h-7 w-7 text-muted-foreground" /><h2 className="mt-4 font-semibold">No active sessions recorded</h2><p className="mt-1 text-sm text-muted-foreground">This list reflects recent session records, not a direct media-worker health check.</p></GlassCard> : <div className="space-y-3">{live.map((s) => <Link key={s.id} to="/conversations/$id" params={{ id: s.id }} className="block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"><GlassCard className="flex flex-wrap items-center gap-4">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-success-soft text-success"><AudioLines className="h-5 w-5" /></span>
      <div className="min-w-48 flex-1"><p className="font-medium">{(s.agents as { name: string } | null)?.name ?? "Agent"}</p><p className="font-mono text-xs text-muted-foreground">Version {s.agent_version} · {s.channel}</p></div>
      <span className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground"><Clock className="h-4 w-4" />{elapsed(s.started_at)}s</span><SystemLabel tone="live" dot>{s.status}</SystemLabel>
    </GlassCard></Link>)}</div>}
    {recent.length > 0 && <GlassCard className="mt-5"><h2 className="mb-2 font-semibold">Ended in the last 24 hours</h2><div className="divide-y divide-border">{recent.map((s) => <Link key={s.id} to="/conversations/$id" params={{ id: s.id }} className="flex items-center gap-3 py-2 text-sm hover:text-primary"><span className="flex-1">{(s.agents as { name: string } | null)?.name ?? "Agent"}</span><span className="font-mono text-xs text-muted-foreground">{s.duration_seconds ?? 0}s</span><SystemLabel tone={s.status === "failed" ? "warn" : "muted"}>{s.status}</SystemLabel></Link>)}</div></GlassCard>}
  </>;
}
