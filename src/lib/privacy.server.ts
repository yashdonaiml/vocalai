// Service-role reads must apply the same privacy boundary as browser RLS.
export type CallPrivacy = { transcriptAccess: "member" | "admin"; redactPii: boolean; retentionDays: number; cutoff: string };

export async function workspaceCallPrivacy(workspaceId: string): Promise<CallPrivacy> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: workspace, error: wsError } = await db.from("workspaces").select("org_id").eq("id", workspaceId).single();
  if (wsError || !workspace) throw new Error("Could not load workspace privacy policy");
  const { data: policy, error } = await db.from("security_policies").select("transcript_access,redact_pii,retention_days").eq("org_id", workspace.org_id).maybeSingle();
  if (error) throw new Error("Could not load workspace privacy policy");
  const retentionDays = policy?.retention_days ?? 90;
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650 || (policy && !["member", "admin"].includes(policy.transcript_access))) throw new Error("Invalid workspace privacy policy");
  return { transcriptAccess: policy?.transcript_access === "admin" ? "admin" : "member", redactPii: policy?.redact_pii ?? true, retentionDays, cutoff: new Date(Date.now() - retentionDays * 86_400_000).toISOString() };
}

// Workspace API keys carry no user/admin identity. They must not widen an admin-only
// policy into an export capability merely because this request uses service_role.
export async function apiCallPrivacy(workspaceId: string): Promise<CallPrivacy> {
  const policy = await workspaceCallPrivacy(workspaceId);
  if (policy.transcriptAccess === "admin") throw new Response("Transcript access requires an administrator session", { status: 403 });
  return policy;
}

export async function purgeExpiredCallData() {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data, error } = await db.rpc("purge_expired_call_data" as never);
  if (error) throw new Error("Could not purge expired call data");
  return { purgedConversations: Number(data ?? 0) };
}
