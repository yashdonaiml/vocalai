import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Tool governance writes happen only here (ENG-TOOLS-001). Every action checks an explicit permission.
type Ctx = {
  supabase: {
    rpc: (
      fn: "has_permission",
      a: { _perm: string; _ws: string },
    ) => PromiseLike<{ data: boolean | null }>;
  };
  userId: string;
};

const PERM_MESSAGES: Record<string, string> = {
  "connector.create": "You don't have permission to add connections.",
  "connector.update": "You don't have permission to change connections.",
  "connector.pause": "You don't have permission to pause connections.",
  "connector.delete": "You don't have permission to remove connections.",
  "credential.manage": "You don't have permission to change saved credentials.",
  "tool.approve": "Only reviewers, admins and owners can approve tools.",
  "tool.revoke": "You don't have permission to turn tools off.",
  "tool.test.mock": "You don't have permission to test tools.",
  "tool.test.sandbox": "You don't have permission to test tools in the sandbox.",
  "tool.test.live": "Only admins and owners can send live test calls.",
  "agent.bind_tools": "You don't have permission to change an agent's tools.",
  "workflow.publish": "Only admins and owners can save workflow versions.",
};

async function can(context: Ctx, perm: string, ws: string) {
  const { data } = await context.supabase.rpc("has_permission", { _perm: perm, _ws: ws });
  if (!data) throw new Error(PERM_MESSAGES[perm] ?? "You don't have permission to do this.");
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function requireIntegrationTest(workspaceId: string, toolId: string, revisionId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("tool_invocations")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("tool_id", toolId)
    .eq("tool_revision_id", revisionId)
    .eq("context_kind", "console_test")
    .eq("mode", "live")
    .eq("status", "succeeded")
    .gte("started_at", new Date(Date.now() - 86400000).toISOString())
    .limit(1)
    .maybeSingle();
  if (error || !data)
    throw new Error(
      "Run a successful real test of this action version before approving live calls",
    );
}

export const configureIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({ connectorId: z.string().uuid(), taskId: z.string(), path: z.string().max(300) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = await connectorWs(data.connectorId);
    await can(context as Ctx, "connector.update", c.workspace_id);
    if (c.type !== "http" && c.type !== "webhook")
      throw new Error("Choose a web API or automation connection");
    const { taskOperation } = await import("./integration-tasks");
    const { upsertOperation } = await import("./tools/catalog.server");
    return upsertOperation(c.workspace_id, c.id, taskOperation(data.taskId, data.path));
  });

export const approveIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ toolId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: def, error } = await db
      .from("tool_definitions")
      .select("workspace_id,current_revision_id,connector_id,state")
      .eq("id", data.toolId)
      .single();
    if (error || !def || def.state !== "active") throw new Error("Action is not available");
    await can(context as Ctx, "tool.approve", def.workspace_id);
    const { data: rev, error: revError } = await db
      .from("tool_revisions")
      .select("adapter_mapping")
      .eq("id", def.current_revision_id!)
      .eq("workspace_id", def.workspace_id)
      .single();
    if (revError || !rev) throw new Error("Action version is not available");
    const { integrationTask } = await import("./integration-tasks");
    const task = integrationTask(
      (rev.adapter_mapping as { integration_task?: string })?.integration_task ?? "",
    );
    await requireIntegrationTest(def.workspace_id, data.toolId, def.current_revision_id!);
    const { data: previous, error: previousError } = await db
      .from("tool_approvals")
      .select("status,allowed_contexts,policy_revision")
      .eq("tool_revision_id", def.current_revision_id!)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      previousError ||
      previous?.status !== "approved" ||
      !previous.allowed_contexts?.includes("console_test")
    )
      throw new Error("Review and authorize testing for this action first");
    const { error: saveError } = await db
      .from("tool_approvals")
      .insert({
        workspace_id: def.workspace_id,
        tool_revision_id: def.current_revision_id!,
        status: "approved",
        risk_class: task.risk,
        confirmation_minimum: task.risk === "read" ? "none" : "voice_readback",
        allowed_contexts: ["console_test", "voice_session"],
        safe_to_retry: false,
        approval_source: "human",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        policy_revision: previous.policy_revision + 1,
      });
    if (saveError) throw new Error("Could not approve the action");
    return { ok: true };
  });
