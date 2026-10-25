import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" | "operator" }) => PromiseLike<{ data: boolean | null }> }; userId: string };

// Staff check runs through the caller's own client; the admin client is only loaded afterwards.
async function staffRole(context: Ctx): Promise<"admin" | "operator"> {
  const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (admin) return "admin";
  const { data: op } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operator" });
  if (op) return "operator";
  throw new Error("Not authorized");
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function audit(actor: string, action: string, target: string | null, metadata: Record<string, unknown> = {}) {
  const db = await admin();
  await db.from("internal_audit_events" as never).insert({ actor_id: actor, action, target, metadata } as never);
}

export const getStaffRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try { return { role: await staffRole(context as unknown as Ctx) }; } catch { return { role: null }; }
  });

export const getPlatformHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staffRole(context as unknown as Ctx);
    const { platformKeyStatus } = await import("./providers/registry.server");
    const { mediaConfigured } = await import("./runtime/livekit.server");
    const db = await admin();
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
    const [failedIngests, failedSessions, activeSessions] = await Promise.all([
      count(db.from("knowledge_sources").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since)),
      count(db.from("conversations").select("id", { count: "exact", head: true }).eq("status", "failed").gte("started_at", since)),
      count(db.from("conversations").select("id", { count: "exact", head: true }).in("status", ["active", "live", "connecting"])),
    ]);
    return {
      keys: platformKeyStatus(),
      media: mediaConfigured(),
      runtimeSecret: Boolean(process.env["RUNTIME_SHARED_SECRET"]),
      failedIngests, failedSessions, activeSessions,
    };
  });

export const searchOrgs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ query: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    await staffRole(context as unknown as Ctx);
    const db = await admin();
    const term = data.query.replace(/[%_,()]/g, "");
    const { data: orgs } = await db.from("organizations").select("id, name, created_at").ilike("name", `%${term}%`).limit(20);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const results = await Promise.all((orgs ?? []).map(async (o) => {
      const { data: wss } = await db.from("workspaces").select("id").eq("org_id", o.id);
      const wsIds = (wss ?? []).map((w) => w.id);
      const none = ["00000000-0000-0000-0000-000000000000"];
      const ids = wsIds.length ? wsIds : none;
      const [members, agents, convs, providers] = await Promise.all([
        db.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", o.id),
        db.from("agents").select("id", { count: "exact", head: true }).in("workspace_id", ids),
        db.from("conversations").select("id", { count: "exact", head: true }).in("workspace_id", ids).gte("started_at", since),
        db.from("provider_accounts").select("provider").eq("org_id", o.id),
      ]);
      return {
        id: o.id, name: o.name, created_at: o.created_at,
        members: members.count ?? 0, workspaces: wsIds.length, agents: agents.count ?? 0, conversations30d: convs.count ?? 0,
        byok: [...new Set((providers.data ?? []).map((p) => p.provider))],
      };
    }));
    await audit(context.userId, "org.lookup", null, { query: term, results: results.length });
    return results;
  });

export const saveIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(3).max(140),
    severity: z.enum(["minor", "major", "critical"]),
    status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
    notes: z.string().max(4000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await staffRole(context as unknown as Ctx);
    const db = await admin();
    const row = { title: data.title, severity: data.severity, status: data.status, notes: data.notes, updated_at: new Date().toISOString() };
    const res = data.id
      ? await db.from("platform_incidents" as never).update(row as never).eq("id", data.id)
      : await db.from("platform_incidents" as never).insert({ ...row, created_by: context.userId } as never);
    if (res.error) throw new Error(res.error.message);
    await audit(context.userId, data.id ? "incident.updated" : "incident.opened", data.title, { status: data.status, severity: data.severity });
    return { ok: true };
  });

export const requestSupportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ orgId: z.string().uuid(), reason: z.string().trim().min(10).max(1000), hours: z.number().int().min(1).max(24) }).parse(d))
  .handler(async ({ data, context }) => {
    await staffRole(context as unknown as Ctx);
    const db = await admin();
    const { error } = await db.from("support_access_requests" as never).insert({ org_id: data.orgId, requested_by: context.userId, reason: data.reason, duration_hours: data.hours } as never);
    if (error) throw new Error(error.message);
    await audit(context.userId, "support_access.requested", data.orgId, { hours: data.hours });
    return { ok: true };
  });

export const decideSupportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await staffRole(context as unknown as Ctx);
    if (role !== "admin") throw new Error("Only platform admins can decide access requests");
    const db = await admin();
    const { data: req } = await db.from("support_access_requests" as never).select("id, org_id, requested_by, duration_hours, status").eq("id", data.id).maybeSingle();
    const r = req as { id: string; org_id: string; requested_by: string; duration_hours: number; status: string } | null;
    if (!r || r.status !== "pending") throw new Error("Request is not pending");
    if (r.requested_by === context.userId) throw new Error("You cannot approve your own request");
    const update = data.approve
      ? { status: "approved", approved_by: context.userId, expires_at: new Date(Date.now() + r.duration_hours * 3_600_000).toISOString() }
      : { status: "denied", approved_by: context.userId };
    const { error } = await db.from("support_access_requests" as never).update(update as never).eq("id", r.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, data.approve ? "support_access.approved" : "support_access.denied", r.org_id, { request: r.id });
    return { ok: true };
  });
