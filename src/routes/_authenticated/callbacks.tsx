import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassCard, PageHeader } from "@/components/apple";
import { useWorkspace } from "@/lib/workspace";
import { listCallbacks } from "@/lib/callbacks.functions";

export const Route = createFileRoute("/_authenticated/callbacks")({ component: CallbackInbox });
function CallbackInbox() {
  const ws = useWorkspace();
  const list = useServerFn(listCallbacks);
  const { data, error, isPending } = useQuery({ queryKey: ["callbacks", ws.id], queryFn: () => list({ data: { workspaceId: ws.id } }), refetchInterval: 15000 });
  return <>
    <PageHeader eyebrow="Operate" title="Callback requests" subtitle="Confirmed requests saved by your receptionist. Saving a request does not notify anyone or schedule a call." />
    {error && <p role="alert">{error.message}</p>}
    {isPending && <p>Loading requests…</p>}
    {data?.length === 0 && <GlassCard>No callback requests yet.</GlassCard>}
    <div className="grid gap-4">{data?.map((r) => <GlassCard key={r.id}>
      <h2 className="font-semibold">{r.name}</h2>
      <p>{r.phone} · {r.language}</p><p className="mt-2 whitespace-pre-wrap">{r.reason}</p>
      <p className="mt-2 text-sm text-muted-foreground">Preferred time: {r.preferred_time}</p>
      <p className="text-xs text-muted-foreground">Saved {new Date(r.createdAt).toLocaleString()} · Reference {r.id}</p>
      <p className="text-xs text-muted-foreground">Awaiting manual follow-up. No notification sent.</p>
    </GlassCard>)}</div>
  </>;
}
