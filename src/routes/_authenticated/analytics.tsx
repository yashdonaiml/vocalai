import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { GlassCard, PageHeader, Readout } from "@/components/apple";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";

const analyticsQuery = (ws: string, days: number) => queryOptions({
  queryKey: ["analytics", ws, days],
  queryFn: async () => {
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const [convs, runs, agents] = await Promise.all([
      supabase.from("conversations").select("id, status, started_at, duration_seconds, agent_id, channel").eq("workspace_id", ws).gte("started_at", since).order("started_at").range(0, 999),
      supabase.from("eval_runs").select("score, passed, total, status, created_at").eq("workspace_id", ws).gte("created_at", since).order("created_at").range(0, 999),
      supabase.from("agents").select("id, name").eq("workspace_id", ws),
    ]);
    if (convs.error || runs.error || agents.error) throw convs.error ?? runs.error ?? agents.error;
    const allConversations = [...(convs.data ?? [])];
    if (allConversations.length === 1000) {
      let offset = 1000;
      while (true) {
        const { data: page, error } = await supabase.from("conversations").select("id, status, started_at, duration_seconds, agent_id, channel").eq("workspace_id", ws).gte("started_at", since).order("started_at").range(offset, offset + 999);
        if (error) throw error;
        allConversations.push(...(page ?? []));
        if ((page?.length ?? 0) < 1000) break;
        offset += 1000;
      }
    }
    const allRuns = [...(runs.data ?? [])];
    if (allRuns.length === 1000) {
      let offset = 1000;
      while (true) {
        const { data: page, error } = await supabase.from("eval_runs").select("score, passed, total, status, created_at").eq("workspace_id", ws).gte("created_at", since).order("created_at").range(offset, offset + 999);
        if (error) throw error;
        allRuns.push(...(page ?? []));
        if ((page?.length ?? 0) < 1000) break;
        offset += 1000;
      }
    }
    return { convs: allConversations, runs: allRuns, agents: agents.data ?? [] };
  },
});

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [
    { title: "Analytics: VocollAI" }, { name: "description", content: "Operational, AI quality, and business outcome analytics for your voice agents." },
    { property: "og:title", content: "Analytics: VocollAI" }, { property: "og:description", content: "Operational, AI quality, and business outcome analytics for your voice agents." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Analytics,
});

const cfg = { calls: { label: "Calls", color: "var(--primary)" }, failed: { label: "Failed calls (subset)", color: "var(--warning)" }, score: { label: "Score", color: "var(--primary)" } };

function Empty({ text }: { text: string }) { return <p className="grid h-48 place-items-center text-sm text-muted-foreground">{text}</p>; }

function Analytics() {
  const ws = useWorkspace();
  const [days, setDays] = useState(30);
  const { data } = useSuspenseQuery(analyticsQuery(ws.id, days));
  const byDay = new Map<string, { day: string; calls: number; failed: number }>();
  for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); byDay.set(d, { day: d, calls: 0, failed: 0 }); }
  for (const c of data.convs) { const row = byDay.get(c.started_at.slice(0, 10)); if (row) { row.calls++; if (c.status === "failed") row.failed++; } }
  const series = [...byDay.values()];
  const total = data.convs.length;
  const resolved = data.convs.filter((c) => ["completed", "ended", "failed"].includes(c.status));
  const failed = resolved.filter((c) => c.status === "failed").length;
  const ended = data.convs.filter((c) => c.duration_seconds != null);
  const avgDur = ended.length ? Math.round(ended.reduce((a, c) => a + (c.duration_seconds ?? 0), 0) / ended.length) : 0;
  const evalSeries = data.runs.filter((r) => r.score != null).map((r) => ({ day: r.created_at.slice(0, 10), score: r.score }));
  const avgScore = evalSeries.length ? Math.round(evalSeries.reduce((a, r) => a + (r.score ?? 0), 0) / evalSeries.length) : null;
  const perAgent = data.agents.map((a) => ({ name: a.name, calls: data.convs.filter((c) => c.agent_id === a.id).length })).filter((a) => a.calls > 0).sort((a, b) => b.calls - a.calls).slice(0, 8);
  const completed = data.convs.filter((c) => c.status === "completed" || c.status === "ended").length;

  return <>
    <PageHeader eyebrow="Operate" title="Analytics" subtitle="Call volume, quality scores and outcomes for your agents." actions={
      <select aria-label="Date range" className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
    } />
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Operational</h2>
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <GlassCard><Readout label="Calls" value={total} tone="deployed" /></GlassCard>
      <GlassCard><Readout label="Resolved-call failure rate" value={resolved.length ? `${Math.round((failed / resolved.length) * 100)}%` : "No resolved calls"} tone={failed ? "warn" : "ok"} /><p className="mt-2 text-xs text-muted-foreground">{failed} failed of {resolved.length} resolved calls; active calls are excluded.</p></GlassCard>
      <GlassCard><Readout label="Average duration" value={`${avgDur}s`} /></GlassCard>
    </div>
    <GlassCard className="mb-8">
      {total === 0 ? <Empty text="No calls in this period yet." /> : <ChartContainer config={cfg} className="h-56 w-full"><BarChart data={series}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} /><YAxis allowDecimals={false} width={28} fontSize={11} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="calls" fill="var(--color-calls)" radius={4} /><Bar dataKey="failed" fill="var(--color-failed)" radius={4} /></BarChart></ChartContainer>}
    </GlassCard>

    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">AI quality</h2>
    <div className="mb-8 grid gap-4 lg:grid-cols-[240px_1fr]">
      <GlassCard><Readout label="Average eval score" value={avgScore ?? "No runs"} tone="ok" /><p className="mt-3 text-xs text-muted-foreground">{data.runs.length} eval run{data.runs.length === 1 ? "" : "s"} in this period.</p></GlassCard>
      <GlassCard>{evalSeries.length === 0 ? <Empty text="Run an eval suite to see quality trends." /> : <ChartContainer config={cfg} className="h-48 w-full"><LineChart data={evalSeries}><CartesianGrid vertical={false} /><XAxis dataKey="day" fontSize={11} /><YAxis domain={[0, 100]} width={28} fontSize={11} /><ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="score" stroke="var(--color-score)" strokeWidth={2} dot /></LineChart></ChartContainer>}</GlassCard>
    </div>

    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Business outcomes</h2>
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <GlassCard><Readout label="Completed calls" value={completed} tone="ok" /><p className="mt-3 text-xs text-muted-foreground">Custom outcomes, such as booked or qualified, appear once workflows tag conversations.</p></GlassCard>
      <GlassCard>{perAgent.length === 0 ? <Empty text="Calls per agent appear once calls are recorded." /> : <ChartContainer config={cfg} className="h-48 w-full"><BarChart data={perAgent} layout="vertical"><XAxis type="number" allowDecimals={false} fontSize={11} /><YAxis type="category" dataKey="name" width={120} fontSize={11} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="calls" fill="var(--color-calls)" radius={4} /></BarChart></ChartContainer>}</GlassCard>
    </div>
  </>;
}
