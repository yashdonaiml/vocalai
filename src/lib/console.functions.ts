import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: "is_workspace_member", a: { _ws: string; _min?: "admin" | "member" }) => PromiseLike<{ data: boolean | null }> }; userId: string };

async function requireWs(context: Ctx, ws: string, min: "admin" | "member" = "member") {
  const { data } = await context.supabase.rpc("is_workspace_member", { _ws: ws, _min: min });
  if (!data) throw new Error(min === "admin" ? "Only organization owners and admins can do this" : "Not a workspace member");
}

async function audit(ws: string, actor: string, action: string, target: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("workspaces").select("org_id").eq("id", ws).single();
  await supabaseAdmin.from("audit_events").insert({ org_id: data?.org_id ?? null, workspace_id: ws, actor_id: actor, action, target });
}

async function timedFetch(url: string, init: RequestInit, timeoutMs: number) {
  const started = Date.now();
  try {
    const { guardedFetch } = await import("./tools/egress.server");
    const res = await guardedFetch(url, { method: init.method ?? "GET", headers: new Headers(init.headers), ...(typeof init.body === "string" ? { body: init.body } : {}), timeoutMs, maxBytes: 262144 });
    const body = res.text.slice(0, 2000);
    return { status: res.status, body, durationMs: Date.now() - started, error: null as string | null };
  } catch (e) {
    return { status: null as number | null, body: "", durationMs: Date.now() - started, error: e instanceof Error ? e.message : "Request failed" };
  }
}

// Old tool endpoints must never execute or mutate the retired tool model.
// Current Tools UI uses tools.functions.ts and the revision-bound gateway.
export const updateTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async () => { throw new Error("Legacy tool editing is disabled. Use Tools to create and review a revision."); });

export const testTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async () => { throw new Error("Legacy tool tests are disabled. Use the governed Tools test action."); });

export const WEBHOOK_EVENTS = ["tool.succeeded", "tool.approved", "tool.changed", "tool.call_failed", "workflow.published", "connection.unhealthy"] as const;

export const createWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ workspaceId: z.string().uuid(), url: z.string().url().startsWith("https://"), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWs(context as never, data.workspaceId, "admin");
    const receiver = new URL(data.url);
    if (receiver.username || receiver.password) throw new Error("Put credentials in the webhook receiver, not in its URL.");
    if ([...receiver.searchParams.keys()].some((key) => /key|token|secret|auth|sig/i.test(key))) throw new Error("Remove keys or tokens from the webhook URL and keep them in your receiver configuration.");
    try { await (await import("./tools/egress.server")).assertEgressAllowed(receiver.origin); }
    catch { throw new Error("That webhook address is not allowed. Use a public HTTPS address."); }
    const rand = new Uint8Array(24);
    crypto.getRandomValues(rand);
    const secret = `whsec_${Array.from(rand).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    const { encryptSecret } = await import("./crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: endpoint, error } = await supabaseAdmin.from("webhook_endpoints").insert({
      workspace_id: data.workspaceId, url: data.url, events: data.events, secret_hint: `…${secret.slice(-4)}`,
      secret_ciphertext: await encryptSecret(secret), created_by: context.userId,
    }).select("id").single();
    if (error || !endpoint) throw new Error(error?.message ?? "Could not add the webhook endpoint.");
    await audit(data.workspaceId, context.userId, "webhook.created", data.url);
    return { id: endpoint.id, secret };
  });

async function loadEndpoint(context: Ctx & { supabase: unknown }, id: string) {
  const sb = context.supabase as unknown as { from: (t: "webhook_endpoints") => { select: (s: string) => { eq: (c: string, v: string) => { maybeSingle: () => PromiseLike<{ data: { id: string; workspace_id: string; url: string; events: string[] } | null }> } } } };
  const { data } = await sb.from("webhook_endpoints").select("id, workspace_id, url, events").eq("id", id).maybeSingle();
  if (!data) throw new Error("Webhook not found");
  await requireWs(context, data.workspace_id, "admin");
  return data;
}

export const setWebhookEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const ep = await loadEndpoint(context as never, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("webhook_endpoints").update({ enabled: data.enabled }).eq("id", ep.id);
    await audit(ep.workspace_id, context.userId, data.enabled ? "webhook.enabled" : "webhook.disabled", ep.url);
    return { ok: true };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ep = await loadEndpoint(context as never, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("webhook_endpoints").delete().eq("id", ep.id);
    await audit(ep.workspace_id, context.userId, "webhook.deleted", ep.url);
    return { ok: true };
  });

// Sends a signed test event so customers can verify their receiver and signature check.
export const testWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ep = await loadEndpoint(context as never, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("webhook_endpoints").select("secret_ciphertext").eq("id", ep.id).single();
    const { decryptSecret, hmacHex } = await import("./crypto.server");
    const secret = await decryptSecret(row!.secret_ciphertext);
    const event = "test.ping";
    const ts = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ type: event, created_at: new Date().toISOString(), data: { message: "Test delivery from aviroh" } });
    const sig = await hmacHex(secret, `${ts}.${body}`);
    const r = await timedFetch(ep.url, { method: "POST", headers: { "content-type": "application/json", "x-aviroh-timestamp": ts, "x-aviroh-signature": sig }, body }, 10000);
    await supabaseAdmin.from("webhook_deliveries").insert({ endpoint_id: ep.id, workspace_id: ep.workspace_id, event, status: r.status, error: r.error, duration_ms: r.durationMs });
    return { status: r.status, error: r.error, durationMs: r.durationMs };
  });

const PROVIDER_PROBES: Record<string, (k: string) => [string, Record<string, string>]> = {
  openai: (k) => ["https://api.openai.com/v1/models", { authorization: `Bearer ${k}` }],
  anthropic: (k) => ["https://api.anthropic.com/v1/models", { "x-api-key": k, "anthropic-version": "2023-06-01" }],
  google: (k) => [`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`, {}],
  deepgram: (k) => ["https://api.deepgram.com/v1/projects", { authorization: `Token ${k}` }],
  elevenlabs: (k) => ["https://api.elevenlabs.io/v1/user", { "xi-api-key": k }],
  cartesia: (k) => ["https://api.cartesia.ai/voices", { "x-api-key": k, "cartesia-version": "2024-06-10" }],
};

// Verifies a stored key with a read-only call to the provider. Never returns the key.
export const testProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("provider_accounts").select("id, org_id, provider").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Key not found");
    const { data: ok } = await context.supabase.rpc("is_org_member", { _org: row.org_id, _min: "admin" });
    if (!ok) throw new Error("Only organization admins can test keys");
    const probe = PROVIDER_PROBES[row.provider];
    if (!probe) throw new Error("No test available for this provider");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin.from("provider_accounts").select("key_ciphertext").eq("id", row.id).single();
    const { decryptSecret } = await import("./crypto.server");
    const [url, headers] = probe(await decryptSecret(s!.key_ciphertext));
    const r = await timedFetch(url, { method: "GET", headers }, 10000);
    return { ok: r.status !== null && r.status < 300, status: r.status, error: r.error, durationMs: r.durationMs };
  });
