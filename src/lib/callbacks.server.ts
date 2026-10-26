import { z } from "zod";
import { decryptSecret } from "./crypto.server";

export const callbackDetails = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "Use a phone number with country code"),
    reason: z.string().trim().min(3).max(1200),
    preferred_time: z.string().trim().max(160).default("Not specified"),
    language: z
      .enum(["en", "te", "es", "fr", "de", "hi", "ru", "pt", "ja", "it", "nl"])
      .default("en"),
  })
  .strict();

// Confirmed gateway arguments are already encrypted at rest. The invocation is
// the durable callback request; its ID is the receipt and prevents replay duplicates.
export async function saveCallback(workspaceId: string, invocationId: string, args: unknown) {
  callbackDetails.parse(args);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: invocation, error: loadError } = await db
    .from("tool_invocations")
    .select("id,session_id,context_kind,status")
    .eq("id", invocationId)
    .eq("workspace_id", workspaceId)
    .single();
  if (
    loadError ||
    !invocation?.session_id ||
    invocation.context_kind !== "voice_session" ||
    invocation.status !== "running"
  )
    throw new Error("Callback requires a live confirmed call.");
  const { data: pending } = await db
    .from("tool_pending_actions")
    .select("frozen_arguments,status")
    .eq("invocation_id", invocationId)
    .eq("workspace_id", workspaceId)
    .eq("status", "executing")
    .single();
  if (
    !pending ||
    JSON.stringify(
      callbackDetails.parse(JSON.parse(await decryptSecret(pending.frozen_arguments))),
    ) !== JSON.stringify(callbackDetails.parse(args))
  )
    throw new Error("Callback confirmation does not match.");
  const output = {
    saved: true,
    request_id: invocationId,
    notification_sent: false,
    message:
      "Callback request saved in the VocollAI callback inbox. No person has been notified and no callback time is guaranteed.",
  };
  const { data, error } = await db
    .from("tool_invocations")
    .update({ output_redacted: output })
    .eq("id", invocationId)
    .eq("workspace_id", workspaceId)
    .eq("status", "running")
    .select("id")
    .single();
  if (error || !data) throw new Error("Callback request could not be saved.");
  return output;
}

export async function callbackInbox(workspaceId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { cutoff } = await (await import("./privacy.server")).workspaceCallPrivacy(workspaceId);
  const { data: connectors, error: connectorError } = await db
    .from("tool_connectors")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("type", "native")
    .contains("configuration", { operation: "save_callback" });
  if (connectorError) throw new Error("Could not load callback inbox.");
  if (!connectors?.length) return [];
  const { data: tools, error: toolError } = await db
    .from("tool_definitions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .in(
      "connector_id",
      connectors.map((c) => c.id),
    )
    .eq("source_operation_id", "save_callback");
  if (toolError) throw new Error("Could not load callback inbox.");
  if (!tools?.length) return [];
  const { data: requests, error } = await db
    .from("tool_invocations")
    .select("id,session_id,started_at,output_redacted")
    .eq("workspace_id", workspaceId)
    .in(
      "tool_id",
      tools.map((t) => t.id),
    )
    .eq("status", "succeeded")
    .gte("started_at", cutoff)
    .contains("output_redacted", { saved: true, notification_sent: false })
    .order("started_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Could not load callback requests.");
  return Promise.all(
    (requests ?? []).map(async (request) => {
      const { data: conversation, error: conversationError } = await db
        .from("conversations")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("id", request.session_id!)
        .gte("started_at", cutoff)
        .is("privacy_purged_at" as never, null)
        .maybeSingle();
      if (conversationError) throw new Error("Could not load callback privacy state.");
      if (!conversation) return null;
      const { data: pa, error } = await db
        .from("tool_pending_actions")
        .select("frozen_arguments")
        .eq("workspace_id", workspaceId)
        .eq("invocation_id", request.id)
        .eq("status", "executed")
        .single();
      if (error || !pa) throw new Error("Could not load a confirmed callback request.");
      return {
        id: request.id,
        sessionId: request.session_id,
        createdAt: request.started_at,
        ...callbackDetails.parse(JSON.parse(await decryptSecret(pa.frozen_arguments))),
      };
    }),
  ).then((rows) => rows.filter((row): row is NonNullable<typeof row> => row !== null));
}
