import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "@/lib/notify";
import { Phone, Rocket, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { deployVersion } from "@/lib/platform.functions";

const sel = "rounded-md border border-input bg-background px-3 py-2 text-sm";

const deployQuery = (ws: string) =>
  queryOptions({
    queryKey: ["deployments", ws],
    queryFn: async () => {
      const [envs, agents, versions, deps, numbers] = await Promise.all([
        supabase.from("environments").select("id, name, kind").eq("workspace_id", ws).order("kind"),
        supabase.from("agents").select("id, name").eq("workspace_id", ws).order("created_at"),
        supabase.from("agent_versions").select("agent_id, version, checksum, created_at").eq("workspace_id", ws).order("version", { ascending: false }),
        supabase.from("deployments").select("id, agent_id, environment_id, agent_version, status, canary_percent, created_at, runtime_bundles(checksum)").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(100),
        supabase.from("phone_numbers").select("id, e164, carrier, agent_id, environment_id, status").eq("workspace_id", ws).order("created_at"),
      ]);
      const error = envs.error ?? agents.error ?? versions.error ?? deps.error ?? numbers.error;
      if (error) throw error;
      return { envs: envs.data ?? [], agents: agents.data ?? [], versions: versions.data ?? [], deps: deps.data ?? [], numbers: numbers.data ?? [] };
    },
  });

export const Route = createFileRoute("/_authenticated/deployments")({
  head: () => ({
    meta: [
      { title: "Deployments: VocollAI" },
      { name: "description", content: "Choose which agent version runs in each environment and roll back anytime." },
      { property: "og:title", content: "Deployments: VocollAI" },
      { property: "og:description", content: "Choose which agent version runs in each environment and roll back anytime." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Deployments,
});

function Deployments() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(deployQuery(ws.id));
  const deploy = useServerFn(deployVersion);
  const [busy, setBusy] = useState(false);
  const [fAgent, setFAgent] = useState("");
  const [fEnv, setFEnv] = useState("");
  const agentName = (id: string | null) => data.agents.find((a) => a.id === id)?.name ?? "Deleted agent";
  const envName = (id: string | null) => data.envs.find((e) => e.id === id)?.name ?? "Deleted environment";
  const refresh = () => qc.invalidateQueries({ queryKey: ["deployments"] });
  const history = data.deps.filter((d) => (!fAgent || d.agent_id === fAgent) && (!fEnv || d.environment_id === fEnv));

  async function run(agentId: string, environmentId: string, version: number, canary = 100) {
    setBusy(true);
    try {
      const r = await deploy({ data: { agentId, environmentId, version, canary } });
      toast.success(canary < 100 ? `Staged v${version} as a ${canary}% canary; calls remain on the full deployment.` : `Deployed v${version} to 100% of calls.`);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Deploy failed"); }
    setBusy(false);
  }

  return (
    <>
      <PageHeader eyebrow="Deploy" title="Deployments" subtitle="Choose which agent version runs in each environment. Roll back anytime." />
      <div className="grid gap-5 lg:grid-cols-2">
        {data.envs.map((env) => (
          <GlassCard key={env.id} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{env.name}</h2>
              <SystemLabel tone={env.kind === "production" ? "deployed" : "muted"}>{env.kind === "production" ? "PROD" : "DEV"}</SystemLabel>
            </div>
            {data.agents.length === 0 && <p className="text-sm text-muted-foreground">No agents yet. Create one on the Agents page.</p>}
            {data.agents.map((a) => {
              const active = data.deps.find((d) => d.agent_id === a.id && d.environment_id === env.id && d.status === "active");
              const canary = data.deps.find((d) => d.agent_id === a.id && d.environment_id === env.id && d.status === "active" && d.canary_percent < 100);
              const versions = data.versions.filter((v) => v.agent_id === a.id);
              const previous = data.deps.find((d) => d.agent_id === a.id && d.environment_id === env.id && d.status === "superseded");
              return (
                <div key={a.id} className="rounded-xl bg-muted p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{a.name}</span>
                    {active ? <SystemLabel tone={active.canary_percent < 100 ? "warn" : "live"} dot>{active.canary_percent < 100 ? `Staged canary ${active.canary_percent}% · not serving` : `v${active.agent_version}`}</SystemLabel> : <SystemLabel>Not deployed</SystemLabel>}
                  </div>
                  {active && (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      bundle {(active.runtime_bundles as unknown as { checksum: string } | null)?.checksum.slice(0, 12)} · {new Date(active.created_at).toLocaleString()}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {versions.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Publish a version in the agent studio first.</span>
                    ) : (
                      <DeployPicker versions={versions.map((v) => v.version)} disabled={busy} onDeploy={(v, c) => run(a.id, env.id, v, c)} />
                    )}
                    {canary && (
                      <Button size="sm" variant="secondary" className="rounded-full" disabled={busy} onClick={() => run(a.id, env.id, canary.agent_version, 100)}>
                        Promote v{canary.agent_version} from {canary.canary_percent}% to 100%
                      </Button>
                    )}
                    {previous && (
                      <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => run(a.id, env.id, previous.agent_version)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Roll back to v{previous.agent_version}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </GlassCard>
        ))}
      </div>

      <GlassCard className="mt-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">History</h2>
          <div className="flex gap-2">
            <select aria-label="Filter by agent" className={`${sel} py-1`} value={fAgent} onChange={(e) => setFAgent(e.target.value)}><option value="">All agents</option>{data.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <select aria-label="Filter by environment" className={`${sel} py-1`} value={fEnv} onChange={(e) => setFEnv(e.target.value)}><option value="">All environments</option>{data.envs.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          </div>
        </div>
        {history.length === 0 ? <p className="text-sm text-muted-foreground">No deployments yet. Publish an agent version, then deploy it.</p> : (
          <div className="divide-y divide-border">
            {history.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="w-44 font-mono text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
                <span className="flex-1">{agentName(d.agent_id)} · {envName(d.environment_id)}</span>
                <span className="font-mono text-xs">v{d.agent_version}{d.canary_percent < 100 ? ` · ${d.canary_percent}%` : ""}</span>
                <span className="font-mono text-xs text-muted-foreground">{(d.runtime_bundles as unknown as { checksum: string } | null)?.checksum.slice(0, 10)}</span>
                <SystemLabel tone={d.status === "active" ? "live" : "muted"}>{d.status}</SystemLabel>
              </div>
            ))}
          </div>
        )}
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /> Phone numbers now live in <Link to="/telephony" className="text-primary underline">Telephony</Link>.</p>
      </GlassCard>
    </>
  );
}

function DeployPicker({ versions, disabled, onDeploy }: { versions: number[]; disabled: boolean; onDeploy: (v: number, canary: number) => void }) {
  const [v, setV] = useState(versions[0] ?? 1);
  const [c, setC] = useState(100);
  return (
    <>
      <select className={`${sel} py-1`} value={v} onChange={(e) => setV(Number(e.target.value))}>
        {versions.map((x) => <option key={x} value={x}>v{x}</option>)}
      </select>
      <select aria-label="Deployment stage" className={`${sel} py-1`} value={c} onChange={(e) => setC(Number(e.target.value))}>
        {[5, 10, 25, 50, 100].map((x) => <option key={x} value={x}>{x === 100 ? "Full deployment" : `Stage canary ${x}% (not serving calls)`}</option>)}
      </select>
      <Button size="sm" className="rounded-full" disabled={disabled} onClick={() => onDeploy(v, c)}><Rocket className="h-3.5 w-3.5" /> Deploy</Button>
    </>
  );
}