async function connectorWs(id: string) {
  const db = await admin();
  const { data } = await db
    .from("tool_connectors")
    .select("id, workspace_id, org_id, canonical_origin, type")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) throw new Error("Connection not found");
  return data;
}

const Auth = z.object({
  kind: z.enum(["bearer", "basic", "header", "query"]),
  headerName: z
    .string()
    .regex(/^[A-Za-z0-9-_]{1,60}$/)
    .optional(),
  secret: z.string().min(1).max(4000),
});

async function saveCredential(
  c: { id: string; workspace_id: string; org_id: string; canonical_origin: string },
  auth: z.infer<typeof Auth>,
  actor: string,
) {
  const db = await admin();
  const { encryptSecret } = await import("./crypto.server");
  const { data: old } = await db
    .from("tool_credentials")
    .select("id")
    .eq("connector_id", c.id)
    .eq("status", "active")
    .maybeSingle();
  if (old) {
    await db
      .from("tool_credentials")
      .update({ status: "replaced", rotated_at: new Date().toISOString() })
      .eq("id", old.id);
    await db
      .from("tool_credential_events")
      .insert({ workspace_id: c.workspace_id, credential_id: old.id, event: "rotated", actor });
  }
  const { data: cred, error } = await db
    .from("tool_credentials")
    .insert({
      org_id: c.org_id,
      workspace_id: c.workspace_id,
      connector_id: c.id,
      origin: c.canonical_origin,
      auth_kind: auth.kind,
      header_name:
        auth.kind === "header" || auth.kind === "query"
          ? (auth.headerName ?? (auth.kind === "header" ? "X-API-Key" : "api_key"))
          : null,
      ciphertext: await encryptSecret(auth.secret),
      hint: auth.secret.length > 6 ? `…${auth.secret.slice(-4)}` : "saved",
      created_by: actor,
    })
    .select("id")
    .single();
  if (error || !cred) throw new Error("Could not save the credentials");
  await db
    .from("tool_credential_events")
    .insert({ workspace_id: c.workspace_id, credential_id: cred.id, event: "created", actor });
}

export const addConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        type: z.enum(["http", "mcp", "webhook"]),
        name: z.string().trim().min(1).max(80),
        url: z.string().url().max(500),
        auth: Auth.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await can(context as Ctx, "connector.create", data.workspaceId);
    const u = new URL(data.url);
    if (u.protocol !== "https:") throw new Error("The address must start with https://");
    if (u.username || u.password)
      throw new Error("Put credentials in the credentials field, not in the address.");
    if ([...u.searchParams.keys()].some((k) => /key|token|secret|auth|sig/i.test(k)))
      throw new Error(
        "Remove keys or tokens from the address and save them as credentials instead.",
      );
    const { assertEgressAllowed } = await import("./tools/egress.server");
    try {
      await assertEgressAllowed(u.origin);
    } catch {
      throw new Error("That address is not allowed. Use a public https address.");
    }
    const db = await admin();
    const { data: ws } = await db
      .from("workspaces")
      .select("org_id")
      .eq("id", data.workspaceId)
      .single();
    const { data: c, error } = await db
      .from("tool_connectors")
      .insert({
        org_id: ws!.org_id,
        workspace_id: data.workspaceId,
        type: data.type,
        display_name: data.name,
        canonical_origin: u.origin,
        endpoint_path: `${u.pathname || "/"}${u.search}`,
        created_by: context.userId,
        provider_label: data.type === "webhook" ? "automation" : null,
      })
      .select("id, workspace_id, org_id, canonical_origin")
      .single();
    if (error || !c)
      throw new Error(
        error?.message.includes("duplicate")
          ? "A connection with that name already exists."
          : "Could not add the connection",
      );
    if (data.auth) await saveCredential(c, data.auth, context.userId);
    if (data.type === "mcp") {
      const { checkConnector } = await import("./tools/catalog.server");
      try {
        const r = await checkConnector(c.id, context.userId);
        return { id: c.id, found: r.added, error: null as string | null };
      } catch (e) {
        return {
          id: c.id,
          found: 0,
          error: e instanceof Error ? e.message : "Could not list tools",
        };
      }
    }
    return { id: c.id, found: 0, error: null as string | null };
  });

