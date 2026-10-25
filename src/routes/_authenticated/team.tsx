import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "@/lib/notify";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/lib/workspace";

type Role = "owner" | "admin" | "member";

const teamQuery = (org: string) =>
  queryOptions({
    queryKey: ["team", org],
    queryFn: async () => {
      const [{ data: u }, members, emails, workspaces, audit, invites] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("org_members").select("user_id, role, created_at").eq("org_id", org).order("created_at"),
        supabase.rpc("org_member_emails", { _org: org }),
        supabase.from("workspaces").select("id, name, created_at").eq("org_id", org).order("created_at"),
        supabase.from("audit_events").select("id, action, target, actor_id, created_at, metadata").eq("org_id", org).order("created_at", { ascending: false }).limit(100),
        supabase.from("org_invitations").select("id, email, role, created_at").eq("org_id", org).eq("status", "pending").order("created_at", { ascending: false }),
      ]);
      const emailOf: Record<string, string> = {};
      for (const e of emails.data ?? []) emailOf[e.user_id] = e.email;
      return {
        me: u.user?.id ?? null,
        emailOf,
        members: members.data ?? [],
        workspaces: workspaces.data ?? [],
        audit: audit.data ?? [],
        invites: invites.data ?? [],
      };
    },
  });

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team: VocollAI" },
      { name: "description", content: "Invite teammates, manage roles and see who changed what." },
      { property: "og:title", content: "Team: VocollAI" },
      { property: "og:description", content: "Invite teammates, manage roles and see who changed what." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Team,
});

const roleTone = { owner: "deployed", admin: "ok", member: "muted" } as const;

const actionLabels: Record<string, string> = {
  insert: "created",
  update: "edited",
  delete: "deleted",
};

function describe(action: string) {
  const [table, op] = action.split(".");
  const noun = (table ?? action).replace(/_/g, " ").replace(/s$/, "");
  return op && actionLabels[op] ? `${actionLabels[op]} ${noun}` : action.replace(/[._]/g, " ");
}

