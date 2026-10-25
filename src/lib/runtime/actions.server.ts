import { z } from "zod";
import { classifyConfirmation } from "./confirmation";
import { sha256Hex } from "../tools/schema";

const Confirmation = z.object({
  session_id: z.string().uuid(), pending_action_id: z.string().uuid(), turn_id: z.string().min(1).max(128),
  transcript: z.string().max(4000), stt_confidence: z.number().min(0).max(1).optional(),
  interrupted: z.boolean(), summary_finished_at: z.number(), received_at: z.number(),
});

export async function confirmAction(raw: unknown) {
  const input = Confirmation.parse(raw);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: pa } = await db.from("tool_pending_actions").select("*").eq("id", input.pending_action_id).eq("session_id", input.session_id).eq("status", "pending").single();
  if (!pa) return { status: "invalidated" as const };
  const { data: invocation } = await db.from("tool_invocations").select("*").eq("id", pa.invocation_id).eq("session_id", input.session_id).eq("context_kind", "voice_session").single();
  if (!invocation?.tool_id) return { status: "invalidated" as const };
  const { data: def } = await db.from("tool_definitions").select("stable_slug").eq("id", invocation.tool_id).eq("workspace_id", pa.workspace_id).single();
  const { sessionBinding } = await import("../tools/bindings.server");
  const { session, binding } = await sessionBinding(input.session_id, def?.stable_slug ?? "");
  if (session.workspace_id !== pa.workspace_id || binding.tool_revision_id !== pa.tool_revision_id) return { status: "invalidated" as const };
  const { executePendingAction } = await import("../tools/gateway.server");
  const evidence = { turn_id: input.turn_id, transcript_hash: await sha256Hex(input.transcript), confidence: input.stt_confidence ?? null, method: "lexicon", received_at: input.received_at };
  const expired = Date.parse(pa.expires_at) <= Date.now();
  const timingInvalid = input.interrupted || input.summary_finished_at < Date.parse(pa.created_at) || input.received_at < input.summary_finished_at || input.received_at > Date.now() + 1000 || Date.now() - input.received_at > 60_000;
  const { error: replay } = await db.from("runtime_nonces").insert({ nonce: `confirmation:${input.session_id}:${input.turn_id}`, expires_at: new Date(Date.now() + 300_000).toISOString() });
  if (replay) return { status: "invalidated" as const };
  const decision = classifyConfirmation(input.transcript, input.stt_confidence);
  const prior = pa.evidence as { reprompted?: boolean } | null;
  if (!expired && !timingInvalid && decision === "unclear" && !prior?.reprompted) {
    const { error } = await db.from("tool_pending_actions").update({ evidence: { ...evidence, reprompted: true } }).eq("id", pa.id).eq("status", "pending");
    if (error) throw new Error("Could not save confirmation evidence");
    await db.from("tool_policy_decisions").insert({ workspace_id: pa.workspace_id, invocation_id: pa.invocation_id, stage: "confirmation", policy_revision: pa.policy_revision, decision: "confirm", reason_codes: ["unclear_reprompt"], pending_action_id: pa.id });
    return { status: "reprompt" as const };
  }
  const result = await executePendingAction(pa.workspace_id, pa.id, evidence, !expired && !timingInvalid && decision === "confirm" ? "confirm" : "deny");
  return { status: expired ? "expired" as const : timingInvalid ? "invalidated" as const : decision === "confirm" ? "executed" as const : "denied" as const, result };
}

export async function cancelAction(raw: unknown) {
  const input = z.object({ session_id: z.string().uuid(), invocation_id: z.string().uuid() }).parse(raw);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: inv } = await db.from("tool_invocations").select("id, workspace_id, status").eq("id", input.invocation_id).eq("session_id", input.session_id).eq("context_kind", "voice_session").single();
  if (!inv) throw new Error("Invocation not found in session");
  // Sent writes are never cancelled or retried by the worker. Only pending work is cancelled here.
  const { data: cancelled, error } = await db.from("tool_pending_actions").update({ status: "invalidated" }).eq("invocation_id", inv.id).eq("status", "pending").select("id");
  if (error) throw new Error("Could not cancel action");
  if (cancelled?.length) await db.from("tool_invocations").update({ status: "cancelled", ended_at: new Date().toISOString() }).eq("id", inv.id).eq("status", "pending_confirmation");
  return { status: cancelled?.length ? "cancelled" : inv.status };
}