export const addWebTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        connectorId: z.string().uuid(),
        name: z
          .string()
          .regex(/^[a-z][a-z0-9_]{1,47}$/, "Use lowercase letters, numbers and underscores"),
        description: z.string().trim().min(5).max(500),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z
          .string()
          .max(300)
          .regex(/^\/[^\s?#]*$/, "Path must start with / and contain no spaces or query string"),
        inputSchema: z.string().max(10000),
        params: z.record(z.string(), z.enum(["path", "query", "header", "body"])).optional(),
        select: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = await connectorWs(data.connectorId);
    if (c.type === "mcp") throw new Error("MCP connections list their own tools.");
    await can(context as Ctx, "connector.update", c.workspace_id);
    let schema: unknown;
    try {
      schema = JSON.parse(data.inputSchema || '{"type":"object","properties":{}}');
    } catch {
      throw new Error("Inputs must be valid JSON");
    }
    if (!schema || typeof schema !== "object" || (schema as { type?: string }).type !== "object")
      throw new Error(
        'Inputs must be an object schema, for example {"type":"object","properties":{}}',
      );
    for (const m of data.path.matchAll(/\{([^}]+)\}/g))
      if (!((schema as { properties?: Record<string, unknown> }).properties ?? {})[m[1]!])
        throw new Error(`Add "${m[1]}" to the inputs, it is used in the path.`);
    const params = { ...data.params };
    for (const m of data.path.matchAll(/\{([^}]+)\}/g)) params[m[1]!] = "path";
    const { upsertOperation } = await import("./tools/catalog.server");
    const r = await upsertOperation(c.workspace_id, c.id, {
      opId: `${data.method} ${data.path}#${data.name}`,
      slug: data.name,
      displayName: data.name,
      description: data.description,
      inputSchema: schema,
      mapping: {
        method: data.method,
        path: data.path,
        params,
        ...(data.select ? { select: data.select } : {}),
        ...(c.type === "webhook" ? {} : {}),
      },
      risk: data.method === "GET" ? "read" : data.method === "DELETE" ? "destructive" : "write",
    });
    return r;
  });

export const importOpenApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({ connectorId: z.string().uuid(), spec: z.string().min(2).max(500_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = await connectorWs(data.connectorId);
    if (c.type === "mcp") throw new Error("MCP connections list their own tools.");
    await can(context as Ctx, "connector.update", c.workspace_id);
    let spec: {
      paths?: Record<
        string,
        Record<
          string,
          {
            operationId?: string;
            summary?: string;
            description?: string;
            parameters?: {
              name: string;
              in: string;
              required?: boolean;
              schema?: unknown;
              description?: string;
            }[];
            requestBody?: {
              content?: Record<
                string,
                { schema?: { properties?: Record<string, unknown>; required?: string[] } }
              >;
            };
          }
        >
      >;
    };
    try {
      spec = JSON.parse(data.spec);
    } catch {
      throw new Error("Paste the API description as JSON. YAML is not supported yet.");
    }
    if (!spec.paths) throw new Error("No operations found in that API description.");
    const { upsertOperation, slugify } = await import("./tools/catalog.server");
    let added = 0,
      changed = 0,
      skipped = 0;
    for (const [path, ops] of Object.entries(spec.paths).slice(0, 200)) {
      for (const [method, op] of Object.entries(ops)) {
        const M = method.toUpperCase();
        if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(M)) continue;
        const properties: Record<string, unknown> = {},
          required: string[] = [],
          params: Record<string, string> = {};
        for (const p of op.parameters ?? []) {
          if (!["path", "query", "header"].includes(p.in) || /^authorization$/i.test(p.name))
            continue;
          properties[p.name] = {
            ...((p.schema as object) ?? { type: "string" }),
            ...(p.description ? { description: p.description.slice(0, 300) } : {}),
          };
          params[p.name] = p.in;
          if (p.required || p.in === "path") required.push(p.name);
        }
        const body = op.requestBody?.content?.["application/json"]?.schema;
        if (body?.properties) {
          for (const [k, v] of Object.entries(body.properties)) {
            properties[k] = v;
            params[k] = "body";
          }
          required.push(...(body.required ?? []));
        }
        const desc = (op.summary || op.description || `${M} ${path}`).slice(0, 500);
        try {
          const r = await upsertOperation(c.workspace_id, c.id, {
            opId: `${M} ${path}`,
            slug: slugify(op.operationId ?? `${method}_${path}`),
            displayName: op.operationId ?? `${M} ${path}`,
            description: desc,
            inputSchema: { type: "object", properties, required },
            mapping: { method: M, path, params },
            risk: M === "GET" ? "read" : M === "DELETE" ? "destructive" : "write",
          });
          if (r.change === "new") added++;
          if (r.change === "changed") changed++;
        } catch {
          skipped++;
        }
      }
    }
    return { added, changed, skipped };
  });

