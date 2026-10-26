import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEnquiryPack } from "./enquiry-pack";
import { evaluateEnquiryCapabilities } from "./runtime/capabilities";
import { setupSnapshot } from "./setup-preview-authority.server";
import type {
  EnquiryBusinessDraft,
  EnquiryDestination,
  EnquiryPreviewJoin,
  EnquiryPreviewResult,
  EnquirySetupState,
} from "./setup.types";

function destinationFromSetup(row: Record<string, unknown>): EnquiryDestination {
  if (row["destination_kind"] !== "google_sheets") return { kind: "callback_inbox" };
  const value = row["google_sheet_destination"] as Record<string, unknown> | null;
  const mapping = value?.["mapping"] as Extract<
    EnquiryDestination,
    { kind: "google_sheets" }
  >["mapping"];
  if (
    !value ||
    typeof row["google_connection_id"] !== "string" ||
    typeof value["spreadsheetId"] !== "string" ||
    typeof value["spreadsheetName"] !== "string" ||
    !Number.isInteger(value["worksheetId"]) ||
    typeof value["worksheetTitle"] !== "string" ||
    !mapping
  )
    throw new Error("The saved Google Sheets destination is incomplete. Choose it again.");
  return {
    kind: "google_sheets",
    connectionId: row["google_connection_id"],
    spreadsheetId: value["spreadsheetId"],
    spreadsheetName: value["spreadsheetName"],
    worksheetId: value["worksheetId"] as number,
    worksheetTitle: value["worksheetTitle"],
    mapping,
  };
}

async function database() {
  return (await import("@/integrations/supabase/client.server"))
    .supabaseAdmin as unknown as SupabaseClient;
}
async function authorize(workspaceId: string, actor: string) {
  const db = await database();
  const { data, error } = await db.rpc("release_actor_is_admin", {
    _workspace: workspaceId,
    _actor: actor,
  });
  if (error || !data) throw new Error("Workspace admin access is required for inbox previews.");
  return db;
}
function configFor(business: EnquiryBusinessDraft) {
  return JSON.parse(
    JSON.stringify({
      ...buildEnquiryPack(business),
      enquiry_business: business,
      enquiry_pack_version: 1,
    }),
  );
}
async function setupRow(db: SupabaseClient, workspaceId: string, setupId: string) {
  const { data, error } = await db
    .from("agent_setup_runs")
    .select("*")
    .eq("id", setupId)
    .eq("workspace_id", workspaceId)
    .single();
  if (error || !data) throw new Error("Enquiry setup not found in this workspace.");
  return data;
}

async function readiness(db: SupabaseClient, workspaceId: string, config: unknown) {
  const reasons = [...evaluateEnquiryCapabilities(config).reasons];
  const { mediaConfigured } = await import("./runtime/livekit.server");
  if (
    !mediaConfigured() ||
    !process.env["RUNTIME_SHARED_SECRET"] ||
    process.env["RUNTIME_SHARED_SECRET"].length < 32
  )
    reasons.push(
      "Voice preview is not configured. Ask the platform operator to connect the voice service.",
    );
  const { data: ws, error } = await db
    .from("workspaces")
    .select("org_id")
    .eq("id", workspaceId)
    .single();
  if (error || !ws) throw new Error("Workspace not found");
  const { bundleCredentials } = await import("./runtime/bundle.server");
  try {
    await bundleCredentials(
      ws.org_id,
      buildEnquiryPack({ name: "Preview", brief: "Preview readiness" }).runtime,
    );
  } catch {
    reasons.push(
      "The managed voice providers are not configured. Ask the platform operator to complete setup.",
    );
  }
  return { ready: reasons.length === 0, reasons };
}

