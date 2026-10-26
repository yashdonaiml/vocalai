// Runtime-facing control-plane logic, called by the signed /api/public/runtime/* routes.
import { hmacHex } from "../crypto.server";
import { z } from "zod";
import { normalizeConfig } from "../agent-config";

// Verifies `x-aviroh-timestamp` + `x-aviroh-signature` = hex(HMAC(secret, ts + "." + nonce + "." + body)).
export async function verifyRuntimeRequest(request: Request): Promise<unknown> {
  const secret = process.env["RUNTIME_SHARED_SECRET"];
  if (!secret) throw new Response("Runtime not configured", { status: 503 });
  const ts = request.headers.get("x-aviroh-timestamp") ?? "";
  const sig = request.headers.get("x-aviroh-signature") ?? "";
  const nonce = request.headers.get("x-aviroh-nonce") ?? "";
  const body = await request.text();
  if (
    !ts ||
    !Number.isFinite(Number(ts)) ||
    !/^[a-zA-Z0-9-]{16,128}$/.test(nonce) ||
    Math.abs(Date.now() / 1000 - Number(ts)) > 60
  )
    throw new Response("Stale request", { status: 401 });
  const expected = await hmacHex(secret, `${ts}.${nonce}.${body}`);
  if (sig.length !== expected.length) throw new Response("Bad signature", { status: 401 });
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) throw new Response("Bad signature", { status: 401 });
  const db = await admin();
  const { error } = await db
    .from("runtime_nonces")
    .insert({ nonce, expires_at: new Date(Date.now() + 300_000).toISOString() });
  if (error) throw new Response("Replayed request", { status: 401 });
  return body ? JSON.parse(body) : {};
}

export async function runtimeHandler(request: Request, fn: (body: unknown) => Promise<unknown>) {
  try {
    const body = await verifyRuntimeRequest(request);
    return Response.json(await fn(body));
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Runtime request failed" },
      { status: 400 },
    );
  }
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function sessionRow(sessionId: string) {
  const db = await admin();
  const { data } = await db
    .from("conversations")
    .select("*, workspaces(org_id)")
    .eq("id", sessionId)
    .single();
  if (!data) throw new Error("Session not found");
  return { ...data, org_id: (data.workspaces as unknown as { org_id: string }).org_id };
}

async function sessionBundle(sessionId: string) {
  const db = await admin();
  const s = await sessionRow(sessionId);
  if (s.status !== "active" || !s.agent_id) throw new Error("Session is not active");
  let bundleId = s.runtime_bundle_id;
  if (s.deployment_id) {
    const { data: dep } = await db
      .from("deployments")
      .select("bundle_id")
      .eq("id", s.deployment_id)
      .eq("workspace_id", s.workspace_id)
      .eq("agent_id", s.agent_id)
      .eq("environment_id", s.environment_id!)
      .eq("agent_version", s.agent_version!)
      .single();
    if (!dep?.bundle_id || (bundleId && bundleId !== dep.bundle_id))
      throw new Error("Session deployment is not valid");
    bundleId = dep.bundle_id;
  }
  if (!bundleId) throw new Error("No pinned bundle for this session");
  const { data: b } = await db
    .from("runtime_bundles")
    .select("bundle, checksum")
    .eq("id", bundleId)
    .eq("workspace_id", s.workspace_id)
    .eq("agent_id", s.agent_id)
    .single();
  if (!b) throw new Error("Session bundle not found");
  const { previewAuthority } = await import("../setup-preview-authority.server");
  await previewAuthority(s, (b.bundle as { purpose?: string }).purpose);
  const bundle = b.bundle as { runtime: unknown };
  const { bundleCredentials } = await import("./bundle.server");
  const credentials = await bundleCredentials(
    s.org_id,
    normalizeConfig({ runtime: bundle.runtime }).runtime,
  );
  return { session_id: s.id, checksum: b.checksum, bundle, credentials };
}

const SessionRequest = z.object({
  session_id: z.string().uuid().optional(),
  phone_number_id: z.string().uuid().optional(),
  caller: z
    .string()
    .regex(/^\+[1-9][0-9]{6,14}$/)
    .optional(),
  session_ref: z.string().min(1).max(200).optional(),
});

