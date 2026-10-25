import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader, Readout, SystemLabel } from "@/components/apple";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const detailQuery = (workspaceId: string, id: string) =>
  queryOptions({
    queryKey: ["conversation", workspaceId, id],
    refetchInterval: (query) => {
      const current = query.state.data as { conv?: { status?: string } } | null | undefined;
      return current?.conv && ["active", "live", "connecting"].includes(current.conv.status ?? "")
        ? 3000
        : false;
    },
    queryFn: async () => {
      const { data: conv, error } = await supabase
        .from("conversations")
        .select("*, agents(name), environments(name, kind)")
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw error;
      if (!conv) return null;
      const [turns, usage, tags, actions] = await Promise.all([
        supabase
          .from("conversation_turns")
          .select("seq, role, content, created_at")
          .eq("conversation_id", id)
          .eq("workspace_id", workspaceId)
          .order("seq"),
        supabase
          .from("usage_events")
          .select("kind, provider, model, quantity, unit, created_at")
          .eq("conversation_id", id)
          .eq("workspace_id", workspaceId)
          .order("created_at"),
        supabase
          .from("conversation_tags")
          .select("id, tag")
          .eq("conversation_id", id)
          .eq("workspace_id", workspaceId)
          .order("tag"),
        supabase
          .from("tool_invocations")
          .select("id,status,error_code,output_redacted,started_at")
          .eq("session_id", id)
          .eq("workspace_id", workspaceId)
          .order("started_at"),
      ]);
      if (turns.error || usage.error || tags.error || actions.error)
        throw turns.error ?? usage.error ?? tags.error ?? actions.error;
      return {
        conv,
        turns: turns.data ?? [],
        usage: usage.data ?? [],
        tags: tags.data ?? [],
        actions: actions.data ?? [],
      };
    },
  });

