import { createFileRoute } from "@tanstack/react-router";

// Public REST API. Auth: `Authorization: Bearer avk_...` (workspace API key, stored hashed).
// Every request is scoped to the key's workspace and written to api_request_logs (no payloads).
async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const UUID = /^[0-9a-f-]{36}$/i;

async function handle(request: Request, splat: string) {
  const started = Date.now();
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!/^avk_[0-9a-f]{48}$/.test(token)) return Response.json({ error: "Missing or malformed API key" }, { status: 401 });
  const { data: key } = await db.from("api_keys").select("id, workspace_id, revoked_at").eq("key_hash", await sha256Hex(token)).maybeSingle();
  if (!key || key.revoked_at) return Response.json({ error: "Invalid or revoked API key" }, { status: 401 });
  const ws = key.workspace_id;
  const parts = splat.split("/").filter(Boolean);
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);

  let status = 200;
  let body: unknown;
  try {
    if (request.method !== "GET") { status = 405; body = { error: "Method not allowed" }; }
    else if (parts[0] === "agents" && parts.length === 1) {
      const { data } = await db.from("agents").select("id, name, description, status, live_version, created_at, updated_at").eq("workspace_id", ws).order("created_at");
      body = { data };
    } else if (parts[0] === "agents" && parts[1] && UUID.test(parts[1]) && parts.length === 2) {
      const { data } = await db.from("agents").select("id, name, description, status, live_version, created_at, updated_at").eq("workspace_id", ws).eq("id", parts[1]).maybeSingle();
      if (!data) { status = 404; body = { error: "Agent not found" }; } else body = { data };
    } else if (parts[0] === "agents" && parts[1] && UUID.test(parts[1]) && parts[2] === "versions") {
      const { data } = await db.from("agent_versions").select("version, checksum, created_at").eq("workspace_id", ws).eq("agent_id", parts[1]).order("version", { ascending: false });
      body = { data };
    } else if (parts[0] === "deployments" && parts.length === 1) {
      const { data } = await db.from("deployments").select("id, agent_id, environment_id, agent_version, status, canary_percent, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(limit);
      body = { data };
    } else if (parts[0] === "conversations" && parts.length === 1) {
      const privacy = await (await import("@/lib/privacy.server")).apiCallPrivacy(ws);
      const { data, error } = await db.from("conversations").select("id, agent_id, agent_version, channel, status, started_at, ended_at, duration_seconds, summary").eq("workspace_id", ws).gte("started_at", privacy.cutoff).is("privacy_purged_at" as never, null).order("started_at", { ascending: false }).limit(limit);
      if (error) throw new Error("Could not load conversations");
      body = { data };
    } else if (parts[0] === "conversations" && parts[1] && UUID.test(parts[1]) && parts[2] === "turns") {
      const privacy = await (await import("@/lib/privacy.server")).apiCallPrivacy(ws);
      const { data: conv, error: convError } = await db.from("conversations").select("id").eq("workspace_id", ws).eq("id", parts[1]).gte("started_at", privacy.cutoff).is("privacy_purged_at" as never, null).maybeSingle();
      if (convError) throw new Error("Could not load conversation");
      if (!conv) { status = 404; body = { error: "Conversation not found" }; }
      else {
        const { data, error } = await db.from("conversation_turns").select("seq, role, content, created_at").eq("conversation_id", conv.id).eq("workspace_id", ws).order("seq");
        if (error) throw new Error("Could not load transcript");
        body = { data };
      }
    } else if (parts[0] === "usage" && parts.length === 1) {
      const { data } = await db.from("usage_events").select("kind, provider, model, quantity, unit, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(limit);
      body = { data };
    } else { status = 404; body = { error: "Unknown endpoint" }; }
  } catch (e) {
    if (e instanceof Response) { status = e.status; body = { error: await e.text() }; }
    else { console.error(e); status = 500; body = { error: "Request failed" }; }
  }
  await Promise.all([
    db.from("api_request_logs").insert({ workspace_id: ws, api_key_id: key.id, method: request.method, path: `/${parts.join("/")}`.slice(0, 200), status, duration_ms: Date.now() - started }),
    db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id),
  ]);
  return Response.json(body, { status });
}

export const Route = createFileRoute("/api/public/v1/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params._splat ?? ""),
      POST: ({ request, params }) => handle(request, params._splat ?? ""),
    },
  },
});
