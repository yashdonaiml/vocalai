import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  History,
  AudioLines,
  Bot,
  BookOpen,
  CheckCircle2,
  Clock,
  FlaskConical,
  Rocket,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader, Pill, SectionTitle, StatCard } from "@/components/apple";
import { useWorkspace } from "@/lib/workspace";

const overviewQuery = (ws: string) =>
  queryOptions({
    queryKey: ["overview", ws],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const [
        agents,
        liveAgents,
        kbs,
        deps,
        convs,
        usage,
        runs,
        failedSources,
        activity,
        suites,
        wfFailed,
        toolFailures,
      ] = await Promise.all([
        supabase
          .from("agents")
          .select("id, name, live_version", { count: "exact" })
          .eq("workspace_id", ws)
          .order("updated_at", { ascending: false })
          .limit(5),
        supabase
          .from("agents")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", ws)
          .not("live_version", "is", null),
        supabase
          .from("knowledge_bases")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", ws),
        supabase
          .from("deployments")
          .select("id, agent_version, status, created_at, agents(name)")
          .eq("workspace_id", ws)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("conversations")
          .select("id, channel, status, started_at, duration_seconds, agents(name)")
          .eq("workspace_id", ws)
          .gte("started_at", since)
          .order("started_at", { ascending: false })
          .limit(50),
        supabase
          .from("usage_events")
          .select("kind, quantity")
          .eq("workspace_id", ws)
          .gte("created_at", since)
          .limit(1000),
        supabase
          .from("eval_runs")
          .select("score, status, suite_id, agent_version")
          .eq("workspace_id", ws)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("knowledge_sources")
          .select("id, name", { count: "exact" })
          .eq("workspace_id", ws)
          .eq("status", "failed")
          .limit(3),
        supabase
          .from("audit_events")
          .select("id, action, target, created_at")
          .eq("workspace_id", ws)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("eval_suites")
          .select("id, name, pass_threshold, gates_promotion")
          .eq("workspace_id", ws)
          .eq("gates_promotion", true),
        supabase
          .from("workflow_runs")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", ws)
          .eq("status", "failed")
          .gte("created_at", since),
        supabase
          .from("tool_invocations")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", ws)
          .in("status", ["failed", "outcome_unknown"])
          .gte("started_at", since),
      ]);
      const results = [
        agents,
        liveAgents,
        kbs,
        deps,
        convs,
        usage,
        runs,
        failedSources,
        activity,
        suites,
        wfFailed,
        toolFailures,
      ];
      const queryError = results.find((result) => result.error)?.error;
      if (queryError) throw queryError;
      return {
        agents: agents.data ?? [],
        agentCount: agents.count ?? 0,
        productionAgentCount: liveAgents.count ?? 0,
        kbCount: kbs.count ?? 0,
        deployments: deps.data ?? [],
        conversations: convs.data ?? [],
        minutes: (usage.data ?? [])
          .filter((u) => u.kind === "voice_minutes")
          .reduce((a, u) => a + Number(u.quantity), 0),
        runs: runs.data ?? [],
        failedSources: failedSources.data ?? [],
        failedSourceCount: failedSources.count ?? 0,
        activity: activity.data ?? [],
        gates: suites.data ?? [],
        failedWorkflowRuns: wfFailed.count ?? 0,
        failedToolInvocations: toolFailures.count ?? 0,
      };
    },
  });

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({
    meta: [
      { title: "Overview: VocollAI" },
      {
        name: "description",
        content: "Live health, calls, deployments and quality across your voice agents.",
      },
      { property: "og:title", content: "Overview: VocollAI" },
      {
        property: "og:description",
        content: "Live health, calls, deployments and quality across your voice agents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

const fmtDate = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function Overview() {
  const ws = useWorkspace();
  const { data } = useSuspenseQuery(overviewQuery(ws.id));
  const live = data.conversations.filter(
    (c) => c.status === "active" || c.status === "live",
  ).length;
  const scored = data.runs.filter((r) => r.score != null);
  const quality = scored.length
    ? Math.round(scored.reduce((a, r) => a + (r.score ?? 0), 0) / scored.length)
    : null;
  const deployedAgents = data.productionAgentCount;
  const durations = data.conversations.map((c) => c.duration_seconds ?? 0).filter(Boolean);
  const avgDur = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 864e5);
    const key = d.toDateString();
    return {
      day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      calls: data.conversations.filter((c) => new Date(c.started_at).toDateString() === key).length,
    };
  });
  const outcomeMap = new Map<string, number>();
  data.conversations.forEach((c) =>
    outcomeMap.set(c.status ?? "unknown", (outcomeMap.get(c.status ?? "unknown") ?? 0) + 1),
  );
  const outcomes = [...outcomeMap.entries()].map(([name, value], i) => ({
    name,
    value,
    color: `var(--chart-${(i % 6) + 1})`,
  }));

  const steps = [
    { done: data.agentCount > 0, label: "Create an agent", to: "/agents" as const, icon: Bot },
    { done: data.kbCount > 0, label: "Add knowledge", to: "/knowledge" as const, icon: BookOpen },
    { done: data.runs.length > 0, label: "Run an eval", to: "/evals" as const, icon: FlaskConical },
    {
      done: data.deployments.length > 0,
      label: "Deploy a version",
      to: "/deployments" as const,
      icon: Rocket,
    },
  ];
  const setupLeft = steps.filter((s) => !s.done).length;
  const failedCalls = data.conversations.filter((c) => c.status === "failed").length;
  const gatedSuitesWithoutPass = data.gates.filter(
    (g) =>
      !data.runs.some(
        (r) =>
          r.suite_id === g.id &&
          r.status === "completed" &&
          r.score != null &&
          r.score >= g.pass_threshold,
      ),
  );
  const alerts = [
    data.failedSourceCount > 0 && {
      text: `${data.failedSourceCount} knowledge source${data.failedSourceCount > 1 ? "s" : ""} failed to index`,
      to: "/knowledge" as const,
    },
    data.failedWorkflowRuns > 0 && {
      text: `${data.failedWorkflowRuns} failed workflow run${data.failedWorkflowRuns > 1 ? "s" : ""} in the last 7 days`,
      to: "/workflows" as const,
    },
    data.failedToolInvocations > 0 && {
      text: `${data.failedToolInvocations} failed or uncertain tool action${data.failedToolInvocations > 1 ? "s" : ""} in the last 7 days`,
      to: "/tools" as const,
    },
    failedCalls > 0 && {
      text: `${failedCalls} failed call${failedCalls > 1 ? "s" : ""} in the last 7 days`,
      to: "/conversations" as const,
    },
    gatedSuitesWithoutPass.length > 0 && {
      text: `${gatedSuitesWithoutPass.length} promotion-gated eval suite${gatedSuitesWithoutPass.length > 1 ? "s have" : " has"} no recorded passing run`,
      to: "/evals" as const,
    },
  ].filter(Boolean) as { text: string; to: "/knowledge" | "/conversations" | "/evals" }[];

  return (
    <>
      <PageHeader
        eyebrow={`${ws.org_name} / ${ws.name}`}
        title="Overview"
        subtitle={
          live
            ? `${live} call${live > 1 ? "s" : ""} currently recorded as active.`
            : "Your voice agents at a glance: last 7 days."
        }
      />
      <GlassCard className="mb-5">
        <SectionTitle
          title="Try an enquiry assistant"
          subtitle="Describe the business, try a voice preview, and verify a caller-confirmed request in your inbox."
        />
        <Link
          to="/builder/$agentId"
          params={{ agentId: "new" }}
          className="text-sm text-primary underline"
        >
          Build an assistant
        </Link>
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total calls · 7d"
          value={data.conversations.length}
          icon={<AudioLines />}
        />
        <StatCard label="Eval score" value={quality ?? "No runs"} icon={<CheckCircle2 />} />
        <StatCard
          label="Production agents"
          value={`${deployedAgents} / ${data.agentCount}`}
          icon={<Bot />}
        />
        <StatCard
          label="Avg. call length"
          value={avgDur ? `${avgDur}s` : "No calls"}
          icon={<Clock />}
        />
      </div>

      {alerts.length > 0 && (
        <GlassCard className="mt-3">
          <SectionTitle title="Needs attention" />
          <ul className="space-y-1.5">
            {alerts.map((a) => (
              <li key={a.text}>
                <Link
                  to={a.to}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  {a.text}
                  <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {setupLeft > 0 && (
        <GlassCard className="mt-3">
          <SectionTitle
            title="Get set up"
            actions={
              <span className="font-mono text-xs text-muted-foreground">
                {steps.length - setupLeft}/{steps.length}
              </span>
            }
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className={`flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent ${s.done ? "text-muted-foreground line-through" : ""}`}
              >
                <s.icon
                  className={`h-4 w-4 ${s.done ? "text-success" : "text-muted-foreground"}`}
                />
                {s.label}
              </Link>
            ))}
          </div>
        </GlassCard>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <SectionTitle title="Call volume" subtitle="Calls across all agents, last 7 days" />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ left: -20, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  cursor={{ fill: "var(--accent)" }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="calls" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
        <GlassCard>
          <SectionTitle title="Call outcomes" subtitle={`${data.conversations.length} calls`} />
          {outcomes.length === 0 ? (
            <Empty>No calls yet.</Empty>
          ) : (
            <div className="flex items-center gap-4">
              <div className="h-36 w-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={outcomes}
                      dataKey="value"
                      innerRadius={44}
                      outerRadius={64}
                      stroke="none"
                    >
                      {outcomes.map((o) => (
                        <Cell key={o.name} fill={o.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-2 text-sm">
                {outcomes.map((o) => (
                  <li key={o.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 capitalize">
                      <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />
                      {o.name}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {Math.round((o.value / data.conversations.length) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </GlassCard>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <GlassCard className="p-0 lg:col-span-2">
          <div className="p-5 pb-0">
            <SectionHead title="Recent calls" to="/conversations" />
          </div>
          {data.conversations.length === 0 ? (
            <div className="px-5 pb-5">
              <Empty>No calls yet. Start a test call from an agent's page.</Empty>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Agent</th>
                  <th className="px-3 py-2 font-medium">Channel</th>
                  <th className="px-3 py-2 font-medium">Outcome</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-5 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.conversations.slice(0, 6).map((c) => (
                  <tr key={c.id}>
                    <td className="truncate px-5 py-2.5 font-medium">
                      {(c.agents as { name: string } | null)?.name ?? "Agent"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{c.channel}</td>
                    <td className="px-3 py-2.5">
                      <Pill
                        tone={
                          c.status === "completed" || c.status === "ended"
                            ? "success"
                            : c.status === "failed"
                              ? "destructive"
                              : "muted"
                        }
                      >
                        {c.status}
                      </Pill>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {c.duration_seconds ? `${Math.round(c.duration_seconds)}s` : "None"}
                    </td>
                    <td className="px-5 py-2.5 text-xs text-muted-foreground">
                      {fmtDate(c.started_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </GlassCard>

        <div className="space-y-3">
          <GlassCard>
            <SectionHead title="Agents" to="/agents" />
            <ul className="space-y-1">
              {data.agents.map((a) => (
                <li key={a.id}>
                  <Link
                    to="/builder/$agentId"
                    params={{ agentId: a.id }}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <span className="truncate">{a.name}</span>
                    {a.live_version ? (
                      <Pill tone="primary" dot>
                        v{a.live_version}
                      </Pill>
                    ) : (
                      <Pill>Draft</Pill>
                    )}
                  </Link>
                  {!a.live_version && (
                    <Link
                      to="/builder/$agentId"
                      params={{ agentId: a.id }}
                      className="ml-2 text-xs text-primary underline"
                    >
                      Continue building
                    </Link>
                  )}
                </li>
              ))}
              {data.agents.length === 0 && (
                <Empty>No agents yet. Create one on the Agents page.</Empty>
              )}
            </ul>
          </GlassCard>
          <GlassCard>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <History className="h-3.5 w-3.5" /> Recent activity
              </h2>
              <Link
                to="/team"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <ul className="space-y-1.5 text-sm">
              {data.activity.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {a.action.replace(/[._]/g, " ")}
                    {a.target ? <span className="text-muted-foreground"> {a.target}</span> : null}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {fmtDate(a.created_at)}
                  </span>
                </li>
              ))}
              {data.activity.length === 0 && (
                <Empty>No changes yet. Edits by your team appear here.</Empty>
              )}
            </ul>
          </GlassCard>
          <GlassCard>
            <SectionHead title="Deployments" to="/deployments" />
            <ul className="space-y-2">
              {data.deployments.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">
                    {(d.agents as { name: string } | null)?.name ?? "Agent"}{" "}
                    <span className="font-mono text-muted-foreground">v{d.agent_version}</span>
                  </span>
                  <Pill tone={d.status === "active" ? "primary" : "muted"}>{d.status}</Pill>
                </li>
              ))}
              {data.deployments.length === 0 && <Empty>Nothing deployed yet.</Empty>}
            </ul>
          </GlassCard>
        </div>
      </div>
    </>
  );
}

function SectionHead({
  title,
  to,
}: {
  title: string;
  to: "/conversations" | "/agents" | "/deployments";
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Link
        to={to}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        View all <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-muted-foreground">{children}</p>;
}
