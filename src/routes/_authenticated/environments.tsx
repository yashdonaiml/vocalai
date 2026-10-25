import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/lib/notify";
import { Boxes, Check, Pencil, Plus, Rocket, Trash2, X } from "lucide-react";
import { GlassCard, PageHeader, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";

const environmentsQuery = (workspaceId: string) => queryOptions({
  queryKey: ["environments-page", workspaceId],
  queryFn: async () => {
    const [environments, deployments, agents] = await Promise.all([
      supabase.from("environments").select("id, name, kind, created_at").eq("workspace_id", workspaceId).order("created_at"),
      supabase.from("deployments").select("id, environment_id, agent_id, agent_version, canary_percent, status").eq("workspace_id", workspaceId),
      supabase.from("agents").select("id, name").eq("workspace_id", workspaceId),
    ]);
    const error = environments.error ?? deployments.error ?? agents.error;
    if (error) throw error;
    return { environments: environments.data ?? [], deployments: deployments.data ?? [], agents: agents.data ?? [] };
  },
});

export const Route = createFileRoute("/_authenticated/environments")({
  head: () => ({ meta: [
    { title: "Environments: VocollAI" }, { name: "description", content: "Create and manage development, staging, and production deployment targets." },
    { property: "og:title", content: "Environments: VocollAI" }, { property: "og:description", content: "Create and manage development, staging, and production deployment targets." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Environments,
});

function Environments() {
  const workspace = useWorkspace();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(environmentsQuery(workspace.id));
  const [name, setName] = useState("");
  const [kind, setKind] = useState("development");
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["environments-page"] }); qc.invalidateQueries({ queryKey: ["workspace-environments"] }); qc.invalidateQueries({ queryKey: ["deployments"] }); };
  const denied = (m: string) => m.includes("row-level") ? "Only owners and admins can manage environments" : m;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("environments").insert({ workspace_id: workspace.id, name: name.trim(), kind });
    if (error) toast.error(denied(error.message)); else { toast.success("Environment created"); setName(""); refresh(); }
  }
  async function rename() {
    if (!edit) return;
    const { error } = await supabase.from("environments").update({ name: edit.name.trim() }).eq("id", edit.id);
    if (error) toast.error(denied(error.message)); else { setEdit(null); refresh(); }
  }
  async function remove(id: string, n: string, active: number) {
    if (active > 0) { toast.error("Remove or move its active deployments first"); return; }
    if (!confirm(`Delete environment "${n}"?`)) return;
    const { error } = await supabase.from("environments").delete().eq("id", id);
    if (error) toast.error(error.message.includes("foreign key") ? "This environment has deployment history or phone numbers and cannot be deleted" : denied(error.message));
    else { toast.success("Environment deleted"); refresh(); }
  }

  return <>
    <PageHeader eyebrow="Deploy" title="Environments" subtitle="Separate places to test and run your agents." />
    <GlassCard className="mb-5">
      <form onSubmit={create} className="flex flex-wrap gap-2">
        <Input required maxLength={60} className="max-w-xs" placeholder="Name, for example Staging" aria-label="Environment name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option>
        </select>
        <Button type="submit" className="rounded-full"><Plus className="h-4 w-4" /> Add environment</Button>
      </form>
    </GlassCard>
    <div className="grid gap-4 md:grid-cols-2">{data.environments.map((environment) => {
      const active = data.deployments.filter((d) => d.environment_id === environment.id && d.status === "active");
      return <GlassCard key={environment.id}>
        <div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary"><Boxes className="h-5 w-5" /></span><SystemLabel tone={environment.kind === "production" ? "deployed" : "muted"}>{environment.kind}</SystemLabel></div>
        {edit?.id === environment.id ? (
          <div className="mt-5 flex gap-2"><Input aria-label="New name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /><Button size="icon" aria-label="Save name" onClick={rename}><Check className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEdit(null)}><X className="h-4 w-4" /></Button></div>
        ) : <h2 className="mt-5 text-lg font-semibold">{environment.name}</h2>}
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Rocket className="h-4 w-4" />{active.length} active deployment{active.length === 1 ? "" : "s"}</p>
        {active.length > 0 && <ul className="mt-2 space-y-1 text-sm">{active.map((d) => <li key={d.id} className="flex justify-between"><span>{data.agents.find((a) => a.id === d.agent_id)?.name ?? "Agent"}</span><span className="font-mono text-xs text-muted-foreground">v{d.agent_version}{d.canary_percent < 100 ? ` · ${d.canary_percent}%` : ""}</span></li>)}</ul>}
        <div className="mt-4 flex gap-1 border-t border-border pt-3">
          <Button size="sm" variant="ghost" asChild><Link to="/deployments">Deploy</Link></Button>
          <Button size="sm" variant="ghost" onClick={() => setEdit({ id: environment.id, name: environment.name })}><Pencil className="h-3.5 w-3.5" /> Rename</Button>
          {environment.kind !== "production" && <Button size="sm" variant="ghost" className="ml-auto hover:text-destructive" onClick={() => remove(environment.id, environment.name, active.length)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>}
        </div>
      </GlassCard>;
    })}</div>
  </>;
}
