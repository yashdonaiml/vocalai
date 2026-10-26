// Tool Gateway (ENG-TOOLS-001 section 7). The single entry point for every external tool call.
// Execution order: resolve -> policy -> drift -> validate -> confirm? -> route by mode -> adapter via egress -> classify -> record.
import { decryptSecret, encryptSecret } from "@/lib/crypto.server";
import { invokeHttp } from "./adapters/http.server";
import { invokeMcp } from "./adapters/mcp.server";
import type { AdapterCredential, AdapterResult, ErrorCode } from "./adapters/types";
import { capOutput, redact, wrapForModel } from "./redact";
import { canonicalJson, sha256Hex, validate, type JsonSchema } from "./schema";

export type InvokeContext =
  | { kind: "voice_session"; sessionId: string; turnId: string; deploymentId: string }
  | { kind: "text_test"; agentId: string; userId: string; mode: "mock" | "sandbox" | "live" }
  | { kind: "workflow"; workflowVersionId: string; runId: string; stepId: string }
  | { kind: "console_test"; userId: string; mode: "mock" | "sandbox" | "live" };

export type InvokeRequest = {
  workspaceId: string; // trusted: from the authenticated caller or signed runtime session
  toolId: string;
  toolRevisionId?: string; // cross-checked only
  context: InvokeContext;
  arguments: unknown;
  invocationKey?: string;
  deadlineAt?: string;
  signal?: AbortSignal | undefined;
  bindingConfirmation?: "none" | "voice" | "voice_readback";
};

export type InvokeResult = {
  invocationId: string;
  status:
    | "pending_confirmation"
    | "running"
    | "succeeded"
    | "failed"
    | "outcome_unknown"
    | "cancelled"
    | "expired"
    | "blocked";
  output?: unknown;
  forModel: string;
  confirmation?: { id: string; summary: string; expiresAt: string; language?: string };
  error?: { code: ErrorCode; retryable: boolean; safeMessage: string; traceId: string };
  durationMs: number;
};

const CONFIRM_RANK = { none: 0, voice: 1, voice_readback: 2, blocked: 3 } as const;
const MIN_BY_CLASS: Record<string, keyof typeof CONFIRM_RANK> = {
  read: "none",
  write: "voice",
  sensitive: "voice",
  destructive: "voice_readback",
  restricted: "blocked",
};
const OUTPUT_BUDGET = {
  voice_session: 2048,
  text_test: 16384,
  console_test: 16384,
  workflow: 16384,
} as const;
const SAFE_MESSAGES: Record<ErrorCode, string> = {
  EGRESS_DENIED: "That destination is not allowed.",
  AUTH_INVALID: "The saved credentials were rejected. Update them on the Tools page.",
  AUTH_FORBIDDEN: "The credentials work but do not have permission for this action.",
  PROTOCOL_UNSUPPORTED: "This server uses a version we do not support yet.",
  CONTRACT_DRIFT: "The tool changed since it was approved. Review it on the Tools page.",
  TOOL_UNAVAILABLE: "This tool is not available right now.",
  CONNECTOR_REVOKED: "This connection was removed.",
  CONNECTOR_PAUSED: "This connection is paused.",
  CONFIRM_REQUIRED: "This action needs confirmation first.",
  CONFIRM_INVALID: "The confirmation is no longer valid.",
  TIMEOUT: "The tool took too long to reply.",
  OUTCOME_UNKNOWN: "The request may have gone through, but I couldn't confirm the result.",
  SCHEMA_INVALID: "Some details were missing or not in the right format.",
  RATE_LIMITED: "Too many requests. Try again shortly.",
  POLICY_DENIED: "This action is not allowed by your workspace rules.",
  RESTRICTED: "This kind of action is turned off.",
  REMOTE_ERROR: "The tool returned an error.",
  RESPONSE_INVALID: "The tool's reply could not be read.",
};
const RETRYABLE = new Set<ErrorCode>(["TIMEOUT", "RATE_LIMITED", "REMOTE_ERROR"]);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function modeOf(ctx: InvokeContext): "mock" | "sandbox" | "live" {
  return ctx.kind === "text_test" || ctx.kind === "console_test" ? ctx.mode : "live";
}
function contextKey(ctx: InvokeContext): string {
  switch (ctx.kind) {
    case "voice_session":
      return `${ctx.sessionId}:${ctx.turnId}`;
    case "workflow":
      return `${ctx.runId}:${ctx.stepId}`;
    case "text_test":
      return `${ctx.agentId}:${ctx.userId}`;
    case "console_test":
      return ctx.userId;
  }
}

type Resolved = Awaited<ReturnType<typeof resolve>>;

