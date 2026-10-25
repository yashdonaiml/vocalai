import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassCard, PageHeader, Readout, SectionTitle, SystemLabel } from "@/components/apple";
import { getPlatformHealth } from "@/lib/internal.functions";

export const Route = createFileRoute("/internal/")({ component: Health });

function Health() {
  const fn = useServerFn(getPlatformHealth);
  const { data, error, isLoading } = useQuery({ queryKey: ["internal-health"], queryFn: () => fn(), refetchInterval: 30_000 });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading platform health</p>;
  if (error || !data) return <p className="text-sm text-destructive">Could not load platform health.</p>;
  const infra = [
    { name: "Media layer", ok: data.media },
    { name: "Runtime shared secret", ok: data.runtimeSecret },
    ...data.keys.map((k) => ({ name: `Platform key: ${k.provider}`, ok: k.configured })),
  ];
  return (
    <>
      <PageHeader eyebrow="Internal" title="Platform health" subtitle="Configuration status and failures across all organizations in the last 24 hours." />
      <div className="grid gap-4 sm:grid-cols-3">
        <GlassCard><Readout label="Active sessions" value={data.activeSessions} tone="live" /></GlassCard>
        <GlassCard><Readout label="Failed sessions (24h)" value={data.failedSessions} tone={data.failedSessions ? "warn" : "muted"} /></GlassCard>
        <GlassCard><Readout label="Failed ingests (24h)" value={data.failedIngests} tone={data.failedIngests ? "warn" : "muted"} /></GlassCard>
      </div>
      <GlassCard className="mt-4">
        <SectionTitle title="Infrastructure" subtitle="Configured or missing only. Values are never shown." />
        <ul className="divide-y divide-border">
          {infra.map((i) => (
            <li key={i.name} className="flex items-center justify-between py-2 text-sm">
              <span>{i.name}</span>
              <SystemLabel tone={i.ok ? "ok" : "warn"} dot>{i.ok ? "Configured" : "Missing"}</SystemLabel>
            </li>
          ))}
        </ul>
      </GlassCard>
    </>
  );
}
