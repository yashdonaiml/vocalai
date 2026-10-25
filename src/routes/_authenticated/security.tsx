import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "@/lib/notify";
import { FileClock, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { GlassCard, PageHeader, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";

const DEFAULTS = { record_calls: false, announce_recording: true, retention_days: 90, transcript_access: "member", redact_pii: true };

const policyQuery = (org: string) => queryOptions({
  queryKey: ["security-policy", org],
  queryFn: async () => {
    const [{ data: policy, error: policyError }, { data: user, error: userError }] = await Promise.all([
      supabase.from("security_policies").select("*").eq("org_id", org).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    if (policyError || userError) throw policyError ?? userError;
    const { data: me, error: memberError } = await supabase.from("org_members").select("role").eq("org_id", org).eq("user_id", user.user?.id ?? "").maybeSingle();
    if (memberError) throw memberError;
    return { policy: policy ?? null, canEdit: me?.role === "owner" || me?.role === "admin" };
  },
});

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({ meta: [
    { title: "Security: VocollAI" }, { name: "description", content: "Set recording, retention, transcript access, and privacy controls for your organization." },
    { property: "og:title", content: "Security: VocollAI" }, { property: "og:description", content: "Set recording, retention, transcript access, and privacy controls for your organization." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Security,
});

const controls = [
  { icon: LockKeyhole, name: "Tenant isolation", detail: "Workspace resources are checked against authenticated membership in the database.", state: "Database policies" },
  { icon: KeyRound, name: "Provider credentials", detail: "Connected provider keys are encrypted and never sent to the browser.", state: "Encrypted at rest" },
  { icon: FileClock, name: "Audit history", detail: "Changes are recorded against each person's account on the Team page.", state: "Audit events" },
  { icon: ShieldCheck, name: "Support access", detail: "Support access is managed separately from customer workspace membership.", state: "Separate roles" },
];

function Row({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-4 py-4"><div className="min-w-60 flex-1"><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{detail}</p></div>{children}</div>;
}

function Security() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(policyQuery(ws.org_id));
  const [p, setP] = useState(data.policy ?? DEFAULTS);
  useEffect(() => { setP(data.policy ?? DEFAULTS); }, [data.policy]);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("security_policies").upsert({
      org_id: ws.org_id, record_calls: false, announce_recording: p.announce_recording, retention_days: p.retention_days,
      transcript_access: p.transcript_access, redact_pii: p.redact_pii, updated_by: u.user?.id ?? null, updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    const { error: auditError } = await supabase.from("audit_events").insert({ org_id: ws.org_id, actor_id: u.user?.id ?? null, action: "security_policy.updated", target: ws.org_name });
    if (auditError) { toast.error("Settings were saved, but the audit entry could not be recorded. Contact an administrator before making further changes."); qc.invalidateQueries({ queryKey: ["security-policy"] }); setSaving(false); return; }
    toast.success("Security settings saved");
    qc.invalidateQueries({ queryKey: ["security-policy"] });
  }

  const dis = !data.canEdit;
  return <>
    <PageHeader eyebrow="Manage" title="Security" subtitle="Privacy and data controls for your whole organization." />
    <GlassCard className="mb-5">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Data and privacy</h2>{dis && <SystemLabel>View only</SystemLabel>}</div>
      <div className="divide-y divide-border">
        <Row title="Audio recording" detail="Audio recording is not available. Calls are not recorded by this worker."><SystemLabel>Unavailable</SystemLabel></Row>
        <Row title="Mask contact and card numbers" detail="Mask email addresses and phone/card-like digit sequences in stored transcripts, summaries and execution logs. Names and other personal information are not automatically detected."><Switch disabled={dis} checked={p.redact_pii} onCheckedChange={(v) => setP({ ...p, redact_pii: v })} aria-label="Hide personal details" /></Row>
        <Row title="Keep call content for" detail="Expired transcripts, summaries, callback details and execution payloads are removed by the scheduled retention job. Call duration and billing metadata remain."><div className="flex items-center gap-2"><Input disabled={dis} type="number" min={1} max={3650} className="w-24" aria-label="Retention days" value={p.retention_days} onChange={(e) => setP({ ...p, retention_days: Number(e.target.value) })} /><span className="text-sm text-muted-foreground">days</span></div></Row>
        <Row title="Who can read transcripts" detail="Limit transcript access to owners and admins."><select disabled={dis} aria-label="Transcript access" className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={p.transcript_access} onChange={(e) => setP({ ...p, transcript_access: e.target.value })}><option value="member">Everyone in the organization</option><option value="admin">Owners and admins only</option></select></Row>
      </div>
      {!dis && <Button className="mt-2 rounded-full" disabled={saving} onClick={save}>{saving ? "Saving" : "Save settings"}</Button>}
      <p className="mt-3 text-xs text-muted-foreground">Transcript access applies to console reads and API exports. Admin-only content cannot be exported with a workspace API key. The platform operator must schedule retention cleanup.</p>
    </GlassCard>
    <div className="grid gap-4 md:grid-cols-2">{controls.map((c) => <GlassCard key={c.name}><div className="flex items-start justify-between gap-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary"><c.icon className="h-5 w-5" /></span><SystemLabel tone="muted">{c.state}</SystemLabel></div><h2 className="mt-5 font-semibold">{c.name}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{c.detail}</p></GlassCard>)}</div>
    <p className="mt-4 text-sm text-muted-foreground">See who changed what on the <Link to="/team" className="text-primary underline">Team</Link> page.</p>
  </>;
}
