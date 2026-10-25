import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROVIDER_IDS = ["openai", "anthropic", "google", "elevenlabs", "deepgram", "cartesia"] as const;

// Ingest one knowledge source: extract text -> chunk -> embed (KB's provider) -> store vectors.
export const ingestSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ sourceId: z.string().uuid(), text: z.string().max(500_000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error } = await context.supabase
      .from("knowledge_sources")
      .select("id, workspace_id, knowledge_base_id, name, kind, storage_path, source_url")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (error || !src) throw new Error("Source not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { chunkText, embedForKb, extractText, loadKbMeta } = await import("./knowledge.server");
    await supabaseAdmin.from("knowledge_sources").update({ status: "processing", error: null }).eq("id", src.id);
    try {
      let text = data.text ?? "";
      // Re-index of a pasted-text source: rebuild from its stored passages (original text is not kept separately).
      if (!text && src.kind !== "file" && src.kind !== "url") {
        const { data: old } = await supabaseAdmin.from("knowledge_chunks").select("content").eq("source_id", src.id).order("chunk_index");
        text = (old ?? []).map((c) => c.content).join("\n\n");
      }
      if (src.kind === "file" && src.storage_path) {
        const { data: file, error: dl } = await supabaseAdmin.storage.from("knowledge").download(src.storage_path);
        if (dl || !file) throw new Error("Could not read the uploaded file");
        text = await extractText(new Uint8Array(await file.arrayBuffer()), src.name);
      }
      if (src.kind === "url" && src.source_url) {
        const { guardedFetch } = await import("./tools/egress.server");
        const res = await guardedFetch(src.source_url, { method: "GET", headers: new Headers({ "user-agent": "aviroh-knowledge/1.0" }), timeoutMs: 15_000, maxBytes: 2_000_000 });
        if (res.status < 200 || res.status >= 300) throw new Error(`Could not load that page (status ${res.status})`);
        const html = res.text;
        text = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, "\n")
          .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }
      const chunks = chunkText(text).slice(0, 400);
      if (!chunks.length) throw new Error("No readable text found");
      const [kb] = await loadKbMeta([src.knowledge_base_id]);
      if (!kb) throw new Error("Knowledge base not found");
      const vectors = await embedForKb(kb, chunks);
      await supabaseAdmin.from("knowledge_chunks").delete().eq("source_id", src.id);
      const rows = chunks.map((content, i) => ({
        source_id: src.id,
        knowledge_base_id: src.knowledge_base_id,
        workspace_id: src.workspace_id,
        chunk_index: i,
        content,
        embedding: JSON.stringify(vectors[i]),
      }));
      for (let i = 0; i < rows.length; i += 50) {
        const { error: ins } = await supabaseAdmin.from("knowledge_chunks").insert(rows.slice(i, i + 50) as never);
        if (ins) throw new Error(ins.message);
      }
      await supabaseAdmin.from("knowledge_sources").update({ status: "ready", chunk_count: chunks.length }).eq("id", src.id);
      await supabaseAdmin.from("usage_events").insert({
        workspace_id: src.workspace_id,
        kind: "embedding_chunks",
        model: `${kb.embedding_provider}/${kb.embedding_model}`,
        quantity: chunks.length,
        unit: "chunks",
      });
      return { chunks: chunks.length };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Ingestion failed";
      await supabaseAdmin.from("knowledge_sources").update({ status: "failed", error: message }).eq("id", src.id);
      throw new Error(message);
    }
  });

export const testSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ kbId: z.string().uuid(), query: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: kb } = await context.supabase.from("knowledge_bases").select("id").eq("id", data.kbId).maybeSingle();
    if (!kb) throw new Error("Knowledge base not found");
    const { searchKnowledge } = await import("./knowledge.server");
    return searchKnowledge([kb.id], data.query, 5);
  });

export const saveProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({
      orgId: z.string().uuid(),
      provider: z.enum(PROVIDER_IDS),
      label: z.string().trim().min(1).max(60),
      apiKey: z.string().trim().min(8).max(400),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("is_org_member", { _org: data.orgId, _min: "admin" });
    if (!ok) throw new Error("Only organization admins can add keys");
    const { encryptSecret } = await import("./crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("provider_accounts").insert({
      org_id: data.orgId,
      provider: data.provider,
      label: data.label,
      key_hint: `…${data.apiKey.slice(-4)}`,
      key_ciphertext: await encryptSecret(data.apiKey),
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_events").insert({ org_id: data.orgId, actor_id: context.userId, action: "provider_key.added", target: data.provider });
    return { ok: true };
  });

export const deleteProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("provider_accounts").select("id, org_id, provider").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Key not found");
    const { data: ok } = await context.supabase.rpc("is_org_member", { _org: row.org_id, _min: "admin" });
    if (!ok) throw new Error("Only organization admins can remove keys");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("provider_accounts").delete().eq("id", row.id);
    await supabaseAdmin.from("audit_events").insert({ org_id: row.org_id, actor_id: context.userId, action: "provider_key.removed", target: row.provider });
    return { ok: true };
  });