export const checkConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ connectorId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await connectorWs(data.connectorId);
    await can(context as Ctx, "connector.update", c.workspace_id);
    const { checkConnector } = await import("./tools/catalog.server");
    return checkConnector(c.id, context.userId);
  });

export const updateConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        connectorId: z.string().uuid(),
        enabled: z.boolean().optional(),
        auth: Auth.optional(),
        remove: z.boolean().optional(),
        sandboxOf: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const c = await connectorWs(data.connectorId);
    const db = await admin();
    if (data.remove) {
      await can(context as Ctx, "connector.delete", c.workspace_id);
      await db
        .from("tool_credentials")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("connector_id", c.id)
        .eq("status", "active");
      await db
        .from("tool_definitions")
        .update({ state: "archived", archived_at: new Date().toISOString() })
        .eq("connector_id", c.id);
      await db
        .from("tool_connectors")
        .update({
          archived_at: new Date().toISOString(),
          admin_enabled: false,
          health: "revoked",
          display_name: `${c.id.slice(0, 8)} removed`,
        })
        .eq("id", c.id);
      return { ok: true };
    }
    if (data.enabled !== undefined) {
      await can(context as Ctx, "connector.pause", c.workspace_id);
      await db.from("tool_connectors").update({ admin_enabled: data.enabled }).eq("id", c.id);
    }
    if (data.sandboxOf !== undefined) {
      await can(context as Ctx, "connector.update", c.workspace_id);
      if (data.sandboxOf) {
        const live = await connectorWs(data.sandboxOf);
        if (live.workspace_id !== c.workspace_id || live.id === c.id)
          throw new Error("Pick another connection in this workspace");
      }
      await db
        .from("tool_connectors")
        .update({
          sandbox_of: data.sandboxOf,
          environment_class: data.sandboxOf ? "sandbox" : "live",
        })
        .eq("id", c.id);
    }
    if (data.auth) {
      await can(context as Ctx, "credential.manage", c.workspace_id);
      await saveCredential(c, data.auth, context.userId);
      await db
        .from("tool_connectors")
        .update({ health: "not_checked", error_code: null })
        .eq("id", c.id);
    }
    return { ok: true };
  });