function Team() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(teamQuery(ws.org_id));
  const myRole = (data.members.find((m) => m.user_id === data.me)?.role ?? "member") as Role;
  const canManage = myRole !== "member";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);
  const who = (id: string | null) => (id ? (id === data.me ? "You" : data.emailOf[id] ?? "Former member") : "System");

  async function invite(e: FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { toast.error("Enter a valid email address."); return; }
    if (Object.values(data.emailOf).some((m) => m.toLowerCase() === clean)) { toast.error("That person is already a member."); return; }
    setBusy(true);
    const { error } = await supabase.from("org_invitations").insert({ org_id: ws.org_id, email: clean, role, invited_by: data.me! });
    if (!error) await supabase.from("audit_events").insert({ org_id: ws.org_id, actor_id: data.me, action: "member.invited", target: clean });
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? "An invitation for that email is already pending." : "Could not send the invitation."); return; }
    setEmail("");
    toast.success(`Invitation saved. Ask ${clean} to sign up with that email.`);
    qc.invalidateQueries({ queryKey: ["team", ws.org_id] });
  }

  async function revoke(id: string, target: string) {
    const { error } = await supabase.from("org_invitations").update({ status: "revoked" }).eq("id", id);
    if (error) { toast.error("Could not cancel the invitation."); return; }
    await supabase.from("audit_events").insert({ org_id: ws.org_id, actor_id: data.me, action: "member.invite_cancelled", target });
    qc.invalidateQueries({ queryKey: ["team", ws.org_id] });
  }

  const owners = data.members.filter((m) => m.role === "owner").length;
  const canEdit = (r: Role) => canManage && (r !== "owner" || myRole === "owner");

  async function changeRole(userId: string, from: Role, to: Role) {
    if (from === to) return;
    if (from === "owner" && owners <= 1) { toast.error("Keep at least one owner. Make someone else owner first."); return; }
    const { error } = await supabase.from("org_members").update({ role: to }).eq("org_id", ws.org_id).eq("user_id", userId);
    if (error) { toast.error("Could not change the role."); return; }
    toast.success("Role updated");
    qc.invalidateQueries({ queryKey: ["team", ws.org_id] });
  }
  async function removeMember(userId: string, r: Role) {
    const label = data.emailOf[userId] ?? "this member";
    if (r === "owner" && owners <= 1) { toast.error("You cannot remove the only owner."); return; }
    const self = userId === data.me;
    if (!confirm(self ? "Leave this organization? You will lose access to its workspaces." : `Remove ${label}? They lose access to every workspace immediately.`)) return;
    const { error } = await supabase.from("org_members").delete().eq("org_id", ws.org_id).eq("user_id", userId);
    if (error) { toast.error("Could not remove the member."); return; }
    toast.success(self ? "You left the organization" : `${label} removed`);
    if (self) { window.location.href = "/onboarding"; return; }
    qc.invalidateQueries({ queryKey: ["team", ws.org_id] });
  }
  function copyInvite(mail: string) {
    const link = `${window.location.origin}/auth?email=${encodeURIComponent(mail)}`;
    void navigator.clipboard.writeText(link);
    toast.success("Sign-up link copied. Send it to them; they join when they sign up with this email.");
  }

  return (
    <>
      <PageHeader eyebrow="Manage" title={ws.org_name} subtitle="Invite people, set their roles and see who changed what." />
      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Members</h2>
            <span className="font-mono text-xs text-muted-foreground">{data.members.length}</span>
          </div>
          <ul className="divide-y divide-border">
            {data.members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">{data.emailOf[m.user_id] ?? "Member"}{m.user_id === data.me ? " (you)" : ""}</p>
                  <p className="text-xs text-muted-foreground">Joined {new Date(m.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canEdit(m.role) && m.user_id !== data.me ? (
                    <select value={m.role} onChange={(e) => changeRole(m.user_id, m.role, e.target.value as Role)} aria-label={`Role for ${data.emailOf[m.user_id] ?? "member"}`} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      {myRole === "owner" && <option value="owner">Owner</option>}
                    </select>
                  ) : <SystemLabel tone={roleTone[m.role]}>{m.role}</SystemLabel>}
                  {(m.user_id === data.me || canEdit(m.role)) && (
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeMember(m.user_id, m.role)}>{m.user_id === data.me ? "Leave" : "Remove"}</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard>
          <h2 className="mb-1 font-semibold">Invite a teammate</h2>
          {canManage ? (
            <>
              <p className="mb-4 text-xs text-muted-foreground">They join automatically the first time they sign in with this email.</p>
              <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row">
                <Input type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Teammate email" className="flex-1" />
                <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  {myRole === "owner" && <option value="owner">Owner</option>}
                </select>
                <Button type="submit" disabled={busy}>{busy ? "Saving" : "Invite"}</Button>
              </form>
              <h3 className="mb-2 mt-5 text-sm font-medium">Pending</h3>
              {data.invites.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending invites.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.invites.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="truncate">{i.email} <span className="text-xs text-muted-foreground">as {i.role}</span></span>
                      <span className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => copyInvite(i.email)}>Copy link</Button>
                        <Button variant="ghost" size="sm" onClick={() => revoke(i.id, i.email)}>Cancel</Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Ask an owner or admin to invite people.</p>
          )}
          <h3 className="mb-2 mt-6 text-sm font-medium">Workspaces</h3>
          <ul className="divide-y divide-border">
            {data.workspaces.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium">{w.name}</span>
                {w.id === ws.id ? <SystemLabel tone="deployed" dot>Current</SystemLabel> : null}
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Activity</h2>
          {data.audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes yet. Edits by your team appear here.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.audit.map((a) => {
                const changed = ((a.metadata as { changed?: string[] } | null)?.changed ?? []).filter((c) => !c.endsWith("ciphertext"));
                return (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p><span className="font-medium">{who(a.actor_id)}</span> {describe(a.action)}{a.target ? <span className="text-muted-foreground"> {a.target}</span> : null}</p>
                      {changed.length > 0 && <p className="text-xs text-muted-foreground">Changed: {changed.join(", ")}</p>}
                    </div>
                    <span className="shrink-0 pl-3 font-mono text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>
      </div>
    </>
  );
}