// Repeated opens for the same room return the original deployment, never a later draft.
export async function openSession(raw: unknown) {
  const body = SessionRequest.parse(raw);
  if (Boolean(body.session_id) === Boolean(body.phone_number_id))
    throw new Error("Provide either session_id or phone_number_id");
  if (body.session_id) return sessionBundle(body.session_id);
  if (!body.session_ref?.startsWith(`pstn-${body.phone_number_id}-`))
    throw new Error("Invalid telephone session reference");
  const db = await admin();
  const { data: num } = await db
    .from("phone_numbers")
    .select("*")
    .eq("id", body.phone_number_id!)
    .single();
  if (
    !num?.agent_id ||
    !num.environment_id ||
    !["routed", "active"].includes(num.status) ||
    !num.sip_trunk_ref ||
    !num.dispatch_rule_ref
  )
    throw new Error("Phone route is not configured");
  const { data: existing } = await db
    .from("conversations")
    .select("id")
    .eq("session_ref", body.session_ref)
    .eq("workspace_id", num.workspace_id)
    .eq("phone_number_id", num.id)
    .maybeSingle();
  if (existing) return sessionBundle(existing.id);
  await (
    await import("../telephony.server")
  ).validatePhoneRoute(num.workspace_id, num.agent_id, num.environment_id);
  const { data: dep } = await db
    .from("deployments")
    .select("id, agent_version, bundle_id")
    .eq("workspace_id", num.workspace_id)
    .eq("agent_id", num.agent_id)
    .eq("environment_id", num.environment_id)
    .eq("status", "active")
    .eq("canary_percent", 100)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!dep?.bundle_id)
    throw new Error("Deploy a published version at 100% to this number's environment first");
  const { data: ws } = await db
    .from("workspaces")
    .select("org_id")
    .eq("id", num.workspace_id)
    .single();
  const { data: b } = await db
    .from("runtime_bundles")
    .select("bundle, checksum")
    .eq("id", dep.bundle_id)
    .eq("workspace_id", num.workspace_id)
    .eq("agent_id", num.agent_id)
    .eq("agent_version", dep.agent_version)
    .eq("environment_id", num.environment_id)
    .single();
  if (!b || !ws) throw new Error("Deployed runtime bundle not found");
  const bundle = b.bundle as { runtime: unknown };
  const { bundleCredentials } = await import("./bundle.server");
  const credentials = await bundleCredentials(
    ws.org_id,
    normalizeConfig({ runtime: bundle.runtime }).runtime,
  );
  const { data: conv, error } = await db
    .from("conversations")
    .insert({
      workspace_id: num.workspace_id,
      agent_id: num.agent_id,
      agent_version: dep.agent_version,
      deployment_id: dep.id,
      runtime_bundle_id: dep.bundle_id,
      environment_id: num.environment_id,
      phone_number_id: num.id,
      caller_number: body.caller ?? null,
      channel: "pstn",
      runtime_mode: normalizeConfig({ runtime: bundle.runtime }).runtime.mode,
      status: "active",
      session_ref: body.session_ref,
    })
    .select("id")
    .single();
  if (error || !conv) {
    if (error?.code === "23505") {
      const { data: raced } = await db
        .from("conversations")
        .select("id")
        .eq("session_ref", body.session_ref)
        .eq("workspace_id", num.workspace_id)
        .eq("phone_number_id", num.id)
        .single();
      if (raced) return sessionBundle(raced.id);
    }
    throw new Error("Could not open telephone session");
  }
  await db
    .from("phone_numbers")
    .update({ last_call_at: new Date().toISOString() })
    .eq("id", num.id)
    .eq("workspace_id", num.workspace_id);
  void (await import("../workflows.server"))
    .dispatchWorkflows(num.workspace_id, "call.started", conv.id)
    .catch(() => console.error("Call-start workflow dispatch failed"));
  return { session_id: conv.id, checksum: b.checksum, bundle, credentials };
}