export const reviewTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        revisionId: z.string().uuid(),
        decision: z.enum(["approve", "reject", "revoke"]),
        riskClass: z.enum(["read", "write", "sensitive", "destructive", "restricted"]),
        confirmation: z.enum(["none", "voice", "voice_readback"]),
        contexts: z
          .array(z.enum(["voice_session", "text_test", "workflow", "console_test"]))
          .min(1),
        safeToRetry: z.boolean(),
        timeoutMs: z.number().int().min(500).max(15000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: rev } = await db
      .from("tool_revisions")
      .select("id, workspace_id, tool_id, adapter_mapping")
      .eq("id", data.revisionId)
      .maybeSingle();
    if (!rev) throw new Error("Tool not found");
    await can(
      context as Ctx,
      data.decision === "revoke" ? "tool.revoke" : "tool.approve",
      rev.workspace_id,
    );
    const { data: def } = await db
      .from("tool_definitions")
      .select("connector_id, current_revision_id")
      .eq("id", rev.tool_id)
      .single();
    if (data.decision === "approve" && def?.current_revision_id !== rev.id)
      throw new Error("A newer version of this tool exists. Review that one instead.");
    const taskId = (rev.adapter_mapping as { integration_task?: string } | null)?.integration_task;
    if (data.decision === "approve" && taskId) {
      const { integrationTask } = await import("./integration-tasks");
      const task = integrationTask(taskId);
      if (task.risk === "write" && data.riskClass === "read")
        throw new Error("This action changes data and requires caller confirmation");
      if (data.contexts.includes("voice_session"))
        await requireIntegrationTest(rev.workspace_id, rev.tool_id, rev.id);
    }
    const minimum = {
      read: "none",
      write: "voice",
      sensitive: "voice",
      destructive: "voice_readback",
      restricted: "none",
    }[data.riskClass];
    const rank = { none: 0, voice: 1, voice_readback: 2 } as const;
    const confirmation =
      rank[data.confirmation] >= rank[minimum as keyof typeof rank] ? data.confirmation : minimum;
    const safe = data.safeToRetry && data.riskClass === "read";
    const { data: prev } = await db
      .from("tool_approvals")
      .select("policy_revision")
      .eq("tool_revision_id", rev.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const status =
      data.decision === "approve"
        ? "approved"
        : data.decision === "reject"
          ? "rejected"
          : "revoked";
    const { error } = await db.from("tool_approvals").insert({
      workspace_id: rev.workspace_id,
      tool_revision_id: rev.id,
      risk_class: data.riskClass,
      confirmation_minimum: confirmation,
      allowed_contexts: data.contexts,
      safe_to_retry: safe,
      status,
      approval_source: "human",
      approved_by: status === "approved" ? context.userId : null,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      policy_revision: (prev?.policy_revision ?? 0) + 1,
    });
    if (error) throw new Error("Could not save the review");
    if (data.timeoutMs)
      await db
        .from("tool_policies")
        .update({
          timeout_ms: data.timeoutMs,
          revision: (prev?.policy_revision ?? 0) + 1,
          updated_by: context.userId,
        })
        .eq("tool_id", rev.tool_id);
    const { settleDrift } = await import("./tools/catalog.server");
    if (def) await settleDrift(def.connector_id);
    if (status === "approved") {
      const { emitEvent } = await import("./events.server");
      await emitEvent(rev.workspace_id, "tool.approved", {
        tool_id: rev.tool_id,
        revision_id: rev.id,
        risk_class: data.riskClass,
      });
    }
    return { ok: true, status };
  });

export const saveMockReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({ revisionId: z.string().uuid(), reply: z.string().max(16000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: rev } = await db
      .from("tool_revisions")
      .select("id, workspace_id")
      .eq("id", data.revisionId)
      .maybeSingle();
    if (!rev) throw new Error("Tool not found");
    await can(context as Ctx, "tool.test.mock", rev.workspace_id);
    let reply: unknown;
    try {
      reply = JSON.parse(data.reply);
    } catch {
      throw new Error("The sample reply must be valid JSON");
    }
    const { error } = await db
      .from("tool_mocks")
      .upsert(
        {
          workspace_id: rev.workspace_id,
          tool_revision_id: rev.id,
          name: "default",
          reply: reply as never,
        },
        { onConflict: "tool_revision_id,name" },
      );
    if (error) throw new Error("Could not save the sample reply");
    return { ok: true };
  });