async function resolve(workspaceId: string, toolId: string) {
  const db = await admin();
  const { data: tool } = await db
    .from("tool_definitions")
    .select("id, workspace_id, connector_id, stable_slug, state, current_revision_id")
    .eq("id", toolId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!tool || !tool.current_revision_id) return null;
  const [{ data: rev }, { data: connector }, { data: approval }, { data: policy }] =
    await Promise.all([
      db
        .from("tool_revisions")
        .select("*")
        .eq("id", tool.current_revision_id)
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      db
        .from("tool_connectors")
        .select("*")
        .eq("id", tool.connector_id)
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      db
        .from("tool_approvals")
        .select("*")
        .eq("tool_revision_id", tool.current_revision_id)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("tool_policies")
        .select("*")
        .eq("tool_id", toolId)
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    ]);
  if (!rev || !connector) return null;
  return { tool, rev, connector, approval, policy };
}

type Decision = {
  decision: "allow" | "deny" | "confirm";
  reasons: string[];
  code?: ErrorCode;
  required: keyof typeof CONFIRM_RANK;
  risk: string;
};

function evaluate(
  r: NonNullable<Resolved>,
  ctx: InvokeContext,
  bindingMin?: keyof typeof CONFIRM_RANK,
  preview = false,
): Decision {
  const risk = r.approval?.risk_class ?? "restricted";
  const deny = (code: ErrorCode, reason: string): Decision => ({
    decision: "deny",
    reasons: [reason],
    code,
    required: "blocked",
    risk,
  });
  // precedence (spec 6): connector state, approved revision, scope, caller/confirmation
  if (r.connector.archived_at || r.connector.health === "revoked")
    return deny("CONNECTOR_REVOKED", "connector_revoked");
  if (!r.connector.admin_enabled) return deny("CONNECTOR_PAUSED", "connector_paused");
  if (r.tool.state !== "active") return deny("TOOL_UNAVAILABLE", `tool_${r.tool.state}`);
  const mode = modeOf(ctx);
  if (mode !== "mock") {
    if (!r.approval || r.approval.status !== "approved")
      return deny("POLICY_DENIED", "revision_not_approved");
    if (
      r.connector.health === "schema_drift" &&
      (risk !== "read" || r.approval.drift_read_policy === "block")
    )
      return deny("CONTRACT_DRIFT", "schema_drift");
    const allowed = (r.approval.allowed_contexts as string[] | null) ?? [];
    if (
      preview ? !allowed.includes("setup_preview") : allowed.length && !allowed.includes(ctx.kind)
    )
      return deny("POLICY_DENIED", "context_not_allowed");
  }
  if (risk === "restricted") return deny("RESTRICTED", "restricted_class");
  let required = MIN_BY_CLASS[risk] ?? "blocked";
  const approvalMin = (r.approval?.confirmation_minimum ?? "none") as keyof typeof CONFIRM_RANK;
  if (CONFIRM_RANK[approvalMin] > CONFIRM_RANK[required]) required = approvalMin;
  if (bindingMin && CONFIRM_RANK[bindingMin] > CONFIRM_RANK[required]) required = bindingMin;
  if (required === "blocked") return deny("RESTRICTED", "blocked_by_minimum");
  if (mode === "mock" || required === "none")
    return { decision: "allow", reasons: [], required, risk };
  if (ctx.kind === "workflow")
    return {
      decision: "deny",
      reasons: ["workflow_confirmation_required"],
      code: "CONFIRM_REQUIRED",
      required,
      risk,
    };
  return { decision: "confirm", reasons: ["confirmation_required"], required, risk };
}

function summarize(name: string, args: Record<string, unknown>, readback: boolean): string {
  if (name === "Save callback request") {
    const prompts: Record<string, string> = {
      en: "Save this callback request? Say yes or no.",
      es: "¿Guardo esta solicitud de devolución de llamada? Diga sí o no.",
      fr: "Enregistrer cette demande de rappel ? Dites oui ou non.",
      de: "Diese Rückrufanfrage speichern? Sagen Sie ja oder nein.",
      hi: "क्या यह कॉलबैक अनुरोध सहेज दूँ? हाँ या नहीं कहें।",
      ru: "Сохранить эту заявку на обратный звонок? Скажите да или нет.",
      pt: "Salvar este pedido de retorno? Diga sim ou não.",
      ja: "この折り返し電話の依頼を保存しますか。はい、または、いいえと答えてください。",
      it: "Salvare questa richiesta di richiamata? Dica sì o no.",
      nl: "Dit terugbelverzoek opslaan? Zeg ja of nee.",
    };
    prompts["te"] = "ఈ callback request save చేయమంటారా? అవును లేదా వద్దు అని చెప్పండి.";
    return `${String(args["name"])}. ${String(args["phone"])}. ${String(args["reason"])}. ${String(args["preferred_time"] ?? "")}. ${prompts[String(args["language"])] ?? prompts["en"]}`;
  }
  const fields = Object.entries(args)
    .slice(0, 6)
    .map(
      ([k, v]) =>
        `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`,
    );
  const base = `I'm about to ${name.toLowerCase()}`;
  if (!fields.length) return `${base}. Should I go ahead?`;
  return readback
    ? `${base} with ${fields.join(", ")}. Please confirm each detail. Should I go ahead?`
    : `${base} (${fields.join(", ")}). Should I go ahead?`;
}