export async function retrieve(body: { session_id: string; query: string }) {
  const s = await sessionRow(body.session_id);
  if (s.status !== "active" || !s.agent_id || !s.runtime_bundle_id)
    throw new Error("Session is not active or has no pinned bundle");
  const db = await admin();
  const { data: pinned, error: bundleError } = await db
    .from("runtime_bundles")
    .select("bundle")
    .eq("id", s.runtime_bundle_id)
    .eq("workspace_id", s.workspace_id)
    .eq("agent_id", s.agent_id)
    .single();
  const knowledge = (pinned?.bundle as { knowledge?: { knowledge_base_ids?: unknown } } | undefined)
    ?.knowledge;
  const rawIds = knowledge?.knowledge_base_ids;
  if (bundleError || !Array.isArray(rawIds) || rawIds.some((id) => typeof id !== "string"))
    throw new Error("Session knowledge binding is not valid");
  const kbIds = [...new Set(rawIds as string[])];
  if (kbIds.length) {
    const { data: kbs, error } = await db
      .from("knowledge_bases")
      .select("id")
      .eq("workspace_id", s.workspace_id)
      .in("id", kbIds);
    if (error || kbs?.length !== kbIds.length)
      throw new Error("Session knowledge is not available in this workspace");
  }
  const { searchKnowledge } = await import("../knowledge.server");
  const hits = await searchKnowledge(kbIds, String(body.query).slice(0, 500), 5);
  return { results: hits.map((h) => ({ content: h.content, score: h.similarity })) };
}

const ToolRequest = z.object({
  session_id: z.string().uuid(),
  turn_id: z.string().min(1).max(128),
  invocation_id: z.string().uuid(),
  alias: z.string().min(1).max(128),
  arguments: z.record(z.unknown()),
});

export async function callTool(body: unknown) {
  const input = ToolRequest.parse(body);
  const { sessionBinding } = await import("../tools/bindings.server");
  const { session, binding } = await sessionBinding(input.session_id, input.alias);
  const { invokeTool } = await import("../tools/gateway.server");
  return invokeTool({
    workspaceId: session.workspace_id,
    toolId: binding.tool_id,
    toolRevisionId: binding.tool_revision_id,
    invocationKey: input.invocation_id,
    arguments: input.arguments,
    context: {
      kind: "voice_session",
      sessionId: session.id,
      turnId: input.turn_id,
      deploymentId: session.deployment_id ?? "",
    },
  });
}

const RuntimeEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("turn"),
    role: z.enum(["user", "assistant"]),
    content: z.string().max(8000),
  }),
  z.object({
    type: z.literal("usage"),
    kind: z.string().max(80),
    model: z.string().max(128),
    quantity: z.number().finite().nonnegative(),
    unit: z.string().max(32),
  }),
  z.object({ type: z.literal("end"), reason: z.string().max(80).optional() }),
]);

export async function ingestEvents(raw: unknown) {
  const body = z
    .object({
      session_id: z.string().uuid(),
      batch_id: z.string().uuid(),
      events: z.array(RuntimeEvent).min(1).max(200),
    })
    .parse(raw);
  const db = await admin();
  const { data: accepted, error } = await db.rpc("ingest_runtime_events", {
    _session_id: body.session_id,
    _batch_id: body.batch_id,
    _events: body.events,
  });
  if (error) throw new Error("Could not save runtime events");
  if (accepted) {
    const s = await sessionRow(body.session_id);
    const { data: preview, error: previewError } = await (
      db as unknown as import("@supabase/supabase-js").SupabaseClient
    )
      .from("setup_preview_sessions")
      .select("id")
      .eq("session_id", s.id)
      .eq("workspace_id", s.workspace_id)
      .maybeSingle();
    if (previewError) throw new Error("Could not verify workflow dispatch scope");
    if (preview) return { ok: true };
    const { dispatchWorkflows } = await import("../workflows.server");
    for (const ev of body.events) {
      if (ev.type === "turn" && ev.role === "user")
        await dispatchWorkflows(s.workspace_id, "keyword", s.id, ev.content);
      if (ev.type === "end") {
        await dispatchWorkflows(s.workspace_id, "call.ended", s.id);
        break;
      }
    }
  }
  return { ok: true };
}