export const testToolCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        toolId: z.string().uuid(),
        mode: z.enum(["mock", "sandbox", "live"]),
        input: z.string().max(16000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await can(
      context as Ctx,
      data.mode === "live"
        ? "tool.test.live"
        : data.mode === "sandbox"
          ? "tool.test.sandbox"
          : "tool.test.mock",
      data.workspaceId,
    );
    let args: unknown;
    try {
      args = JSON.parse(data.input || "{}");
    } catch {
      throw new Error("Test input must be valid JSON");
    }
    const { invokeTool } = await import("./tools/gateway.server");
    const r = await invokeTool({
      workspaceId: data.workspaceId,
      toolId: data.toolId,
      context: { kind: "console_test", userId: context.userId, mode: data.mode },
      arguments: args,
    });
    return {
      status: r.status,
      output: r.output ?? null,
      error: r.error ?? null,
      confirmation: r.confirmation ?? null,
      durationMs: r.durationMs,
    };
  });

/** Confirm or deny a frozen action. Only the person whose test created it can decide. */
export const decideAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        pendingActionId: z.string().uuid(),
        decision: z.enum(["confirm", "deny"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: pa } = await db
      .from("tool_pending_actions")
      .select("invocation_id")
      .eq("id", data.pendingActionId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!pa) throw new Error("This confirmation has expired.");
    const { data: inv } = await db
      .from("tool_invocations")
      .select("actor_user_id")
      .eq("id", pa.invocation_id)
      .single();
    if (inv?.actor_user_id !== context.userId)
      throw new Error("Only the person who started this test can confirm it.");
    const { executePendingAction } = await import("./tools/gateway.server");
    const r = await executePendingAction(
      data.workspaceId,
      data.pendingActionId,
      { channel: "console_button", user_id: context.userId, at: new Date().toISOString() },
      data.decision,
    );
    return {
      status: r.status,
      output: r.output ?? null,
      error: r.error ?? null,
      forModel: r.forModel,
      durationMs: r.durationMs,
    };
  });

export const setAgentTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        agentId: z.string().uuid(),
        toolId: z.string().uuid(),
        on: z.boolean(),
        confirmationMode: z.enum(["policy_minimum", "always"]).optional(),
        requirement: z.enum(["required", "optional"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: agent } = await db
      .from("agents")
      .select("id, workspace_id")
      .eq("id", data.agentId)
      .maybeSingle();
    if (!agent) throw new Error("Agent not found");
    await can(context as Ctx, "agent.bind_tools", agent.workspace_id);
    if (!data.on) {
      await db
        .from("agent_tool_bindings")
        .delete()
        .eq("agent_id", agent.id)
        .eq("tool_id", data.toolId);
      return { ok: true };
    }
    const { data: def } = await db
      .from("tool_definitions")
      .select("id, current_revision_id, state")
      .eq("id", data.toolId)
      .eq("workspace_id", agent.workspace_id)
      .maybeSingle();
    if (!def?.current_revision_id || def.state !== "active")
      throw new Error("This tool is not available");
    const { error } = await db.from("agent_tool_bindings").upsert(
      {
        agent_id: agent.id,
        tool_id: def.id,
        workspace_id: agent.workspace_id,
        tool_revision_id: def.current_revision_id,
        enabled: true,
        confirmation_mode: data.confirmationMode ?? "policy_minimum",
        requirement: data.requirement ?? "required",
        created_by: context.userId,
      },
      { onConflict: "agent_id,tool_id" },
    );
    if (error) throw new Error("Could not attach the tool");
    return { ok: true };
  });

/** Problems that block publishing an agent because of its tools. */
export const agentToolProblems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ agentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: agent } = await context.supabase
      .from("agents")
      .select("id, workspace_id")
      .eq("id", data.agentId)
      .maybeSingle();
    if (!agent) throw new Error("Agent not found");
    const { toolProblemsFor } = await import("./tools/readiness.server");
    return toolProblemsFor(agent.workspace_id, agent.id);
  });