export async function getEnquirySetupState(
  workspaceId: string,
  agentId: string,
  actor: string,
): Promise<EnquirySetupState | null> {
  const db = await authorize(workspaceId, actor);
  const { data: a, error: ae } = await db
    .from("agents")
    .select("config,name,description")
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (ae || !a) throw new Error("Assistant not found in this workspace.");
  const { data: s, error } = await db
    .from("agent_setup_runs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error)
    throw new Error(
      "Could not load enquiry setup. Apply the preview migration before using this feature.",
    );
  if (!s) return null;
  const business = a.config?.enquiry_business;
  if (!business || typeof business.name !== "string" || typeof business.brief !== "string")
    throw new Error(
      "The draft changed outside this setup. Save a new business brief before testing.",
    );
  const ready = await readiness(db, workspaceId, a.config);
  const destination = destinationFromSetup(s as Record<string, unknown>);
  if (destination.kind === "google_sheets") {
    const { data: connection } = await db
      .from("google_connections")
      .select("id,status")
      .eq("id", destination.connectionId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!connection || connection.status !== "active")
      ready.reasons.push("Reconnect Google before testing this destination.");
  }
  if ((await setupSnapshot(a.config)) !== s.snapshot_hash)
    ready.reasons.push(
      "This draft changed in another editor. Save the business brief again before testing.",
    );
  ready.ready = ready.reasons.length === 0;
  const { data: p, error: pe } = await db
    .from("setup_preview_sessions")
    .select("session_id")
    .eq("setup_id", s.id)
    .eq("workspace_id", workspaceId)
    .eq("setup_revision", s.revision)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pe) throw new Error("Could not load the latest preview");
  let receipt = null;
  if (p?.session_id)
    receipt =
      (await getEnquiryPreviewState(workspaceId, s.id, p.session_id, actor)).receipt ?? null;
  return {
    setupId: s.id,
    agentId,
    revision: s.revision,
    businessDraft: business,
    destination,
    stage: receipt ? "saved" : p?.session_id ? "preview" : "draft",
    readiness: ready,
    latestSessionId: p?.session_id ?? null,
    receipt,
  };
}

export async function saveEnquiryDestination(
  workspaceId: string,
  setupId: string,
  actor: string,
  revision: number,
  destination:
    | { kind: "callback_inbox" }
    | {
        kind: "google_sheets";
        spreadsheetId: string;
        spreadsheetName: string;
        worksheetId: number;
        worksheetTitle: string;
        mapping: Record<string, string | null>;
      },
) {
  const db = await authorize(workspaceId, actor);
  const setup = await setupRow(db, workspaceId, setupId);
  if (setup.revision !== revision)
    throw new Error("Setup changed. Reload before choosing a destination.");
  let update: Record<string, unknown>;
  if (destination.kind === "callback_inbox") {
    update = {
      destination_kind: "callback_inbox",
      google_connection_id: null,
      google_sheet_destination: null,
      destination_updated_at: new Date().toISOString(),
      tool_id: null,
      tool_revision_id: null,
    };
  } else {
    const { data: connection, error: connectionError } = await db
      .from("google_connections")
      .select("id,status")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .maybeSingle();
    if (connectionError || !connection)
      throw new Error("Connect Google before choosing a spreadsheet.");
    const sheets = await import("./google-sheets.server");
    const tabs = await sheets.listGoogleWorksheets(workspaceId, destination.spreadsheetId);
    const tab = tabs.worksheets.find((item) => item.id === destination.worksheetId);
    if (!tab || tab.title !== destination.worksheetTitle || tab.hidden)
      throw new Error("The selected worksheet is no longer available.");
    const headers = await sheets.getGoogleSheetHeaders(
      workspaceId,
      destination.spreadsheetId,
      tab.title,
    );
    const required = [
      destination.mapping["name"],
      destination.mapping["phone"],
      destination.mapping["reason"],
      destination.mapping["request_marker"],
      destination.mapping["record_kind"],
    ];
    if (required.some((header) => !header || !headers.includes(header)))
      throw new Error("Review the worksheet columns before saving this destination.");
    const selectedHeaders = Object.values(destination.mapping).filter(
      (header): header is string => typeof header === "string" && header.length > 0,
    );
    if (new Set(selectedHeaders).size !== selectedHeaders.length)
      throw new Error("Choose a different worksheet column for each enquiry field.");
    update = {
      destination_kind: "google_sheets",
      google_connection_id: connection.id,
      google_sheet_destination: {
        spreadsheetId: destination.spreadsheetId,
        spreadsheetName: tabs.spreadsheetName || destination.spreadsheetName,
        worksheetId: tab.id,
        worksheetTitle: tab.title,
        mapping: destination.mapping,
      },
      destination_updated_at: new Date().toISOString(),
      tool_id: null,
      tool_revision_id: null,
    };
  }
  const { data: changed, error } = await db
    .from("agent_setup_runs")
    .update({ ...update, revision: revision + 1 })
    .eq("id", setupId)
    .eq("workspace_id", workspaceId)
    .eq("revision", revision)
    .select("agent_id")
    .maybeSingle();
  if (error || !changed)
    throw new Error("Setup changed while saving the destination. Reload and try again.");
  return (await getEnquirySetupState(workspaceId, changed.agent_id, actor))!;
}