export const Route = createFileRoute("/_authenticated/conversations/$id")({
  head: () => ({
    meta: [
      { title: "Conversation detail: VocollAI" },
      { name: "description", content: "Summary, transcript, timeline, and usage for one call." },
      { property: "og:title", content: "Conversation detail: VocollAI" },
      {
        property: "og:description",
        content: "Summary, transcript, timeline, and usage for one call.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const workspace = useWorkspace();
  const { data } = useSuspenseQuery(detailQuery(workspace.id, id));
  const [, setClock] = useState(Date.now());
  useEffect(() => {
    if (!data?.conv || !["active", "live", "connecting"].includes(data.conv.status)) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [data?.conv?.status, data?.conv?.started_at]);
  if (!data)
    return (
      <GlassCard className="text-center">
        <p className="font-semibold">Conversation not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been deleted or belongs to another workspace.
        </p>
        <Link to="/conversations" className="mt-3 inline-block text-sm text-primary underline">
          Back to conversations
        </Link>
      </GlassCard>
    );
  const { conv, turns, usage, tags, actions } = data;
  const active = ["active", "live", "connecting"].includes(conv.status);
  const duration =
    conv.duration_seconds ??
    (active ? Math.max(0, Math.floor((Date.now() - Date.parse(conv.started_at)) / 1000)) : null);
  const agent = (conv.agents as unknown as { name: string } | null)?.name ?? "Deleted agent";
  const env = conv.environments as unknown as { name: string; kind: string } | null;
  const toolTurns = turns.filter((t) => t.role === "tool");
  const speech = turns.filter((t) => t.role !== "tool");

  return (
    <>
      <Link
        to="/conversations"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Conversations
      </Link>
      <PageHeader
        eyebrow="Operate"
        title={`${agent} call`}
        subtitle={new Date(conv.started_at).toLocaleString()}
        actions={
          <SystemLabel tone={conv.status === "failed" ? "warn" : active ? "live" : "muted"}>
            {conv.status}
          </SystemLabel>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <GlassCard>
          <Readout label="Duration" value={duration == null ? "Not recorded" : `${duration}s`} />
        </GlassCard>
        <GlassCard>
          <Readout label="Channel" value={conv.channel} />
        </GlassCard>
        <GlassCard>
          <Readout
            label="Version"
            value={conv.agent_version ? `v${conv.agent_version}` : "Draft"}
            tone="deployed"
          />
        </GlassCard>
        <GlassCard>
          <Readout label="Environment" value={env?.name ?? "Test"} />
        </GlassCard>
      </div>
      <Tabs defaultValue="summary">
        <TabsList className="flex-wrap">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="tools">Actions</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <GlassCard>
            <p className="text-sm leading-6">
              {conv.summary ?? "No summary was produced for this call."}
            </p>
            {tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2" aria-label="Call tags">
                {tags.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full border border-border bg-muted px-3 py-1 text-xs"
                  >
                    {t.tag}
                  </span>
                ))}
              </div>
            )}
          </GlassCard>
        </TabsContent>
        <TabsContent value="transcript">
          <GlassCard className="space-y-3">
            {speech.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transcript recorded.</p>
            ) : (
              speech.map((t) => (
                <div
                  key={t.seq}
                  className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${t.role === "user" ? "ml-auto bg-primary/15" : "bg-muted"}`}
                >
                  <p className="mb-0.5 text-[11px] uppercase text-muted-foreground">
                    {t.role === "user" ? "Caller" : "Agent"}
                  </p>
                  {t.content}
                </div>
              ))
            )}
          </GlassCard>
        </TabsContent>
        <TabsContent value="timeline">
          <GlassCard>
            <ol className="space-y-2 border-l border-border pl-4 text-sm">
              <li>
                <span className="font-mono text-xs text-muted-foreground">
                  {new Date(conv.started_at).toLocaleTimeString()}
                </span>{" "}
                Call started
              </li>
              {turns.map((t) => (
                <li key={t.seq}>
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleTimeString()}
                  </span>{" "}
                  {t.role === "tool"
                    ? "Tool activity"
                    : t.role === "user"
                      ? "Caller spoke"
                      : "Agent replied"}
                </li>
              ))}
              {conv.ended_at && (
                <li>
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(conv.ended_at).toLocaleTimeString()}
                  </span>{" "}
                  Call ended
                </li>
              )}
            </ol>
          </GlassCard>
        </TabsContent>
        <TabsContent value="tools">
          <GlassCard>
            {actions.length === 0 && toolTurns.length === 0 && (
              <p className="text-sm text-muted-foreground">No actions were recorded.</p>
            )}
            {actions.map((action) => (
              <details key={action.id} className="mb-3 rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm">
                  <SystemLabel tone={action.status === "succeeded" ? "ok" : "warn"}>
                    {action.status.replaceAll("_", " ")}
                  </SystemLabel>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(action.started_at).toLocaleTimeString()}
                  </span>
                </summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">
                  {JSON.stringify(action.output_redacted ?? { error: action.error_code }, null, 2)}
                </pre>
              </details>
            ))}
            {toolTurns.length > 0 && (
              <div className="space-y-2">
                {toolTurns.map((t) => (
                  <pre
                    key={t.seq}
                    className="overflow-auto rounded-lg bg-muted p-2 font-mono text-xs"
                  >
                    {t.content}
                  </pre>
                ))}
              </div>
            )}
          </GlassCard>
        </TabsContent>
        <TabsContent value="usage">
          <GlassCard>
            {usage.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage recorded for this call.</p>
            ) : (
              <div className="divide-y divide-border text-sm">
                {usage.map((u, i) => (
                  <div key={i} className="flex gap-3 py-2">
                    <span className="flex-1">{u.kind}</span>
                    <span className="text-xs text-muted-foreground">
                      {u.provider} {u.model}
                    </span>
                    <span className="font-mono">
                      {Number(u.quantity).toFixed(2)} {u.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Quantities are metered by aviroh. Provider charges may differ.
            </p>
          </GlassCard>
        </TabsContent>
        <TabsContent value="metadata">
          <GlassCard>
            <dl className="grid gap-2 font-mono text-xs sm:grid-cols-[180px_1fr]">
              {(
                [
                  ["Conversation", conv.id],
                  ["Caller number", conv.caller_number],
                  ["Phone route", conv.phone_number_id],
                  ["Agent", conv.agent_id],
                  ["Deployment", conv.deployment_id],
                  ["Environment", conv.environment_id],
                  ["Voice mode", conv.runtime_mode],
                  ["Session", conv.session_ref],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="break-all">{v ?? "None"}</dd>
                </div>
              ))}
            </dl>
          </GlassCard>
        </TabsContent>
      </Tabs>
    </>
  );
}
