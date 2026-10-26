import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalJson, sha256Hex } from "./tools/schema";

export async function setupSnapshot(config: unknown) {
  return sha256Hex(canonicalJson(JSON.parse(JSON.stringify(config))));
}

// Purpose is resolved from persisted server-owned state, not a client/worker flag.
export async function previewAuthority(
  session: {
    id: string;
    workspace_id: string;
    agent_id: string | null;
    runtime_bundle_id?: string | null;
    deployment_id?: string | null;
    channel?: string;
    started_by?: string | null;
  },
  purpose?: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;
  const { data: p, error } = await db
    .from("setup_preview_sessions")
    .select("*")
    .eq("session_id", session.id)
    .eq("workspace_id", session.workspace_id)
    .maybeSingle();
  if (error) throw new Error("Could not verify preview authorization");
  if (!p) {
    if (purpose === "setup_preview") throw new Error("Preview has no authorization");
    return null;
  }
  if (
    purpose !== "setup_preview" ||
    p.status !== "ready" ||
    p.expires_at <= new Date().toISOString() ||
    session.channel !== "web_test" ||
    session.deployment_id ||
    p.actor_id !== session.started_by ||
    p.bundle_id !== session.runtime_bundle_id
  )
    throw new Error("Preview authorization expired or changed");
  const { data: s, error: se } = await db
    .from("agent_setup_runs")
    .select("*")
    .eq("id", p.setup_id)
    .eq("workspace_id", session.workspace_id)
    .eq("agent_id", session.agent_id!)
    .single();
  const { data: a, error: ae } = await db
    .from("agents")
    .select("config")
    .eq("id", session.agent_id!)
    .eq("workspace_id", session.workspace_id)
    .single();
  const { data: allowed, error: pe } = await db.rpc("release_actor_is_admin", {
    _workspace: session.workspace_id,
    _actor: p.actor_id,
  });
  if (
    se ||
    ae ||
    pe ||
    !allowed ||
    !s ||
    !a ||
    s.revision !== p.setup_revision ||
    s.snapshot_hash !== p.snapshot_hash ||
    (await setupSnapshot(a.config)) !== p.snapshot_hash
  )
    throw new Error("Preview draft or permission changed");
  return { ...p, tool_id: s.tool_id, tool_revision_id: s.tool_revision_id };
}