export async function beginEnquiry(
  workspaceId: string,
  actor: string,
  requestKey: string,
  business: EnquiryBusinessDraft,
  agentId?: string,
) {
  const db = await authorize(workspaceId, actor);
  const config = configFor(business);
  const { data, error } = await db.rpc("begin_enquiry_setup", {
    _ws: workspaceId,
    _actor: actor,
    _request: requestKey,
    _agent: agentId ?? null,
    _name: business.name,
    _config: config,
    _hash: await setupSnapshot(config),
  });
  if (error || !data) throw new Error(error?.message ?? "Could not prepare the enquiry draft");
  return (await getEnquirySetupState(workspaceId, data.agent_id, actor))!;
}

export async function saveEnquiry(
  workspaceId: string,
  setupId: string,
  actor: string,
  revision: number,
  business: EnquiryBusinessDraft,
) {
  const db = await authorize(workspaceId, actor);
  const config = configFor(business);
  const { data, error } = await db.rpc("save_enquiry_setup", {
    _ws: workspaceId,
    _setup: setupId,
    _actor: actor,
    _revision: revision,
    _name: business.name,
    _config: config,
    _hash: await setupSnapshot(config),
  });
  if (error || !data) throw new Error(error?.message ?? "Could not save the business brief");
  return (await getEnquirySetupState(workspaceId, data.agent_id, actor))!;
}

export async function startEnquiry(
  workspaceId: string,
  setupId: string,
  actor: string,
  revision: number,
  requestKey: string,
): Promise<EnquiryPreviewJoin> {
  const db = await authorize(workspaceId, actor);
  const s = await setupRow(db, workspaceId, setupId);
  const state = await getEnquirySetupState(workspaceId, s.agent_id, actor);
  if (!state?.readiness.ready || s.revision !== revision)
    throw new Error(
      state?.readiness.reasons.join(" ") || "Reload the latest saved draft before testing.",
    );
  const { prepareEnquiryPreviewAction } = await import("./tools.functions");
  const action = await prepareEnquiryPreviewAction(
    workspaceId,
    s.agent_id,
    actor,
    state.destination,
  );
  const { data: updated, error: updateError } = await db
    .from("agent_setup_runs")
    .update({ tool_id: action.toolId, tool_revision_id: action.revisionId })
    .eq("id", setupId)
    .eq("workspace_id", workspaceId)
    .eq("revision", revision)
    .select("id")
    .single();
  if (updateError || !updated)
    throw new Error("The draft changed while preparing the test. Reload it.");
  const { data: claim, error } = await db.rpc("claim_enquiry_preview", {
    _ws: workspaceId,
    _setup: setupId,
    _actor: actor,
    _revision: revision,
    _request: requestKey,
  });
  if (error || !claim) throw new Error(error?.message ?? "Could not start the preview");
  const p = claim.preview;
  let sessionId = p.session_id;
  let sessionRef: string;
  if (!claim.claimed) {
    if (p.status === "preparing")
      throw new Error(
        "Your preview is still preparing. Wait a moment, then retry the same request.",
      );
    if (p.status !== "ready" || !sessionId || p.expires_at <= new Date().toISOString())
      throw new Error("This preview attempt ended. Start a new test.");
    const { data: conv } = await db
      .from("conversations")
      .select("session_ref,status")
      .eq("id", sessionId)
      .eq("workspace_id", workspaceId)
      .single();
    if (!conv || conv.status !== "active")
      throw new Error("This preview attempt ended. Start a new test.");
    sessionRef = conv.session_ref;
  } else {
    try {
      const { compileBundle } = await import("./runtime/bundle.server");
      const { bundleId } = await compileBundle({
        workspaceId,
        agentId: s.agent_id,
        agentVersion: null,
        environmentId: null,
        userId: actor,
        purpose: "setup_preview",
      });
      sessionRef = `preview-${p.id}`;
      const { data: conv, error: ce } = await db
        .from("conversations")
        .insert({
          workspace_id: workspaceId,
          agent_id: s.agent_id,
          channel: "web_test",
          status: "active",
          started_by: actor,
          runtime_mode: "composable",
          session_ref: sessionRef,
          runtime_bundle_id: bundleId,
        })
        .select("id")
        .single();
      if (ce || !conv) throw new Error("Could not open the preview session");
      sessionId = conv.id;
      const { data: attached, error: pe } = await db
        .from("setup_preview_sessions")
        .update({ session_id: sessionId, bundle_id: bundleId, status: "ready" })
        .eq("id", p.id)
        .eq("status", "preparing")
        .select("id")
        .single();
      if (pe || !attached) throw new Error("Could not persist preview authorization");
    } catch {
      await db.from("setup_preview_sessions").update({ status: "failed" }).eq("id", p.id);
      throw new Error("Preview preparation failed. Save the brief and start a new test.");
    }
  }
  const { data: conv } = await db
    .from("conversations")
    .select("*")
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId)
    .single();
  const { previewAuthority } = await import("./setup-preview-authority.server");
  if (!conv) throw new Error("Preview session not found");
  await previewAuthority(conv, "setup_preview");
  const { createSessionJoin } = await import("./runtime/livekit.server");
  const join = await createSessionJoin({
    sessionRef: sessionRef!,
    identity: `user-${actor}`,
    metadata: { session_id: sessionId },
  });
  return { ...join, sessionId, snapshotHash: p.snapshot_hash };
}

