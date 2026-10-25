// Deployment compiler: agent config + tools + knowledge refs -> immutable runtime bundle.
// The bundle is aviroh's contract with the Runtime Service; it contains no secrets.
import { checksum, effectiveInstructions, normalizeConfig } from "../agent-config";
import { callLimits, evaluateEnquiryCapabilities, RUNTIME_CAPABILITY_VERSION, supportsExactReadback } from "./capabilities";

export const BUNDLE_SCHEMA = "aviroh.bundle/v2";

export async function compileBundle(opts: {
  workspaceId: string;
  agentId: string;
  agentVersion: number | null;
  environmentId: string | null;
  userId: string;
  purpose?: "setup_preview";
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let rawConfig: unknown;
  if (opts.agentVersion != null) {
    const { data } = await supabaseAdmin.from("agent_versions").select("config").eq("agent_id", opts.agentId).eq("workspace_id", opts.workspaceId).eq("version", opts.agentVersion).single();
    rawConfig = data?.config;
  } else {
    const { data } = await supabaseAdmin.from("agents").select("config").eq("id", opts.agentId).eq("workspace_id", opts.workspaceId).single();
    rawConfig = data?.config;
  }
  if (!rawConfig) throw new Error("Agent configuration not found");
  const config = normalizeConfig(rawConfig);
  if (opts.purpose === "setup_preview") {
    if (opts.agentVersion !== null || opts.environmentId !== null) throw new Error("Setup previews must use an unpublished draft.");
    const capability = evaluateEnquiryCapabilities(config);
    if (!capability.supported) throw new Error(capability.reasons[0] ?? "This voice configuration cannot run the enquiry preview.");
  }
  if (config.speechStyle === "te-en" && (config.runtime.mode !== "composable" || config.runtime.stt.provider !== "deepgram" || config.runtime.stt.model !== "nova-3" || config.runtime.stt.language !== "multi" || config.runtime.tts.provider !== "cartesia" || !config.runtime.tts.model.startsWith("sonic-3.6") || config.runtime.tts.language !== "te")) {
    throw new Error("For Telugu-English, select the separate pipeline with Nova-3 multilingual and Sonic 3.6 Telugu speech, or reset the speaking style.");
  }
  const snapshotKbs = (rawConfig as { knowledge_base_ids?: string[] }).knowledge_base_ids;
  const kbIds = [...new Set(snapshotKbs ?? ((await supabaseAdmin.from("agent_knowledge_bases").select("knowledge_base_id").eq("agent_id", opts.agentId).eq("workspace_id", opts.workspaceId)).data ?? []).map((r) => r.knowledge_base_id))];
  if (kbIds.length) {
    const { data: kbs, error } = await supabaseAdmin.from("knowledge_bases").select("id").eq("workspace_id", opts.workspaceId).in("id", kbIds);
    if (error || kbs?.length !== kbIds.length) throw new Error("Knowledge base is not available in this workspace");
  }
  const { agentBindings } = await import("../tools/bindings.server");
  const bindings = await agentBindings(opts.workspaceId, opts.agentId, opts.agentVersion);
  const tools = await Promise.all(bindings.map(async (binding) => {
    const { data: rev, error } = await supabaseAdmin.from("tool_revisions").select("description, input_schema, invocation_hash").eq("id", binding.tool_revision_id).eq("tool_id", binding.tool_id).eq("workspace_id", opts.workspaceId).single();
    if (error || !rev) throw new Error("Bound tool revision not found");
    const { data: approval } = await supabaseAdmin.from("tool_approvals").select("status, risk_class, confirmation_minimum, allowed_contexts").eq("tool_revision_id", binding.tool_revision_id).eq("workspace_id", opts.workspaceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (approval?.status !== "approved" || approval.risk_class === "restricted") throw new Error(`Tool ${binding.alias} is not approved for deployment`);
    if (!approval.allowed_contexts?.includes(opts.purpose === "setup_preview" ? "setup_preview" : "voice_session")) throw new Error(`Tool ${binding.alias} is not approved for ${opts.purpose === "setup_preview" ? "this enquiry preview" : "live calls"}`);
    return { tool_id: binding.tool_id, tool_revision_id: binding.tool_revision_id, alias: binding.alias, description: rev.description, input_schema: rev.input_schema, invocation_hash: rev.invocation_hash, requirement: binding.requirement ?? "required", needs_confirmation: binding.confirmation_mode === "always" || approval.risk_class !== "read" || approval.confirmation_minimum !== "none", confirmation_mode: binding.confirmation_mode };
  }));

  const bundle = {
    schema: BUNDLE_SCHEMA,
    agent: { id: opts.agentId, version: opts.agentVersion },
    workspace_id: opts.workspaceId,
    environment_id: opts.environmentId,
    ...(opts.purpose ? { purpose: opts.purpose } : {}),
    capabilities: { version: RUNTIME_CAPABILITY_VERSION, confirmation: supportsExactReadback(config) ? "exact_readback" : "unsupported" },
    call_behavior: callLimits(config),
    prompt: {
      persona: config.persona,
      instructions: effectiveInstructions(config),
      greeting: config.greeting,
      language: config.language,
      speechStyle: config.speechStyle ?? "default",
      guardrails: [config.guardrails, config.callBehavior.bannedTopics.trim() ? `Do not discuss these topics: ${config.callBehavior.bannedTopics.trim()}` : ""].filter(Boolean).join("\n"),
      handoff: config.handoff,
    },
    runtime: config.runtime,
    knowledge: { knowledge_base_ids: kbIds, top_k: 5 },
    tools,
  };
  const sum = await checksum(bundle);
  const { data, error } = await supabaseAdmin
    .from("runtime_bundles")
    .insert({
      workspace_id: opts.workspaceId,
      agent_id: opts.agentId,
      agent_version: opts.agentVersion,
      environment_id: opts.environmentId,
      bundle: bundle as never,
      checksum: sum,
      created_by: opts.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not compile bundle");
  return { bundleId: data.id, checksum: sum, bundle };
}

// Provider credentials the runtime needs for this bundle (never persisted in the bundle).
export async function bundleCredentials(orgId: string, runtime: ReturnType<typeof normalizeConfig>["runtime"]) {
  const { resolveCredential } = await import("../providers/registry.server");
  const providers = runtime.mode === "native"
    ? [runtime.realtime.provider]
    : [runtime.stt.provider, runtime.llm.provider, runtime.tts.provider];
  const out: Record<string, string> = {};
  for (const p of new Set(providers)) out[p] = (await resolveCredential(orgId, p)).apiKey;
  return out;
}