async function loadCredential(
  workspaceId: string,
  connectorId: string,
  origin: string,
): Promise<AdapterCredential> {
  const db = await admin();
  const { data } = await db
    .from("tool_credentials")
    .select("auth_kind, header_name, ciphertext, origin")
    .eq("connector_id", connectorId)
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  if (data.origin !== origin)
    throw Object.assign(new Error("credential origin mismatch"), {
      code: "EGRESS_DENIED" as ErrorCode,
    });
  return {
    kind: data.auth_kind as "bearer",
    headerName: data.header_name,
    secret: await decryptSecret(data.ciphertext),
  };
}

function blockedResult(
  invocationId: string,
  started: number,
  code: ErrorCode,
  alias: string,
  traceId: string,
): InvokeResult {
  return {
    invocationId,
    status: "blocked",
    forModel: wrapForModel(alias, { error: SAFE_MESSAGES[code] }),
    error: { code, retryable: false, safeMessage: SAFE_MESSAGES[code], traceId },
    durationMs: Date.now() - started,
  };
}

export async function invokeTool(req: InvokeRequest): Promise<InvokeResult> {
  const started = Date.now();
  const traceId = crypto.randomUUID();
  const db = await admin();
  let isSetupPreview = false;
  if (req.context.kind === "voice_session") {
    const { sessionBinding } = await import("./bindings.server");
    const { data: def } = await db
      .from("tool_definitions")
      .select("stable_slug")
      .eq("id", req.toolId)
      .eq("workspace_id", req.workspaceId)
      .single();
    if (!def) return blockedResult("", started, "POLICY_DENIED", "unknown", traceId);
    const { session, binding, preview } = await sessionBinding(
      req.context.sessionId,
      def.stable_slug,
    );
    isSetupPreview = Boolean(preview);
    if (
      session.workspace_id !== req.workspaceId ||
      (session.deployment_id ?? "") !== req.context.deploymentId ||
      binding.tool_id !== req.toolId ||
      binding.tool_revision_id !== req.toolRevisionId
    )
      return blockedResult("", started, "POLICY_DENIED", def.stable_slug, traceId);
    req.bindingConfirmation = binding.confirmation_mode === "always" ? "voice" : "none";
  } else if (req.context.kind === "workflow") {
    const { data: pin } = await db
      .from("workflow_tool_bindings")
      .select("tool_revision_id")
      .eq("workflow_version_id", req.context.workflowVersionId)
      .eq("step_id", req.context.stepId)
      .eq("workspace_id", req.workspaceId)
      .single();
    const { data: run } = await db
      .from("workflow_runs")
      .select("workflow_id, status, workflow_version_id")
      .eq("id", req.context.runId)
      .eq("workspace_id", req.workspaceId)
      .single();
    const { data: version } = await db
      .from("workflow_versions")
      .select("workflow_id")
      .eq("id", req.context.workflowVersionId)
      .eq("workspace_id", req.workspaceId)
      .single();
    if (
      !pin ||
      pin.tool_revision_id !== req.toolRevisionId ||
      !run ||
      run.status !== "running" ||
      run.workflow_id !== version?.workflow_id ||
      run.workflow_version_id !== req.context.workflowVersionId
    )
      return blockedResult("", started, "POLICY_DENIED", "workflow", traceId);
  }
  const r = await resolve(req.workspaceId, req.toolId);
  const { data: ws } = await db
    .from("workspaces")
    .select("org_id")
    .eq("id", req.workspaceId)
    .maybeSingle();
  if (!r || !ws) return blockedResult("", started, "TOOL_UNAVAILABLE", "unknown", traceId);
  if (req.toolRevisionId && req.toolRevisionId !== r.rev.id)
    return blockedResult("", started, "CONTRACT_DRIFT", r.tool.stable_slug, traceId);

  const mode = modeOf(req.context);
  if (req.context.kind === "voice_session") {
    // Any new tool request supersedes an unconfirmed action in this call.
    await db
      .from("tool_pending_actions")
      .update({ status: "invalidated" })
      .eq("workspace_id", req.workspaceId)
      .eq("session_id", req.context.sessionId)
      .eq("status", "pending");
  }
  const args = (req.arguments && typeof req.arguments === "object" ? req.arguments : {}) as Record<
    string,
    unknown
  >;
  const canonical = canonicalJson(args);
  const inputHash = await sha256Hex(canonical);
  const ctx = req.context;

  const { data: inv, error: invErr } = await db
    .from("tool_invocations")
    .insert({
      org_id: ws.org_id,
      workspace_id: req.workspaceId,
      context_kind: ctx.kind,
      context_key: contextKey(ctx),
      invocation_key: req.invocationKey ?? crypto.randomUUID(),
      mode,
      status: "running",
      trace_id: traceId,
      tool_id: r.tool.id,
      tool_revision_id: r.rev.id,
      connector_id: r.connector.id,
      input_hash: inputHash,
      input_redacted: r.connector.type === "native" ? { withheld: true } : (redact(args) as never),
      agent_id: ctx.kind === "text_test" ? ctx.agentId : null,
      actor_user_id: ctx.kind === "text_test" || ctx.kind === "console_test" ? ctx.userId : null,
      deployment_id: ctx.kind === "voice_session" ? ctx.deploymentId || null : null,
      session_id: ctx.kind === "voice_session" ? ctx.sessionId : null,
      turn_id: ctx.kind === "voice_session" ? ctx.turnId : null,
      workflow_version_id: ctx.kind === "workflow" ? ctx.workflowVersionId : null,
      workflow_run_id: ctx.kind === "workflow" ? ctx.runId : null,
      workflow_step_id: ctx.kind === "workflow" ? ctx.stepId : null,
    })
    .select("id")
    .single();
  if (invErr || !inv) throw new Error("Could not record the tool call");

  const finish = async (status: InvokeResult["status"], code?: ErrorCode, output?: unknown) => {
    await db
      .from("tool_invocations")
      .update({
        status,
        error_code: code ?? null,
        output_redacted: (output === undefined ? null : output) as never,
        ended_at: new Date().toISOString(),
        latency_ms: Date.now() - started,
      })
      .eq("id", inv.id);
  };

  const decision = evaluate(r, ctx, req.bindingConfirmation, isSetupPreview);
  if (decision.risk !== "read" || decision.decision === "deny") {
    await db.from("tool_policy_decisions").insert({
      workspace_id: req.workspaceId,
      invocation_id: inv.id,
      stage: "request",
      policy_revision: r.policy?.revision ?? r.approval?.policy_revision ?? 0,
      decision: decision.decision,
      reason_codes: decision.reasons,
      risk_class: decision.risk,
      required_confirmation: decision.required,
    });
  }
  if (decision.decision === "deny") {
    await finish("blocked", decision.code);
    return blockedResult(
      inv.id,
      started,
      decision.code ?? "POLICY_DENIED",
      r.tool.stable_slug,
      traceId,
    );
  }

  const errors = validate(r.rev.input_schema as JsonSchema, args);
  if (new TextEncoder().encode(canonical).length > 32768)
    errors.push("Tool arguments exceed 32 KiB");
  if (errors.length) {
    await finish("failed", "SCHEMA_INVALID");
    return {
      invocationId: inv.id,
      status: "failed",
      forModel: wrapForModel(r.tool.stable_slug, {
        error: SAFE_MESSAGES.SCHEMA_INVALID,
        details: errors.slice(0, 5),
      }),
      error: {
        code: "SCHEMA_INVALID",
        retryable: false,
        safeMessage: `${SAFE_MESSAGES.SCHEMA_INVALID} ${errors.slice(0, 3).join("; ")}`,
        traceId,
      },
      durationMs: Date.now() - started,
    };
  }

  if (decision.decision === "confirm") {
    // Invalidate any earlier pending action in the same session/context before freezing a new one.
    const sessionKey = ctx.kind === "voice_session" ? ctx.sessionId : contextKey(ctx);
    await db
      .from("tool_pending_actions")
      .update({ status: "invalidated" })
      .eq("workspace_id", req.workspaceId)
      .eq("session_id", sessionKey)
      .eq("status", "pending");
    const expiresAt = new Date(
      Date.now() + 60_000 * (ctx.kind === "voice_session" ? 1 : 10),
    ).toISOString();
    const summary = summarize(r.rev.display_name, args, decision.required === "voice_readback");
    const { data: pa } = await db
      .from("tool_pending_actions")
      .insert({
        workspace_id: req.workspaceId,
        invocation_id: inv.id,
        session_id: sessionKey,
        turn_id: ctx.kind === "voice_session" ? ctx.turnId : null,
        tool_revision_id: r.rev.id,
        frozen_arguments: await encryptSecret(canonical),
        args_digest: inputHash,
        policy_revision: r.policy?.revision ?? r.approval?.policy_revision ?? 0,
        summary:
          r.connector.type === "native"
            ? "Encrypted enquiry details; readback provided to caller."
            : summary,
        status: "pending",
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    await db
      .from("tool_policy_decisions")
      .update({ pending_action_id: pa?.id ?? null })
      .eq("invocation_id", inv.id)
      .eq("stage", "request");
    await finish("pending_confirmation");
    return {
      invocationId: inv.id,
      status: "pending_confirmation",
      forModel: wrapForModel(r.tool.stable_slug, { status: "awaiting_caller_confirmation" }),
      confirmation: {
        id: pa!.id,
        summary,
        expiresAt,
        ...(r.connector.type === "native" &&
        ["save_callback", "append_google_sheet"].includes(
          String((r.rev.adapter_mapping as Record<string, unknown>)["operation"]),
        )
          ? { language: String(args["language"]) }
          : {}),
      },
      durationMs: Date.now() - started,
    };
  }

  return runAdapter({
    r,
    invocationId: inv.id,
    args,
    mode,
    ctxKind: ctx.kind,
    ...(ctx.kind === "voice_session" ? { sessionId: ctx.sessionId } : {}),
    ...(ctx.kind === "workflow" ? { workflowRunId: ctx.runId } : {}),
    started,
    traceId,
    signal: req.signal,
    finish,
    workspaceId: req.workspaceId,
    idempotencyKey: inputHash,
    isSetupPreview,
  });
}

async function emitSuccessfulActionEvent(
  p: {
    mode: "mock" | "sandbox" | "live";
    ctxKind: InvokeContext["kind"];
    sessionId?: string;
    workflowRunId?: string;
    workspaceId: string;
    invocationId: string;
  },
  toolId: string,
  toolName: string,
) {
  if (p.mode !== "live" || (p.ctxKind !== "voice_session" && p.ctxKind !== "workflow")) return;
  if (p.ctxKind === "voice_session") {
    const db = await admin();
    const { data: call } = await db
      .from("conversations")
      .select("channel, deployment_id")
      .eq("workspace_id", p.workspaceId)
      .eq("session_ref", p.sessionId ?? "")
      .maybeSingle();
    if (!call || call.channel !== "pstn" || !call.deployment_id) return;
  }
  if (p.ctxKind === "workflow") {
    const db = await admin();
    const { data: run } = await db
      .from("workflow_runs")
      .select("source")
      .eq("id", p.workflowRunId ?? "")
      .eq("workspace_id", p.workspaceId)
      .maybeSingle();
    if (run?.source !== "live") return;
  }
  try {
    const { emitEvent } = await import("../events.server");
    await emitEvent(
      p.workspaceId,
      "tool.succeeded",
      {
        invocation_id: p.invocationId,
        tool_id: toolId,
        tool_name: toolName,
        context: p.ctxKind,
      },
      { background: true },
    );
  } catch {
    // The tool action remains successful even if notification enqueueing is unavailable.
    console.error("Could not queue successful tool notification", { invocationId: p.invocationId });
  }
}

async function runAdapter(p: {
  r: NonNullable<Resolved>;
  invocationId: string;
  args: Record<string, unknown>;
  mode: "mock" | "sandbox" | "live";
  ctxKind: InvokeContext["kind"];
  sessionId?: string;
  workflowRunId?: string;
  started: number;
  traceId: string;
  signal?: AbortSignal | undefined;
  workspaceId: string;
  idempotencyKey: string;
  isSetupPreview: boolean;
  finish: (s: InvokeResult["status"], c?: ErrorCode, o?: unknown) => Promise<void>;
}): Promise<InvokeResult> {
  const db = await admin();
  const alias = p.r.tool.stable_slug;
  const budget = Math.min(OUTPUT_BUDGET[p.ctxKind], p.r.policy?.max_output_bytes ?? Infinity);
  let connector = p.r.connector;

  if (p.mode === "mock") {
    const { data: mock } = await db
      .from("tool_mocks")
      .select("reply")
      .eq("tool_revision_id", p.r.rev.id)
      .eq("workspace_id", p.workspaceId)
      .limit(1)
      .maybeSingle();
    const out = capOutput(redact(mock?.reply ?? { ok: true, mock: true }), budget).value;
    await p.finish("succeeded", undefined, out);
    return {
      invocationId: p.invocationId,
      status: "succeeded",
      output: out,
      forModel: wrapForModel(alias, out),
      durationMs: Date.now() - p.started,
    };
  }
  if (p.mode === "sandbox") {
    const { data: sb } = await db
      .from("tool_connectors")
      .select("*")
      .eq("sandbox_of", connector.id)
      .eq("workspace_id", p.workspaceId)
      .is("archived_at", null)
      .maybeSingle();
    if (!sb) {
      await p.finish("blocked", "POLICY_DENIED");
      return blockedResult(p.invocationId, p.started, "POLICY_DENIED", alias, p.traceId);
    }
    connector = sb;
  }

  if (connector.type === "native") {
    const operation = (p.r.rev.adapter_mapping as Record<string, unknown>)["operation"];
    if (operation === "append_google_sheet" && p.ctxKind === "voice_session" && p.mode === "live") {
      const at = new Date().toISOString();
      const { invokeGoogleSheetsAdapter } = await import("../google-sheets.server");
      const result = await invokeGoogleSheetsAdapter({
        workspaceId: p.workspaceId,
        invocationId: p.invocationId,
        args: p.args,
        configuration: p.r.rev.adapter_mapping as Record<string, unknown>,
        isSetupPreview: p.isSetupPreview,
        ...(p.signal ? { signal: p.signal } : {}),
      });
      await db.from("tool_attempts").insert({
        workspace_id: p.workspaceId,
        invocation_id: p.invocationId,
        attempt_no: 1,
        destination_host: result.host,
        status_code: result.statusCode ?? null,
        error_class: result.ok ? null : result.code,
        retry_decision: "stop",
        started_at: at,
        ended_at: new Date().toISOString(),
      });
      await db
        .from("tool_connectors")
        .update({
          health: result.ok
            ? "healthy"
            : result.code === "AUTH_INVALID"
              ? "auth_invalid"
              : result.code === "AUTH_FORBIDDEN"
                ? "auth_forbidden"
                : connector.health,
          last_checked_at: new Date().toISOString(),
          ...(result.ok
            ? {
                last_success_at: new Date().toISOString(),
                consecutive_failures: 0,
                error_code: null,
              }
            : {
                consecutive_failures: (connector.consecutive_failures ?? 0) + 1,
                error_code: result.code,
              }),
        })
        .eq("id", connector.id);
      if (!result.ok) {
        const code: ErrorCode =
          result.sent && (result.code === "TIMEOUT" || result.code === "OUTCOME_UNKNOWN")
            ? "OUTCOME_UNKNOWN"
            : result.code;
        const status = code === "OUTCOME_UNKNOWN" ? "outcome_unknown" : "failed";
        await p.finish(status, code);
        return {
          invocationId: p.invocationId,
          status,
          forModel: wrapForModel(alias, { error: SAFE_MESSAGES[code] }),
          error: { code, retryable: false, safeMessage: SAFE_MESSAGES[code], traceId: p.traceId },
          durationMs: Date.now() - p.started,
        };
      }
      const out = capOutput(redact(result.output), budget).value;
      await p.finish("succeeded", undefined, out);
      await emitSuccessfulActionEvent(p, p.r.tool.id, alias);
      return {
        invocationId: p.invocationId,
        status: "succeeded",
        output: out,
        forModel: wrapForModel(alias, out),
        durationMs: Date.now() - p.started,
      };
    }
    if (operation !== "save_callback" || p.ctxKind !== "voice_session" || p.mode !== "live") {
      await p.finish("blocked", "POLICY_DENIED");
      return blockedResult(p.invocationId, p.started, "POLICY_DENIED", alias, p.traceId);
    }
    try {
      const { saveCallback } = await import("../callbacks.server");
      const output = await saveCallback(p.workspaceId, p.invocationId, p.args);
      await p.finish("succeeded", undefined, output);
      await emitSuccessfulActionEvent(p, p.r.tool.id, alias);
      return {
        invocationId: p.invocationId,
        status: "succeeded",
        output,
        forModel: wrapForModel(alias, output),
        durationMs: Date.now() - p.started,
      };
    } catch {
      await p.finish("failed", "REMOTE_ERROR");
      return blockedResult(p.invocationId, p.started, "REMOTE_ERROR", alias, p.traceId);
    }
  }

  let credential: AdapterCredential = null;
  try {
    credential = await loadCredential(p.workspaceId, connector.id, connector.canonical_origin);
  } catch {
    await p.finish("blocked", "EGRESS_DENIED");
    return blockedResult(p.invocationId, p.started, "EGRESS_DENIED", alias, p.traceId);
  }

  const timeoutMs = Math.min(p.r.policy?.timeout_ms ?? 8000, 15000);
  const adapterReq = {
    origin: connector.canonical_origin,
    endpointPath: connector.endpoint_path,
    mapping: (p.r.rev.adapter_mapping ?? {}) as Record<string, unknown>,
    args: p.args,
    credential,
    timeoutMs,
    maxBytes: 1_000_000,
    signal: p.signal,
    idempotencyKey:
      p.r.approval?.idempotency_mode === "destination_supported" ? p.idempotencyKey : undefined,
  };
  const call = (): Promise<AdapterResult> =>
    connector.type === "mcp"
      ? invokeMcp(adapterReq)
      : invokeHttp(adapterReq, {
          form: connector.type === "webhook" && adapterReq.mapping["form"] === true,
        });

  let result: AdapterResult | null = null;
  const maxAttempts = p.r.approval?.safe_to_retry ? 2 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const at = new Date().toISOString();
    result = await call();
    const retry =
      !result.ok &&
      attempt < maxAttempts &&
      (result.code === "RATE_LIMITED" || result.code === "REMOTE_ERROR");
    await db.from("tool_attempts").insert({
      workspace_id: p.workspaceId,
      invocation_id: p.invocationId,
      attempt_no: attempt,
      destination_host: result.host,
      status_code: result.statusCode ?? null,
      error_class: result.ok ? null : result.code,
      retry_decision: retry ? "retry" : "stop",
      started_at: at,
      ended_at: new Date().toISOString(),
    });
    if (!retry) break;
    await new Promise((res) => setTimeout(res, 200 + Math.random() * 400));
  }

  // health counters
  const healthy = result!.ok;
  const health = healthy
    ? "healthy"
    : result!.ok === false && result!.code === "AUTH_INVALID"
      ? "auth_invalid"
      : result!.ok === false && result!.code === "AUTH_FORBIDDEN"
        ? "auth_forbidden"
        : connector.health;
  await db
    .from("tool_connectors")
    .update({
      health,
      last_checked_at: new Date().toISOString(),
      ...(healthy
        ? { last_success_at: new Date().toISOString(), consecutive_failures: 0, error_code: null }
        : {
            consecutive_failures: (connector.consecutive_failures ?? 0) + 1,
            error_code: result!.ok ? null : result!.code,
          }),
    })
    .eq("id", connector.id);

  if (!result!.ok) {
    const r = result as Extract<AdapterResult, { ok: false }>;
    const writeLike = (p.r.approval?.risk_class ?? "write") !== "read";
    const code: ErrorCode =
      writeLike && r.sent && (r.code === "TIMEOUT" || r.code === "OUTCOME_UNKNOWN")
        ? "OUTCOME_UNKNOWN"
        : r.code;
    const status = code === "OUTCOME_UNKNOWN" ? "outcome_unknown" : "failed";
    await p.finish(status, code);
    return {
      invocationId: p.invocationId,
      status,
      forModel: wrapForModel(alias, { error: SAFE_MESSAGES[code] }),
      error: {
        code,
        retryable: RETRYABLE.has(code) && !writeLike,
        safeMessage: SAFE_MESSAGES[code],
        traceId: p.traceId,
      },
      durationMs: Date.now() - p.started,
    };
  }
  const out = capOutput(redact(result!.output), budget).value;
  await p.finish("succeeded", undefined, out);
  await emitSuccessfulActionEvent(p, p.r.tool.id, alias);
  return {
    invocationId: p.invocationId,
    status: "succeeded",
    output: out,
    forModel: wrapForModel(alias, out),
    durationMs: Date.now() - p.started,
  };
}

/** Confirmed actions run here, never through invokeTool (spec 8). Runs each action exactly once. */
export async function executePendingAction(
  workspaceId: string,
  pendingActionId: string,
  evidence: Record<string, unknown>,
  decision: "confirm" | "deny",
): Promise<InvokeResult> {
  const started = Date.now();
  const traceId = crypto.randomUUID();
  const db = await admin();
  const { data: pa } = await db
    .from("tool_pending_actions")
    .select("*")
    .eq("id", pendingActionId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!pa) return blockedResult("", started, "CONFIRM_INVALID", "unknown", traceId);
  const { data: inv } = await db
    .from("tool_invocations")
    .select("*")
    .eq("id", pa.invocation_id)
    .eq("workspace_id", workspaceId)
    .single();
  const alias = "tool";
  const record = (
    d: "allow" | "deny" | "confirm",
    stage: "confirmation" | "pre_execute",
    reasons: string[],
  ) =>
    db.from("tool_policy_decisions").insert({
      workspace_id: workspaceId,
      invocation_id: pa.invocation_id,
      stage,
      policy_revision: pa.policy_revision,
      decision: d,
      reason_codes: reasons,
      pending_action_id: pa.id,
    });

  if (pa.status !== "pending")
    return blockedResult(pa.invocation_id, started, "CONFIRM_INVALID", alias, traceId);
  if (new Date(pa.expires_at).getTime() < Date.now()) {
    const { data: expired } = await db
      .from("tool_pending_actions")
      .update({ status: "expired" })
      .eq("id", pa.id)
      .eq("status", "pending")
      .select("id");
    if (!expired?.length)
      return blockedResult(pa.invocation_id, started, "CONFIRM_INVALID", alias, traceId);
    await db
      .from("tool_invocations")
      .update({ status: "expired", ended_at: new Date().toISOString() })
      .eq("id", pa.invocation_id);
    return {
      ...blockedResult(pa.invocation_id, started, "CONFIRM_INVALID", alias, traceId),
      status: "expired",
    };
  }
  if (decision === "deny") {
    const { data: denied } = await db
      .from("tool_pending_actions")
      .update({ status: "denied", evidence: evidence as never })
      .eq("id", pa.id)
      .eq("status", "pending")
      .select("id");
    if (!denied?.length)
      return blockedResult(pa.invocation_id, started, "CONFIRM_INVALID", alias, traceId);
    await record("deny", "confirmation", ["caller_denied"]);
    await db
      .from("tool_invocations")
      .update({ status: "cancelled", ended_at: new Date().toISOString() })
      .eq("id", pa.invocation_id);
    return {
      invocationId: pa.invocation_id,
      status: "cancelled",
      forModel: wrapForModel(alias, { status: "caller_declined" }),
      durationMs: Date.now() - started,
    };
  }
  await record("allow", "confirmation", ["confirmed"]);

  const r = inv ? await resolve(workspaceId, inv.tool_id!) : null;
  const reasons: string[] = [];
  let isSetupPreview = false;
  let args: Record<string, unknown> = {};
  try {
    const canonical = await decryptSecret(pa.frozen_arguments);
    if ((await sha256Hex(canonical)) !== pa.args_digest) reasons.push("arguments_changed");
    args = JSON.parse(canonical);
  } catch {
    reasons.push("arguments_invalid");
  }
  if (!r) reasons.push("tool_missing");
  else {
    if (r.rev.id !== pa.tool_revision_id) reasons.push("revision_changed");
    if ((r.policy?.revision ?? r.approval?.policy_revision ?? 0) !== pa.policy_revision)
      reasons.push("policy_changed");
    if (!r.connector.admin_enabled || r.connector.archived_at)
      reasons.push("connector_unavailable");
    if (r.approval?.status !== "approved") reasons.push("revision_not_approved");
    const context =
      inv?.context_kind === "voice_session"
        ? {
            kind: "voice_session" as const,
            sessionId: inv.session_id!,
            turnId: inv.turn_id!,
            deploymentId: inv.deployment_id!,
          }
        : {
            kind: "console_test" as const,
            userId: inv?.actor_user_id ?? "",
            mode: (inv?.mode ?? "live") as "mock" | "sandbox" | "live",
          };
    if (inv?.context_kind === "voice_session") {
      try {
        const { sessionBinding } = await import("./bindings.server");
        const { session, binding, preview } = await sessionBinding(
          inv.session_id!,
          r.tool.stable_slug,
        );
        isSetupPreview = Boolean(preview);
        if (
          session.workspace_id !== workspaceId ||
          session.deployment_id !== inv.deployment_id ||
          binding.tool_revision_id !== pa.tool_revision_id
        )
          reasons.push("session_changed");
      } catch {
        reasons.push("session_unavailable");
      }
    }
    if (evaluate(r, context, undefined, isSetupPreview).decision === "deny")
      reasons.push("policy_denied");
  }
  if (reasons.length) {
    await record("deny", "pre_execute", reasons);
    const { data: invalidated } = await db
      .from("tool_pending_actions")
      .update({ status: "invalidated" })
      .eq("id", pa.id)
      .eq("status", "pending")
      .select("id");
    if (!invalidated?.length)
      return blockedResult(pa.invocation_id, started, "CONFIRM_INVALID", alias, traceId);
    await db
      .from("tool_invocations")
      .update({
        status: "blocked",
        error_code: "CONFIRM_INVALID",
        ended_at: new Date().toISOString(),
      })
      .eq("id", pa.invocation_id);
    return blockedResult(pa.invocation_id, started, "CONFIRM_INVALID", alias, traceId);
  }
  // atomic pending -> executing
  const { data: claimed } = await db
    .from("tool_pending_actions")
    .update({ status: "executing", evidence: evidence as never })
    .eq("id", pa.id)
    .eq("status", "pending")
    .select("id");
  if (!claimed?.length)
    return blockedResult(pa.invocation_id, started, "CONFIRM_INVALID", alias, traceId);
  await record("allow", "pre_execute", []);
  await db.from("tool_invocations").update({ status: "running" }).eq("id", pa.invocation_id);

  const finish = async (status: InvokeResult["status"], code?: ErrorCode, output?: unknown) => {
    await db
      .from("tool_invocations")
      .update({
        status,
        error_code: code ?? null,
        output_redacted: (output === undefined ? null : output) as never,
        ended_at: new Date().toISOString(),
        latency_ms: Date.now() - started,
      })
      .eq("id", pa.invocation_id);
  };
  const res = await runAdapter({
    r: r!,
    invocationId: pa.invocation_id,
    args,
    mode: inv!.mode as "live",
    ctxKind: inv!.context_kind as InvokeContext["kind"],
    ...(inv?.session_id ? { sessionId: inv.session_id } : {}),
    ...(inv?.workflow_run_id ? { workflowRunId: inv.workflow_run_id } : {}),
    started,
    traceId,
    finish,
    workspaceId,
    idempotencyKey: pa.args_digest,
    isSetupPreview,
  });
  await db
    .from("tool_pending_actions")
    .update({ status: "executed", executed_at: new Date().toISOString() })
    .eq("id", pa.id);
  return res;
}