export async function getEnquiryPreviewState(
  workspaceId: string,
  setupId: string,
  sessionId: string,
  actor: string,
): Promise<EnquiryPreviewResult> {
  const db = await authorize(workspaceId, actor);
  const s = await setupRow(db, workspaceId, setupId);
  const { data: p, error } = await db
    .from("setup_preview_sessions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("setup_id", setupId)
    .eq("session_id", sessionId)
    .single();
  if (error || !p) throw new Error("Preview not found in this setup");
  if (p.setup_revision !== s.revision || p.snapshot_hash !== s.snapshot_hash)
    return {
      state: "failed",
      safeError: "The business brief changed. Test the saved draft again.",
    };
  const { data: c, error: ce } = await db
    .from("conversations")
    .select("id,status,started_at,privacy_purged_at,agent_id,runtime_bundle_id")
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId)
    .eq("agent_id", s.agent_id)
    .single();
  if (ce || !c || c.runtime_bundle_id !== p.bundle_id)
    throw new Error("Preview session is not valid");
  const { cutoff } = await (await import("./privacy.server")).workspaceCallPrivacy(workspaceId);
  if (c.privacy_purged_at || c.started_at < cutoff)
    return { state: "failed", safeError: "This preview has passed the call retention period." };
  const { data: invocations, error: ie } = await db
    .from("tool_invocations")
    .select("id,status,output_redacted,ended_at")
    .eq("workspace_id", workspaceId)
    .eq("session_id", sessionId)
    .eq("tool_id", s.tool_id)
    .eq("tool_revision_id", s.tool_revision_id)
    .order("started_at", { ascending: false })
    .limit(20);
  if (ie) throw new Error("Could not load the saved result");
  for (const i of invocations ?? []) {
    const output = i.output_redacted as Record<string, unknown> | null;
    const callbackSaved =
      destinationFromSetup(s as Record<string, unknown>).kind === "callback_inbox" &&
      output?.["saved"] === true &&
      output?.["request_id"] === i.id;
    const sheetSaved =
      destinationFromSetup(s as Record<string, unknown>).kind === "google_sheets" &&
      output?.["outcome_kind"] === "google_sheet_row" &&
      output?.["completion_state"] === "saved" &&
      output?.["request_marker"] === i.id &&
      output?.["record_kind"] === "test";
    if (i.status !== "succeeded" || (!callbackSaved && !sheetSaved)) continue;
    const { data: pending, error: pe } = await db
      .from("tool_pending_actions")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("invocation_id", i.id)
      .eq("status", "executed")
      .maybeSingle();
    if (pe) throw new Error("Could not verify caller confirmation");
    if (pending)
      return {
        state: "saved",
        receipt: {
          invocationId: i.id,
          conversationId: c.id,
          savedAt: i.ended_at,
          destination: sheetSaved ? "google_sheets" : "callback_inbox",
          notificationSent: false,
          ...(sheetSaved && typeof output?.["provider_link"] === "string"
            ? { providerLink: output["provider_link"] }
            : {}),
          ...(sheetSaved && typeof output?.["external_reference"] === "string"
            ? { externalReference: output["external_reference"] }
            : {}),
          ...(sheetSaved ? { recordKind: "test" as const } : {}),
        },
      };
  }
  if (invocations?.some((i) => i.status === "outcome_unknown"))
    return {
      state: "unknown",
      safeError:
        destinationFromSetup(s as Record<string, unknown>).kind === "google_sheets"
          ? "Google did not confirm the row. Check the selected worksheet before trying again."
          : "The save could not be verified. Check the inbox before retrying.",
    };
  if (p.expires_at <= new Date().toISOString())
    return {
      state: "failed",
      safeError: "This preview expired. Start another test.",
      nextAction: "Start a new preview",
    };
  if (c.status === "active") return { state: "active" };
  if (invocations?.some((i) => i.status === "running" || i.status === "pending_confirmation"))
    return { state: "saving" };
  return { state: "not_saved", safeError: "No confirmed enquiry was saved in this preview." };
}