export const agentPublishReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ agentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: agent } = await context.supabase
      .from("agents")
      .select("id, workspace_id")
      .eq("id", data.agentId)
      .maybeSingle();
    if (!agent) throw new Error("Agent not found");
    const { data: allowed, error } = await context.supabase.rpc("is_workspace_member", {
      _ws: agent.workspace_id,
    });
    if (error || !allowed) throw new Error("Only workspace members can view agent readiness");
    const { toolProblemsFor, agentPublishReadiness: providerProblemsFor } =
      await import("./tools/readiness.server");
    return {
      blockers: [
        ...(await toolProblemsFor(agent.workspace_id, agent.id)),
        ...(await providerProblemsFor(agent.workspace_id, agent.id)),
      ],
    };
  });

export const publishWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ workflowId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: wf } = await db
      .from("workflows")
      .select("id, workspace_id, steps")
      .eq("id", data.workflowId)
      .maybeSingle();
    if (!wf) throw new Error("Workflow not found");
    await can(context as Ctx, "workflow.publish", wf.workspace_id);
    const { publishWorkflowVersion } = await import("./tools/readiness.server");
    const version = await publishWorkflowVersion(wf.id, context.userId);
    const { error } = await db
      .from("workflows")
      .update({ published_version_id: version.id })
      .eq("id", wf.id)
      .eq("workspace_id", wf.workspace_id);
    if (error) throw new Error("Could not activate workflow version");
    return version;
  });

export const publishAgentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        agentId: z.string().uuid(),
        releaseNote: z.string().max(4000).nullable(),
        draftChecksum: z.string().length(64).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: agent } = await context.supabase
      .from("agents")
      .select("id, workspace_id, name, description, config")
      .eq("id", data.agentId)
      .single();
    if (!agent) throw new Error("Agent not found");
    const { data: allowed } = await context.supabase.rpc("is_workspace_member", {
      _ws: agent.workspace_id,
    });
    if (!allowed) throw new Error("Only workspace members can publish agents");
    const { toolProblemsFor, agentPublishReadiness } = await import("./tools/readiness.server");
    const problems = [
      ...(await toolProblemsFor(agent.workspace_id, agent.id)),
      ...(await agentPublishReadiness(agent.workspace_id, agent.id)),
    ];
    if (problems.length) throw new Error(problems[0]);
    const { agentBindings } = await import("./tools/bindings.server");
    const bindings = await agentBindings(agent.workspace_id, agent.id, null);
    const db = await admin();
    const { data: kbs } = await db
      .from("agent_knowledge_bases")
      .select("knowledge_base_id")
      .eq("agent_id", agent.id)
      .eq("workspace_id", agent.workspace_id);
    const { data: last } = await db
      .from("agent_versions")
      .select("version")
      .eq("agent_id", agent.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { normalizeConfig, checksum, normalizeDraftSnapshot } = await import("./agent-config");
    const currentDraft = normalizeDraftSnapshot({
      name: agent.name,
      description: agent.description,
      cfg: agent.config,
      kbIds: (kbs ?? []).map((k) => k.knowledge_base_id),
      toolIds: (bindings ?? []).map((b) => b.tool_id),
    });
    const currentDraftChecksum = await checksum(currentDraft);
    if (data.draftChecksum && data.draftChecksum !== currentDraftChecksum) {
      throw new Error(
        "Save your latest draft before publishing. The current agent draft changed after the last successful save.",
      );
    }
    const snapshot = {
      ...normalizeConfig(agent.config),
      knowledge_base_ids: [
        ...new Set(
          (kbs ?? [])
            .map((k) => k.knowledge_base_id)
            .filter(Boolean)
            .map(String)
            .sort(),
        ),
      ],
      tool_bindings: bindings,
    };
    const version = (last?.version ?? 0) + 1;
    const { error } = await db
      .from("agent_versions")
      .insert({
        agent_id: agent.id,
        workspace_id: agent.workspace_id,
        version,
        config: snapshot as never,
        checksum: await checksum(snapshot),
        release_note: data.releaseNote,
        published_by: context.userId,
      });
    if (error) throw new Error("Could not publish the saved agent draft");
    return { version };
  });
