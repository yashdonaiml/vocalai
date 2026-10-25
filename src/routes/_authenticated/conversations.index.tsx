import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader, SystemLabel } from "@/components/apple";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/lib/workspace";

const convQuery = (ws: string) =>
  queryOptions({
    queryKey: ["conversations", ws],
    queryFn: async () => {
      const [convs, agents] = await Promise.all([
        supabase.from("conversations").select("id, channel, status, started_at, duration_seconds, summary, agent_id, agent_version, agents(name)").eq("workspace_id", ws).order("started_at", { ascending: false }).range(0, 999),
        supabase.from("agents").select("id, name").eq("workspace_id", ws),
      ]);
      if (convs.error || agents.error) throw convs.error ?? agents.error;
      const all = [...(convs.data ?? [])];
      if (all.length === 1000) {
        let offset = 1000;
        while (true) {
          const { data: page, error } = await supabase.from("conversations").select("id, channel, status, started_at, duration_seconds, summary, agent_id, agent_version, agents(name)").eq("workspace_id", ws).order("started_at", { ascending: false }).range(offset, offset + 999);
          if (error) throw error;
          all.push(...(page ?? []));
          if ((page?.length ?? 0) < 1000) break;
          offset += 1000;
        }
      }
      return { convs: all, agents: agents.data ?? [] };
    },
  });

const search = z.object({ agent: z.string().optional(), channel: z.string().optional(), from: z.string().optional(), q: z.string().optional() });

export const Route = createFileRoute("/_authenticated/conversations/")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Conversations: VocollAI" },
      { name: "description", content: "Search and review every call your agents handle, with transcripts and timelines." },
      { property: "og:title", content: "Conversations: VocollAI" },
      { property: "og:description", content: "Search and review every call your agents handle, with transcripts and timelines." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Conversations,
});

const sel = "rounded-md border border-input bg-background px-3 py-2 text-sm";

function Conversations() {
  const ws = useWorkspace();
  const { data } = useSuspenseQuery(convQuery(ws.id));
  const s = Route.useSearch();
  const navigate = useNavigate({ from: "/conversations/" });
  const set = (patch: Partial<z.infer<typeof search>>) => navigate({ search: (p) => ({ ...p, ...patch }), replace: true });
  const channels = Array.from(new Set(data.convs.map((c) => c.channel)));
  const rows = data.convs.filter((c) =>
    (!s.agent || c.agent_id === s.agent) && (!s.channel || c.channel === s.channel) && (!s.from || c.started_at >= s.from) &&
    (!s.q || (c.summary ?? "").toLowerCase().includes(s.q.toLowerCase())));

  return (
    <>
      <PageHeader eyebrow="Operate" title="Conversations" subtitle="Every call, with its transcript and the agent that handled it." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search summaries" aria-label="Search summaries" value={s.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} />
        <select className={sel} aria-label="Agent" value={s.agent ?? ""} onChange={(e) => set({ agent: e.target.value || undefined })}><option value="">All agents</option>{data.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select className={sel} aria-label="Channel" value={s.channel ?? ""} onChange={(e) => set({ channel: e.target.value || undefined })}><option value="">All channels</option>{channels.map((c) => <option key={c}>{c}</option>)}</select>
        <Input type="date" className="w-44" aria-label="From date" value={s.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} />
      </div>
      {rows.length === 0 ? (
        <GlassCard className="border border-dashed border-border text-center text-muted-foreground">{data.convs.length === 0 ? "No calls yet. Run a test call from an agent's Test tab." : "No calls match these filters."}</GlassCard>
      ) : (
        <GlassCard className="overflow-hidden p-0">
          <div className="divide-y divide-border">
            {rows.map((c) => (
              <Link key={c.id} to="/conversations/$id" params={{ id: c.id }} className="grid gap-2 p-4 text-sm transition-colors hover:bg-muted md:grid-cols-[180px_1fr_2fr_auto_auto] md:items-center">
                <span className="font-mono text-xs text-muted-foreground">{new Date(c.started_at).toLocaleString()}</span>
                <span className="font-medium">{(c.agents as unknown as { name: string } | null)?.name ?? "Deleted agent"} <span className="font-mono text-xs text-muted-foreground">v{c.agent_version}</span></span>
                <span className="truncate text-muted-foreground">{c.summary ?? "No summary"}</span>
                <span className="font-mono text-xs text-muted-foreground">{c.duration_seconds ?? 0}s</span>
                <span className="flex items-center gap-2"><SystemLabel tone={c.status === "failed" ? "warn" : "muted"}>{c.status}</SystemLabel><SystemLabel>{c.channel}</SystemLabel></span>
              </Link>
            ))}
          </div>
        </GlassCard>
      )}
    </>
  );
}