// Which platform-level keys and infrastructure are configured (booleans only).
export const platformStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { platformKeyStatus } = await import("./providers/registry.server");
    const { mediaConfigured } = await import("./runtime/livekit.server");
    return { keys: platformKeyStatus(), media: mediaConfigured(), runtimeSecret: Boolean(process.env["RUNTIME_SHARED_SECRET"]) };
  });

// Test session on the saved draft: compile a preview bundle, open a session, return a join grant.
export const startTestSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ agentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: agent } = await context.supabase.from("agents").select("id, workspace_id, config").eq("id", data.agentId).maybeSingle();
    if (!agent) throw new Error("Agent not found");
    const { createSessionJoin } = await import("./runtime/livekit.server");
    const { compileBundle } = await import("./runtime/bundle.server");
    const { normalizeConfig } = await import("./agent-config");
    const { bundleId } = await compileBundle({ workspaceId: agent.workspace_id, agentId: agent.id, agentVersion: null, environmentId: null, userId: context.userId });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sessionRef = `web-${crypto.randomUUID()}`;
    const { data: conv, error } = await supabaseAdmin
      .from("conversations")
      .insert({
        workspace_id: agent.workspace_id,
        agent_id: agent.id,
        channel: "web_test",
        status: "active",
        started_by: context.userId,
        runtime_mode: normalizeConfig(agent.config).runtime.mode,
        session_ref: sessionRef,
        runtime_bundle_id: bundleId,
      })
      .select("id")
      .single();
    if (error || !conv) throw new Error("Could not open session");
    const join = await createSessionJoin({ sessionRef, identity: `user-${context.userId}`, metadata: { session_id: conv.id, bundle_id: bundleId } });
    return { sessionId: conv.id, ...join };
  });

// Compile first, then atomically validate gates and replace the active deployment in PostgreSQL.
export const deployVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ agentId: z.string().uuid(), environmentId: z.string().uuid(), version: z.number().int().positive(), canary: z.number().int().min(1).max(100).default(100) }).strict().parse(d))
  .handler(async ({ data, context }) => {
    const { data: agent, error: agentError } = await context.supabase.from("agents").select("id, workspace_id").eq("id", data.agentId).maybeSingle();
    const { data: env, error: envError } = await context.supabase.from("environments").select("id, workspace_id").eq("id", data.environmentId).maybeSingle();
    if (agentError || envError || !agent || !env || env.workspace_id !== agent.workspace_id) throw new Error("Agent or environment not found");
    const { data: allowed, error: permissionError } = await context.supabase.rpc("is_workspace_member", { _ws: agent.workspace_id, _min: "admin" });
    if (permissionError || !allowed) throw new Error("Workspace admin required to deploy agents.");
    const { compileBundle } = await import("./runtime/bundle.server");
    const { bundleId, checksum } = await compileBundle({ workspaceId: agent.workspace_id, agentId: agent.id, agentVersion: data.version, environmentId: env.id, userId: context.userId });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: deploymentId, error } = await supabaseAdmin.rpc("promote_agent_deployment" as never, {
      _workspace: agent.workspace_id, _agent: agent.id, _environment: env.id, _version: data.version,
      _bundle: bundleId, _actor: context.userId, _canary: data.canary,
    } as never);
    if (error || !deploymentId) throw new Error(error?.message ?? "Deployment could not be promoted; the previous deployment remains active.");
    return { checksum, deploymentId: deploymentId as string };
  });

export const createTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({
      workspaceId: z.string().uuid(),
      name: z.string().regex(/^[a-z][a-z0-9_]{1,47}$/),
      description: z.string().max(500),
      parameters: z.string().max(5000),
      endpointUrl: z.string().url().startsWith("https://"),
      method: z.enum(["GET", "POST"]),
      timeoutMs: z.number().int().min(500).max(30000),
      authHeader: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async () => {
    throw new Error("Legacy tools are disabled. Create and approve an action on the Tools page.");
  });

