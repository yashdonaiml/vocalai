import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader, Readout, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";

const usageQuery = (ws: string, days: number) =>
  queryOptions({
    queryKey: ["usage", ws, days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 864e5).toISOString();
      const [events, convs, agents, envs] = await Promise.all([
        supabase.from("usage_events").select("kind, provider, quantity, unit, model, created_at, conversation_id").eq("workspace_id", ws).gte("created_at", since).order("created_at", { ascending: false }).range(0, 999),
        supabase.from("conversations").select("id, agent_id, environment_id, channel").eq("workspace_id", ws).gte("started_at", since).neq("channel", "web_test").range(0, 999),
        supabase.from("agents").select("id, name").eq("workspace_id", ws),
        supabase.from("environments").select("id, name").eq("workspace_id", ws),
      ]);
      if (events.error || convs.error || agents.error || envs.error) throw events.error ?? convs.error ?? agents.error ?? envs.error;
      const allEvents = [...(events.data ?? [])];
      if (allEvents.length === 1000) {
        let offset = 1000;
        while (true) {
          const { data: page, error } = await supabase.from("usage_events").select("kind, provider, quantity, unit, model, created_at, conversation_id").eq("workspace_id", ws).gte("created_at", since).order("created_at", { ascending: false }).range(offset, offset + 999);
          if (error) throw error;
          allEvents.push(...(page ?? []));
          if ((page?.length ?? 0) < 1000) break;
          offset += 1000;
        }
      }
      const allConversations = [...(convs.data ?? [])];
      if (allConversations.length === 1000) {
        let offset = 1000;
        while (true) {
          const { data: page, error } = await supabase.from("conversations").select("id, agent_id, environment_id, channel").eq("workspace_id", ws).gte("started_at", since).neq("channel", "web_test").range(offset, offset + 999);
          if (error) throw error;
          allConversations.push(...(page ?? []));
          if ((page?.length ?? 0) < 1000) break;
          offset += 1000;
        }
      }
      return { events: allEvents, convs: allConversations, agents: agents.data ?? [], envs: envs.data ?? [] };
    },
  });

export const Route = createFileRoute("/_authenticated/usage")({
  head: () => ({
    meta: [
      { title: "Usage: VocollAI" },
      { name: "description", content: "Voice minutes, calls, and indexing usage broken down by agent, environment, and provider." },
      { property: "og:title", content: "Usage: VocollAI" },
      { property: "og:description", content: "Voice minutes, calls, and indexing usage broken down by agent, environment, and provider." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Usage,
});

type Dim = "agent" | "environment" | "provider" | "kind";

function Usage() {
  const ws = useWorkspace();
  const [days, setDays] = useState(30);
  const [dim, setDim] = useState<Dim>("agent");
  const { data } = useSuspenseQuery(usageQuery(ws.id, days));
  const convOf = new Map(data.convs.map((c) => [c.id, c]));
  const sum = (k: string) => data.events.filter((e) => e.kind === k).reduce((a, e) => a + Number(e.quantity), 0);
  const keyOf = (e: (typeof data.events)[number]) => {
    const c = e.conversation_id ? convOf.get(e.conversation_id) : undefined;
    if (dim === "agent") return data.agents.find((a) => a.id === c?.agent_id)?.name ?? "Not linked to a call";
    if (dim === "environment") return data.envs.find((x) => x.id === c?.environment_id)?.name ?? "Test or not linked";
    if (dim === "provider") return e.provider;
    return e.kind;
  };
  const groups = new Map<string, { qty: number; unit: string }>();
  for (const e of data.events) {
    const k = `${keyOf(e)}|${e.kind}`;
    const g = groups.get(k) ?? { qty: 0, unit: e.unit };
    g.qty += Number(e.quantity); groups.set(k, g);
  }
  const rows = [...groups.entries()].sort((a, b) => b[1].qty - a[1].qty);

  return (
    <>
      <PageHeader eyebrow="Manage" title="Usage" subtitle="What your agents used, by agent, provider and date. Estimates, not provider bills." actions={
        <select aria-label="Date range" className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
      } />
      <div className="grid gap-4 sm:grid-cols-4">
        <GlassCard><Readout label="Phone and runtime calls" value={data.convs.length} tone="deployed" /></GlassCard>
        <GlassCard><Readout label="Voice min" value={sum("voice_minutes").toFixed(1)} tone="live" /></GlassCard>
        <GlassCard><Readout label="Indexing events" value={sum("embedding_chunks")} tone="ok" /></GlassCard>
        <GlassCard><Readout label="Usage events" value={data.events.length} /></GlassCard>
      </div>
      <GlassCard className="mt-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">Breakdown</h2>
          {(["agent", "environment", "provider", "kind"] as const).map((d) => <Button key={d} size="sm" variant={dim === d ? "default" : "outline"} className="rounded-full capitalize" onClick={() => setDim(d)}>{d === "kind" ? "Type" : d}</Button>)}
        </div>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No usage in this period.</p> : (
          <div className="divide-y divide-border text-sm">
            {rows.map(([k, g]) => { const [name, kind] = k.split("|"); return (
              <div key={k} className="flex items-center gap-3 py-2"><span className="flex-1">{name}</span><span className="text-xs text-muted-foreground">{kind}</span><SystemLabel tone="muted">Credential source not attributed</SystemLabel><span className="w-32 text-right font-mono">{g.qty.toFixed(2)} {g.unit}</span></div>
            ); })}
          </div>
        )}
      </GlassCard>
      <GlassCard className="mt-5">
        <h2 className="mb-3 font-semibold">All entries</h2>
        {data.events.length === 0 ? <p className="text-sm text-muted-foreground">No usage yet. It appears after your first call.</p> : (
          <div className="divide-y divide-border text-sm">
            {data.events.slice(0, 50).map((e, i) => (
              <div key={i} className="flex gap-3 py-2">
                <span className="w-44 font-mono text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                <span className="flex-1">{e.kind}</span>
                <span className="font-mono text-xs text-muted-foreground">{e.provider} {e.model}</span>
                <span className="font-mono">{Number(e.quantity).toFixed(2)} {e.unit}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </>
  );
}
