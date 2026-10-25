import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function requireWsAdmin(context: { supabase: { rpc: (fn: "is_workspace_member", a: { _ws: string; _min: "admin" }) => PromiseLike<{ data: boolean | null }> } }, ws: string) {
  const { data } = await context.supabase.rpc("is_workspace_member", { _ws: ws, _min: "admin" });
  if (!data) throw new Error("Only organization owners and admins can manage API keys");
}

// Issues a workspace API key. The raw key is returned once; only its SHA-256 hash is stored.
export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ workspaceId: z.string().uuid(), name: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWsAdmin(context as never, data.workspaceId);
    const rand = new Uint8Array(24);
    crypto.getRandomValues(rand);
    const secret = Array.from(rand).map((b) => b.toString(16).padStart(2, "0")).join("");
    const key = `avk_${secret}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("api_keys").insert({
      workspace_id: data.workspaceId, name: data.name, prefix: key.slice(0, 12), key_hash: await sha256Hex(key), created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    const { data: ws } = await supabaseAdmin.from("workspaces").select("org_id").eq("id", data.workspaceId).single();
    await supabaseAdmin.from("audit_events").insert({ org_id: ws?.org_id ?? null, workspace_id: data.workspaceId, actor_id: context.userId, action: "api_key.created", target: data.name });
    return { key };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("api_keys").select("id, workspace_id, name").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Key not found");
    await requireWsAdmin(context as never, row.workspace_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", row.id);
    const { data: ws } = await supabaseAdmin.from("workspaces").select("org_id").eq("id", row.workspace_id).single();
    await supabaseAdmin.from("audit_events").insert({ org_id: ws?.org_id ?? null, workspace_id: row.workspace_id, actor_id: context.userId, action: "api_key.revoked", target: row.name });
    return { ok: true };
  });
